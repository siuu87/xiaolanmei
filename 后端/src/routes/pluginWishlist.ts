import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pluginWishlist, wishFolders } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 灵感与待办池（Inbox & Todo 统一模块 / plugin_wishlist）。
 *
 * 2026-10-18 重构：由「三态 kind（idea/wish/todo）+ done」收敛为二态统一模型
 * - `isTodo`    false = 灵感（Inbox）｜true = 待办任务（Todo）
 * - `completed` 完成状态，`completedAt` 在完成时写入、取消完成时清空
 *
 * 2026-11-13 加「夹子」（`wish_folders` + `folder_id`）：
 * 灵感会越堆越多，平铺一列找不着东西 —— 分堆 + 搜索框，像文件夹那样用。
 * 夹子单独成表（不从条目 distinct），因为允许先建一个空夹子再往里扔。
 *
 * 排序：未完成在前、已完成沉底；组内按 sortOrder 升序、再按创建时间。
 */

function toDTO(r: typeof pluginWishlist.$inferSelect) {
  return {
    id: r.id,
    content: r.content,
    isTodo: r.isTodo,
    completed: r.completed,
    completedAt: r.completedAt ?? null,
    sortOrder: r.sortOrder,
    /** 夹子 id，空串 = 未归档（2026-11-14 起界面不再用它，保留字段兼容 AI 与旧数据） */
    folderId: r.folderId ?? '',
    /** 标签数组（库里是逗号分隔，出接口时拆开） */
    tags: (r.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** 标签去重、去空、限长，再拼成逗号串入库 */
function joinTags(v: unknown): string | null {
  if (v === undefined) return null;
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const seen = new Set<string>();
  arr.forEach((t) => {
    if (typeof t !== 'string') return;
    const s = t.trim().replace(/,/g, '').slice(0, 24);
    if (s) seen.add(s);
  });
  return [...seen].slice(0, 12).join(',');
}

function toFolderDTO(r: typeof wishFolders.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
  };
}

/** 未完成在前（completed=0），已完成沉底；同组内按 sortOrder 升序、再按创建时间。 */
function listAll() {
  return db
    .select()
    .from(pluginWishlist)
    .all()
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    })
    .map(toDTO);
}

function listFolders() {
  return db
    .select()
    .from(wishFolders)
    .all()
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
    .map(toFolderDTO);
}

/** 按名字找夹子（没删的），用于 AI 按名字归档时「有就复用、没有才建」。 */
export function findFolderByName(name: string) {
  const target = name.trim();
  if (!target) return null;
  return (
    db
      .select()
      .from(wishFolders)
      .all()
      .find((r) => r.deletedAt == null && r.name === target) ?? null
  );
}

/** 新建夹子；同名的直接复用（返回已有 id），避免 AI 反复建出「旅行 / 旅行」两个夹子。 */
export function createFolder(name: string): string {
  const target = name.trim();
  if (!target) return '';
  const exist = findFolderByName(target);
  if (exist) return exist.id;
  const id = newId();
  const ts = now();
  const maxRow = db
    .select({ max: wishFolders.sortOrder })
    .from(wishFolders)
    .all()
    .reduce((m, r) => Math.max(m, r.max ?? 0), 0);
  db.insert(wishFolders)
    .values({ id, name: target, sortOrder: maxRow + 10, createdAt: ts, updatedAt: ts })
    .run();
  return id;
}

export async function pluginWishlistRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plugin-wishlist', async () => listAll());

  /** 快捷录入：回车即存。默认存为灵感（isTodo=false），传 isTodo=true 则存为待办。 */
  app.post('/plugin-wishlist', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      content?: string;
      isTodo?: boolean;
      folderId?: string;
      tags?: unknown;
    };
    const content = body.content?.trim();
    if (!content) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const maxRow = db
      .select({ max: pluginWishlist.sortOrder })
      .from(pluginWishlist)
      .all()
      .reduce((m, r) => Math.max(m, r.max ?? 0), 0);
    db.insert(pluginWishlist)
      .values({
        id,
        content,
        isTodo: body.isTodo ?? false,
        completed: false,
        completedAt: null,
        sortOrder: maxRow + 10,
        folderId: body.folderId?.trim() || '',
        tags: joinTags(body.tags) ?? '',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/plugin-wishlist/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      content?: string;
      isTodo?: boolean;
      completed?: boolean;
      sortOrder?: number;
      folderId?: string;
      tags?: unknown;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.content !== undefined) set.content = body.content.trim();
    const tagStr = joinTags(body.tags);
    if (tagStr !== null) set.tags = tagStr;
    if (body.isTodo !== undefined) set.isTodo = !!body.isTodo;
    if (body.completed !== undefined) {
      const done = !!body.completed;
      set.completed = done;
      // 完成时记下时刻，取消完成则清空（不留悬空时间戳）
      set.completedAt = done ? now() : null;
    }
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;
    if (body.folderId !== undefined) set.folderId = body.folderId.trim();

    const result = db.update(pluginWishlist).set(set).where(eq(pluginWishlist.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '条目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/plugin-wishlist/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(pluginWishlist).set({ deletedAt: ts, updatedAt: ts }).where(eq(pluginWishlist.id, id)).run();
    return { ok: true };
  });

  /** 批量重排：传入完整 id 顺序，后端按数组下标重写 sortOrder。 */
  app.post('/plugin-wishlist/reorder', async (req, reply) => {
    const body = (req.body ?? {}) as { ids?: unknown };
    if (!Array.isArray(body.ids) || !body.ids.every((x) => typeof x === 'string')) {
      reply.code(400).send({ message: 'ids 必须是字符串数组' });
      return;
    }
    const ids = body.ids as string[];
    const ts = now();
    ids.forEach((id, idx) => {
      db.update(pluginWishlist)
        .set({ sortOrder: idx * 10, updatedAt: ts })
        .where(eq(pluginWishlist.id, id))
        .run();
    });
    reply.send({ ok: true });
  });

  /** 一键清理（归档）已完成项：软删所有 completed=1 的条目，返回清理条数。 */
  app.post('/plugin-wishlist/clear-completed', async () => {
    const ts = now();
    const result = db
      .update(pluginWishlist)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(and(eq(pluginWishlist.completed, true), isNull(pluginWishlist.deletedAt)))
      .run();
    return { ok: true, cleared: result.changes ?? 0 };
  });

  /* ------------------------------ 夹子 ------------------------------ */

  /** 夹子列表，带每个夹子里的条目数（前端画 chips 用，不必自己再数）。 */
  app.get('/plugin-wishlist/folders', async () => {
    const items = listAll();
    return listFolders().map((f) => ({
      ...f,
      count: items.filter((i) => i.folderId === f.id).length,
    }));
  });

  app.post('/plugin-wishlist/folders', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = createFolder(name);
    reply.code(201).send({ id, name });
  });

  app.patch('/plugin-wishlist/folders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const result = db
      .update(wishFolders)
      .set({ name, updatedAt: now() })
      .where(eq(wishFolders.id, id))
      .run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '夹子不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  /** 删夹子：软删夹子本身，里面的条目退回「未归档」——不跟着一起删，那是两回事。 */
  app.delete('/plugin-wishlist/folders/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(wishFolders).set({ deletedAt: ts, updatedAt: ts }).where(eq(wishFolders.id, id)).run();
    db.update(pluginWishlist)
      .set({ folderId: '', updatedAt: ts })
      .where(eq(pluginWishlist.folderId, id))
      .run();
    return { ok: true };
  });
}

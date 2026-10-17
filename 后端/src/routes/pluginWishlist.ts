import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pluginWishlist } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 灵感与待办池（Inbox & Todo 统一模块 / plugin_wishlist）。
 *
 * 2026-10-18 重构：由「三态 kind（idea/wish/todo）+ done」收敛为二态统一模型
 * - `isTodo`    false = 灵感（Inbox）｜true = 待办任务（Todo）
 * - `completed` 完成状态，`completedAt` 在完成时写入、取消完成时清空
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
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
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

export async function pluginWishlistRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plugin-wishlist', async () => listAll());

  /** 快捷录入：回车即存。默认存为灵感（isTodo=false），传 isTodo=true 则存为待办。 */
  app.post('/plugin-wishlist', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: string; content?: string; isTodo?: boolean };
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
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.content !== undefined) set.content = body.content.trim();
    if (body.isTodo !== undefined) set.isTodo = !!body.isTodo;
    if (body.completed !== undefined) {
      const done = !!body.completed;
      set.completed = done;
      // 完成时记下时刻，取消完成则清空（不留悬空时间戳）
      set.completedAt = done ? now() : null;
    }
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

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
}

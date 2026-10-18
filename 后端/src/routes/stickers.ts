import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { stickerCategories, stickers } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 自定义表情包路由（阶段 7 收尾，2026-10-18 加分类）。
 *
 * - 设置页上传图片 → `/api/upload` 落盘，这里只存 `/api/files/xxx` 引用；
 * - 2026-10-18 起支持**分类**：`sticker_categories` + `stickers.category_id`。
 *   `id='default'` 的「默认」分类由 `db/client.ts` 幂等插入，**不允许删除**
 *   （删了之后未指定分类的新增表情会指向不存在的 id）。
 */

const DEFAULT_CATEGORY = 'default';

function toDTO(s: typeof stickers.$inferSelect) {
  return { id: s.id, name: s.name, url: s.url, categoryId: s.categoryId };
}

/** 该分类是否存在（未软删） */
function categoryExists(id: string): boolean {
  return !!db
    .select()
    .from(stickerCategories)
    .where(and(eq(stickerCategories.id, id), isNull(stickerCategories.deletedAt)))
    .get();
}

export async function stickerRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------ 分类 ------------------------------ */

  app.get('/sticker-categories', async () => {
    const cats = db
      .select()
      .from(stickerCategories)
      .all()
      .filter((c) => c.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

    const all = db
      .select()
      .from(stickers)
      .all()
      .filter((s) => s.deletedAt == null);

    return cats.map((c) => ({
      id: c.id,
      name: c.name,
      count: all.filter((s) => s.categoryId === c.id).length,
    }));
  });

  app.post('/sticker-categories', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    if (!name) {
      reply.code(400).send({ message: '分类名不能为空' });
      return;
    }
    if (name.length > 12) {
      reply.code(400).send({ message: '分类名最多 12 个字' });
      return;
    }
    const dup = db
      .select()
      .from(stickerCategories)
      .all()
      .find((c) => c.deletedAt == null && c.name === name);
    if (dup) {
      reply.code(409).send({ message: `已经有叫「${name}」的分类了` });
      return;
    }
    const id = newId();
    const ts = now();
    const maxOrder = db
      .select()
      .from(stickerCategories)
      .all()
      .reduce((m, c) => Math.max(m, c.sortOrder), 0);
    db.insert(stickerCategories)
      .values({ id, name, sortOrder: maxOrder + 10, createdAt: ts, updatedAt: ts })
      .run();
    reply.code(201).send({ id, name, count: 0 });
  });

  app.patch('/sticker-categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!categoryExists(id)) {
      reply.code(404).send({ message: '分类不存在' });
      return;
    }
    const name = String(body.name ?? '').trim();
    if (!name) {
      reply.code(400).send({ message: '分类名不能为空' });
      return;
    }
    if (name.length > 12) {
      reply.code(400).send({ message: '分类名最多 12 个字' });
      return;
    }
    const dup = db
      .select()
      .from(stickerCategories)
      .all()
      .find((c) => c.deletedAt == null && c.id !== id && c.name === name);
    if (dup) {
      reply.code(409).send({ message: `已经有叫「${name}」的分类了` });
      return;
    }
    db.update(stickerCategories).set({ name, updatedAt: now() }).where(eq(stickerCategories.id, id)).run();
    return { ok: true };
  });

  /**
   * 删除分类：**表情包不删**，全部搬回「默认」分类。
   * 删分类顺手把表情一起删掉太狠了 —— 用户只是想归类，不是想清空。
   */
  app.delete('/sticker-categories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === DEFAULT_CATEGORY) {
      reply.code(400).send({ message: '「默认」分类不能删除' });
      return;
    }
    if (!categoryExists(id)) {
      reply.code(404).send({ message: '分类不存在' });
      return;
    }
    const ts = now();
    db.update(stickers)
      .set({ categoryId: DEFAULT_CATEGORY, updatedAt: ts })
      .where(and(eq(stickers.categoryId, id), isNull(stickers.deletedAt)))
      .run();
    db.update(stickerCategories).set({ deletedAt: ts, updatedAt: ts }).where(eq(stickerCategories.id, id)).run();
    return { ok: true, movedToDefault: true };
  });

  /* ------------------------------ 表情 ------------------------------ */

  app.get('/stickers', async () => {
    return db
      .select()
      .from(stickers)
      .all()
      .filter((s) => s.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map(toDTO);
  });

  app.post('/stickers', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown> & { id?: string };
    const name = String(body.name ?? '').trim();
    const url = String(body.url ?? '').trim();
    if (!name || !url) {
      reply.code(400).send({ message: 'name 和 url 必填' });
      return;
    }
    const wanted = String(body.categoryId ?? '').trim() || DEFAULT_CATEGORY;
    const categoryId = categoryExists(wanted) ? wanted : DEFAULT_CATEGORY;
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(stickers)
      .values({ id, name, url, categoryId, sortOrder: 0, createdAt: ts, updatedAt: ts })
      .run();
    reply.code(201).send({ id, categoryId, createdAt: ts });
  });

  /** 改名 / 换分类（设置页里把表情挪到另一个分类就靠它） */
  app.patch('/stickers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .select()
      .from(stickers)
      .where(and(eq(stickers.id, id), isNull(stickers.deletedAt)))
      .get();
    if (!row) {
      reply.code(404).send({ message: '表情不存在' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Partial<typeof stickers.$inferInsert> = { updatedAt: now() };
    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) {
        reply.code(400).send({ message: '名称不能为空' });
        return;
      }
      patch.name = name;
    }
    if (typeof body.categoryId === 'string' && body.categoryId.trim()) {
      const target = body.categoryId.trim();
      if (!categoryExists(target)) {
        reply.code(400).send({ message: '目标分类不存在' });
        return;
      }
      patch.categoryId = target;
    }
    db.update(stickers).set(patch).where(eq(stickers.id, id)).run();
    return { ok: true };
  });

  app.delete('/stickers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(stickers).set({ deletedAt: ts, updatedAt: ts }).where(eq(stickers.id, id)).run();
    return { ok: true };
  });
}

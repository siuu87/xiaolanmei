import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pluginWishlist } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 灵感待办池（BM 大方案模块③ / plugin_wishlist）。
 * 收集「灵感 / 心愿 / 待办」三类条目，支持增删改、完成态、手动排序。
 * kind: 'idea' 灵感 | 'wish' 心愿 | 'todo' 待办
 */

export type WishKind = 'idea' | 'wish' | 'todo';

function isKind(v: unknown): v is WishKind {
  return v === 'idea' || v === 'wish' || v === 'todo';
}

function toDTO(r: typeof pluginWishlist.$inferSelect) {
  return {
    id: r.id,
    content: r.content,
    kind: (r.kind === 'wish' || r.kind === 'todo' ? r.kind : 'idea') as WishKind,
    done: r.done,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** 未完成在前（done=0），已完成沉底；同组内按 sortOrder 升序、再按创建时间。 */
function listAll() {
  return db
    .select()
    .from(pluginWishlist)
    .all()
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    })
    .map(toDTO);
}

export async function pluginWishlistRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plugin-wishlist', async () => listAll());

  app.post('/plugin-wishlist', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: string; content?: string; kind?: string; done?: boolean };
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
        kind: isKind(body.kind) ? body.kind! : 'idea',
        done: body.done ?? false,
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
      kind?: string;
      done?: boolean;
      sortOrder?: number;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.content !== undefined) set.content = body.content.trim();
    if (body.kind !== undefined) set.kind = isKind(body.kind) ? body.kind : 'idea';
    if (body.done !== undefined) set.done = body.done;
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
}

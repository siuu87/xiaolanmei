import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { moments } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 心动收藏路由（2026-11-18 三十四改）：聊天里长按「收进心动」的句子，
 * /moments 页按日期分组翻。软删（deleted_at），与 memorials 同一套。
 */
function toDTO(m: typeof moments.$inferSelect) {
  return { id: m.id, content: m.content, tag: m.tag, pinned: m.pinned, createdAt: m.createdAt };
}

export async function momentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/moments', async () => {
    return db
      .select()
      .from(moments)
      .all()
      .filter((m) => m.deletedAt == null)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/moments', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: string; content?: string; tag?: string };
    const content = body.content?.trim();
    if (!content) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(moments)
      .values({
        id,
        content: content.slice(0, 2000),
        tag: body.tag?.trim().slice(0, 16) ?? '',
        pinned: false,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/moments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { content?: string; tag?: string; pinned?: boolean };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.content !== undefined) set.content = body.content.trim().slice(0, 2000);
    if (body.tag !== undefined) set.tag = body.tag.trim().slice(0, 16);
    if (body.pinned !== undefined) set.pinned = body.pinned;

    const result = db.update(moments).set(set).where(eq(moments.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '心动收藏不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/moments/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(moments).set({ deletedAt: ts, updatedAt: ts }).where(eq(moments.id, id)).run();
    return { ok: true };
  });
}

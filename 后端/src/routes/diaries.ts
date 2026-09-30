import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { diaries } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 日记路由（阶段 7 收尾）：情侣双方日记的持久化。
 * 前端用 crypto.randomUUID 生成 id 原样落库（与 messages 一致），后端做哑存储。
 */

function toDTO(d: typeof diaries.$inferSelect) {
  return { id: d.id, date: d.date, author: d.author, content: d.content, createdAt: d.createdAt };
}

export async function diaryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/diaries', async () => {
    return db
      .select()
      .from(diaries)
      .all()
      .filter((d) => d.deletedAt == null)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/diaries', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: string; date?: string; author?: string; content?: string };
    const date = body.date?.trim();
    const content = body.content?.trim();
    if (!date || !content) {
      reply.code(400).send({ message: 'date 和 content 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(diaries)
      .values({
        id,
        date,
        author: body.author === 'partner' ? 'partner' : 'me',
        content,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.delete('/diaries/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(diaries).set({ deletedAt: ts, updatedAt: ts }).where(eq(diaries.id, id)).run();
    return { ok: true };
  });
}

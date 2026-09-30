import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memorials } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 纪念日路由（阶段 7 收尾）：纪念日 / 倒数日的 CRUD。
 */

function toDTO(m: typeof memorials.$inferSelect) {
  return { id: m.id, title: m.title, date: m.date, repeat: m.repeat, pinned: m.pinned };
}

export async function memorialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/memorials', async () => {
    return db
      .select()
      .from(memorials)
      .all()
      .filter((m) => m.deletedAt == null)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/memorials', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      title?: string;
      date?: string;
      repeat?: string;
      pinned?: boolean;
    };
    const title = body.title?.trim();
    const date = body.date?.trim();
    if (!title || !date) {
      reply.code(400).send({ message: 'title 和 date 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(memorials)
      .values({
        id,
        title,
        date,
        repeat: body.repeat ?? 'none',
        pinned: body.pinned ?? false,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/memorials/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      title?: string;
      date?: string;
      repeat?: string;
      pinned?: boolean;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) set.title = body.title.trim();
    if (body.date !== undefined) set.date = body.date;
    if (body.repeat !== undefined) set.repeat = body.repeat;
    if (body.pinned !== undefined) set.pinned = body.pinned;

    const result = db.update(memorials).set(set).where(eq(memorials.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '纪念日不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/memorials/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(memorials).set({ deletedAt: ts, updatedAt: ts }).where(eq(memorials.id, id)).run();
    return { ok: true };
  });
}

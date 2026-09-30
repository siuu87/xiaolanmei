import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { todos } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 待办路由（阶段 7 收尾）：待办 CRUD + 完成态持久化。
 * 重复待办（daily/weekly/monthly）用 doneOn 记录最近完成的日期 key（YYYY-M-D）。
 */

function toDTO(t: typeof todos.$inferSelect) {
  return {
    id: t.id,
    text: t.text,
    note: t.note ?? undefined,
    date: t.date ?? undefined,
    repeat: t.repeat,
    done: t.done,
    doneOn: t.doneOn ?? undefined,
  };
}

export async function todoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/todos', async () => {
    return db
      .select()
      .from(todos)
      .all()
      .filter((t) => t.deletedAt == null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toDTO);
  });

  app.post('/todos', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      text?: string;
      note?: string;
      date?: string;
      repeat?: string;
    };
    const text = body.text?.trim();
    if (!text) {
      reply.code(400).send({ message: 'text 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(todos)
      .values({
        id,
        text,
        note: body.note || null,
        date: body.date || null,
        repeat: body.repeat ?? 'none',
        done: false,
        doneOn: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/todos/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      text?: string;
      note?: string | null;
      date?: string | null;
      repeat?: string;
      done?: boolean;
      doneOn?: string | null;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.text !== undefined) set.text = body.text.trim();
    if (body.note !== undefined) set.note = body.note || null;
    if (body.date !== undefined) set.date = body.date || null;
    if (body.repeat !== undefined) set.repeat = body.repeat;
    if (body.done !== undefined) set.done = body.done;
    if (body.doneOn !== undefined) set.doneOn = body.doneOn || null;

    const result = db.update(todos).set(set).where(eq(todos.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '待办不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/todos/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(todos).set({ deletedAt: ts, updatedAt: ts }).where(eq(todos.id, id)).run();
    return { ok: true };
  });
}

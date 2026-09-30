import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { messages } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

interface CreateMessageBody {
  id?: string;
  role?: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  parentId?: string | null;
  status?: string;
  model?: string | null;
  meta?: string | null; // JSON：发图附件引用等（阶段 7）
}

interface PatchMessageBody {
  content?: string;
  status?: string;
}

/**
 * 消息 CRUD（阶段 3）。树形用 parent_id 链接；删除子树由前端算出 ids 后批量软删。
 */
export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations/:id/messages', async (req) => {
    const { id } = req.params as { id: string };
    const rows = db.select().from(messages).where(eq(messages.conversationId, id)).all();
    return rows
      .filter((r) => r.deletedAt == null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        parentId: r.parentId,
        status: r.status,
        model: r.model,
        meta: r.meta,
        createdAt: r.createdAt,
      }));
  });

  app.post('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as CreateMessageBody;
    if (body.content == null) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const mid = body.id ?? newId();
    const ts = now();
    db.insert(messages)
      .values({
        id: mid,
        conversationId: id,
        role: body.role ?? 'user',
        content: body.content,
        parentId: body.parentId ?? null,
        status: body.status ?? 'done',
        model: body.model ?? null,
        meta: body.meta ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id: mid, conversationId: id, createdAt: ts });
  });

  app.patch('/messages/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as PatchMessageBody;

    const result = db
      .update(messages)
      .set({
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: now(),
      })
      .where(eq(messages.id, id))
      .run();

    if (result.changes === 0) {
      reply.code(404).send({ message: '消息不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.post('/messages/batch-delete', async (req) => {
    const body = (req.body ?? {}) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const ts = now();
    for (const id of ids) {
      db.update(messages).set({ deletedAt: ts, updatedAt: ts }).where(eq(messages.id, id)).run();
    }
    return { ok: true, count: ids.length };
  });
}

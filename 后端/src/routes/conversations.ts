import type { FastifyInstance } from 'fastify';
import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, messages } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

interface CreateConversationBody {
  id?: string;
  title?: string;
}

interface PatchConversationBody {
  title?: string;
  activeMessageId?: string | null;
  pinned?: boolean;
}

/**
 * 会话 CRUD（阶段 3）。后端做「哑存储」：前端是树形唯一事实来源，
 * 前端发来的 id 原样落库，保证 parent 链接一致。
 */
export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/conversations', async () => {
    const rows = db
      .select()
      .from(conversations)
      .where(isNull(conversations.deletedAt))
      .orderBy(desc(conversations.updatedAt))
      .all();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      model: r.model,
      activeMessageId: r.activeMessageId,
      pinned: r.pinned,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  });

  app.post('/conversations', async (req, reply) => {
    const body = (req.body ?? {}) as CreateConversationBody;
    const id = body.id ?? newId();
    const title = body.title ?? '新对话';
    const ts = now();
    db.insert(conversations)
      .values({ id, title, pinned: false, createdAt: ts, updatedAt: ts })
      .run();
    reply.code(201).send({ id, title, activeMessageId: null, pinned: false, createdAt: ts, updatedAt: ts });
  });

  app.patch('/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as PatchConversationBody;

    const result = db
      .update(conversations)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.activeMessageId !== undefined ? { activeMessageId: body.activeMessageId } : {}),
        ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
        updatedAt: now(),
      })
      .where(eq(conversations.id, id))
      .run();

    if (result.changes === 0) {
      reply.code(404).send({ message: '会话不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/conversations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(conversations)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(eq(conversations.id, id))
      .run();
    // 一并软删该会话所有消息
    db.update(messages)
      .set({ deletedAt: ts, updatedAt: ts })
      .where(eq(messages.conversationId, id))
      .run();
    return { ok: true };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { thoughtNotes } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 渡口念头（Thought Notes）路由 —— 「白起的内心」面板里的第二种卡片。
 *
 * 与 `/memories`（记忆锚点）**分开两张表、两个路由**：念头是当下的碎碎念，可点掉
 * （`isResolved`）；记忆是沉淀下来的事实，长期有效。前端把两者合成一条时间倒序的
 * 卡片流展示，但数据层不混。
 */

interface ThoughtBody {
  thought?: string;
  context?: string | null;
  isResolved?: boolean;
}

function toDTO(t: typeof thoughtNotes.$inferSelect) {
  return {
    id: t.id,
    thought: t.thought,
    context: t.context,
    isResolved: t.isResolved,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function thoughtRoutes(app: FastifyInstance): Promise<void> {
  app.get('/thoughts', async (req) => {
    const q = (req.query ?? {}) as { q?: string; resolved?: string };
    const needle = q.q?.trim().toLowerCase() ?? '';
    return db
      .select()
      .from(thoughtNotes)
      .all()
      .filter((t) => t.deletedAt == null)
      .filter((t) => {
        // 不传 resolved 就全给；'0'/'1' 分别筛未消化/已消化
        if (q.resolved === '0') return !t.isResolved;
        if (q.resolved === '1') return t.isResolved;
        return true;
      })
      .filter((t) =>
        needle
          ? t.thought.toLowerCase().includes(needle) || (t.context ?? '').toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/thoughts', async (req, reply) => {
    const body = (req.body ?? {}) as ThoughtBody;
    const thought = body.thought?.trim();
    if (!thought) {
      reply.code(400).send({ message: 'thought 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(thoughtNotes)
      .values({
        id,
        thought,
        context: body.context?.trim() || null,
        isResolved: body.isResolved ?? false,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/thoughts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as ThoughtBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.thought !== undefined) set.thought = body.thought.trim();
    if (body.context !== undefined) set.context = body.context?.trim() || null;
    if (body.isResolved !== undefined) set.isResolved = body.isResolved;

    const result = db.update(thoughtNotes).set(set).where(eq(thoughtNotes.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '念头不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/thoughts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(thoughtNotes).set({ deletedAt: ts, updatedAt: ts }).where(eq(thoughtNotes.id, id)).run();
    return { ok: true };
  });
}

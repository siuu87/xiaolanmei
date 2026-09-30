import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { worldbook } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

interface WorldbookBody {
  name?: string;
  content?: string;
  enabled?: boolean;
  sortOrder?: number;
}

/**
 * 组装「世界书」上下文（阶段 5 扩展）：勾选启用的条目按 sortOrder 拼接。
 * 与 prompts 的 buildSystemPrompt 分属两段、语义不同（指令 vs 世界观），
 * 供 chat/stream 注入与 /worldbook/preview 预览共用。
 */
export function buildWorldContext(): string {
  return db
    .select()
    .from(worldbook)
    .all()
    .filter((w) => w.deletedAt == null && w.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
    .map((w) => w.content)
    .join('\n\n')
    .trim();
}

export async function worldbookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/worldbook', async () => {
    return db
      .select()
      .from(worldbook)
      .all()
      .filter((w) => w.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map((w) => ({
        id: w.id,
        name: w.name,
        content: w.content,
        enabled: w.enabled,
        sortOrder: w.sortOrder,
        createdAt: w.createdAt,
      }));
  });

  app.post('/worldbook', async (req, reply) => {
    const body = (req.body ?? {}) as WorldbookBody;
    if (!body.name?.trim() || !body.content?.trim()) {
      reply.code(400).send({ message: 'name 与 content 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(worldbook)
      .values({
        id,
        name: body.name.trim(),
        content: body.content,
        enabled: body.enabled ?? true,
        sortOrder: body.sortOrder ?? 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/worldbook/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as WorldbookBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.content !== undefined) set.content = body.content;
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(worldbook).set(set).where(eq(worldbook.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '世界书条目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/worldbook/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(worldbook).set({ deletedAt: ts, updatedAt: ts }).where(eq(worldbook.id, id)).run();
    return { ok: true };
  });

  app.get('/worldbook/preview', async () => {
    return { systemPrompt: buildWorldContext() };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { summaries, messages, tokenUsage } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage, Usage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig } from './stations.js';

/** 注入到 system 的最近一次对话摘要（按会话）。 */
export function buildSummaryContext(conversationId: string | null): string {
  if (!conversationId) return '';
  const latest = db
    .select()
    .from(summaries)
    .all()
    .filter((s) => s.deletedAt == null && s.conversationId === conversationId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) return '';
  return `之前对话的摘要（可帮助你接续上下文，不必复述）：\n${latest.content}`;
}

function toDTO(s: typeof summaries.$inferSelect) {
  return {
    id: s.id,
    conversationId: s.conversationId,
    fromMessageId: s.fromMessageId,
    toMessageId: s.toMessageId,
    content: s.content,
    model: s.model,
    createdAt: s.createdAt,
  };
}

/**
 * 摘要路由（阶段 6）：
 * - GET /summaries 列出摘要；
 * - POST /summaries/generate 对指定消息区间用模型生成摘要并落库（滚动摘要）；
 * - buildSummaryContext 供 chat/stream 注入 system 提示词。
 */
export async function summaryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/summaries', async (req) => {
    const { conversationId } = (req.query ?? {}) as { conversationId?: string };
    return db
      .select()
      .from(summaries)
      .all()
      .filter((s) => s.deletedAt == null && (!conversationId || s.conversationId === conversationId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/summaries/generate', async (req, reply) => {
    const body = (req.body ?? {}) as {
      conversationId?: string;
      fromMessageId?: string | null;
      toMessageId?: string | null;
      model?: string;
    };
    const conversationId = body.conversationId?.trim();
    if (!conversationId) {
      reply.code(400).send({ message: 'conversationId 必填' });
      return;
    }
    const model = body.model?.trim() || getModelConfig().model;
    const adapter = openaiCompatibleAdapter(getAdapterConfig());

    const rows = db
      .select()
      .from(messages)
      .all()
      .filter((m) => m.deletedAt == null && m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);

    let fromIdx = 0;
    let toIdx = rows.length - 1;
    if (body.fromMessageId) {
      const i = rows.findIndex((m) => m.id === body.fromMessageId);
      if (i >= 0) fromIdx = i;
    }
    if (body.toMessageId) {
      const i = rows.findIndex((m) => m.id === body.toMessageId);
      if (i >= 0) toIdx = i;
    }

    const range = rows
      .slice(fromIdx, toIdx + 1)
      .filter((m) => m.role === 'user' || m.role === 'assistant');
    if (range.length === 0) {
      reply.code(400).send({ message: '没有可摘要的消息' });
      return;
    }

    const transcript = range
      .map((m) => `${m.role === 'user' ? '用户' : '小蓝莓'}：${m.content}`)
      .join('\n');

    // 滚动摘要：已有摘要就合并成一份最新摘要（覆盖式更新），否则新建
    const existing = db
      .select()
      .from(summaries)
      .all()
      .filter((s) => s.deletedAt == null && s.conversationId === conversationId)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    const prompt: ChatMessage[] = existing
      ? [
          {
            role: 'system',
            content:
              '请把「已有摘要」与「新增对话」合并成一份更完整的最新摘要，保留关键信息（人物、事件、约定、待办、情绪），用中文，300 字以内，只输出摘要本身。',
          },
          { role: 'user', content: `已有摘要：\n${existing.content}\n\n新增对话：\n${transcript}` },
        ]
      : [
          {
            role: 'system',
            content:
              '请把下面的对话历史浓缩成一份简洁摘要，保留关键信息（人物、事件、约定、待办、情绪），便于以后继续对话时快速回忆。用中文，200 字以内，只输出摘要本身。',
          },
          { role: 'user', content: transcript },
        ];

    let content: string;
    let usage: Usage | undefined;
    const started = now();
    try {
      const r = await adapter.complete({ model, messages: prompt });
      content = r.content.trim();
      usage = r.usage;
    } catch (err) {
      reply.code(502).send({ message: (err as Error).message });
      return;
    }

    // 落 token_usage（featureType: summary），让花费统计自动覆盖摘要生成
    try {
      db.insert(tokenUsage)
        .values({
          id: newId(),
          timestamp: now(),
          conversationId,
          messageId: null,
          featureType: 'summary',
          model,
          tokenInput: usage?.input ?? 0,
          tokenOutput: usage?.output ?? 0,
          tokenTotal: (usage?.input ?? 0) + (usage?.output ?? 0),
          latencyMs: now() - started,
          status: 'success',
          createdAt: now(),
          updatedAt: now(),
        })
        .run();
    } catch {
      /* 落库失败不阻断 */
    }

    const ts = now();
    if (existing) {
      db.update(summaries)
        .set({ content, toMessageId: range[range.length - 1].id, model, updatedAt: ts })
        .where(eq(summaries.id, existing.id))
        .run();
      reply.send({ id: existing.id, content, createdAt: ts });
      return;
    }

    const id = newId();
    db.insert(summaries)
      .values({
        id,
        conversationId,
        fromMessageId: range[0].id,
        toMessageId: range[range.length - 1].id,
        content,
        model,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    reply.code(201).send({ id, content, createdAt: ts });
  });

  app.delete('/summaries/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(summaries).set({ deletedAt: ts, updatedAt: ts }).where(eq(summaries.id, id)).run();
    return { ok: true };
  });
}

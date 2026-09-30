import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memories, tokenUsage } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage, Usage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig } from './stations.js';

const MEMORY_CATEGORIES = ['fact', 'event', 'relation'] as const;
type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

function normalizeCategory(c?: string): MemoryCategory {
  return c === 'event' || c === 'relation' ? c : 'fact';
}

/** 把文本切成关键词集合：中文用逐字 bigram（兼顾词与短语），英文/数字按词。 */
function keywordsOf(text: string): Set<string> {
  const cleaned = text.replace(/[^\p{L}\p{N}]+/gu, ' ').toLowerCase();
  const grams = new Set<string>();
  for (const w of cleaned.split(/\s+/)) {
    if (!w) continue;
    if (/^[一-鿿]+$/.test(w)) {
      for (let i = 0; i < w.length - 1; i++) grams.add(w.slice(i, i + 2));
    }
    grams.add(w);
  }
  return grams;
}

/** 关键词检索：按与 query 的重叠度召回记忆；无 query 或无命中时回退「高重要度前 N 条」。 */
function retrieveMemories(query?: string, limit = 8) {
  const rows = db
    .select()
    .from(memories)
    .all()
    .filter((m) => m.deletedAt == null && m.active);
  if (rows.length === 0) return [];
  const byImportance = () =>
    rows.sort((a, b) => b.importance - a.importance || a.createdAt - b.createdAt);

  const q = query?.trim();
  if (!q) return byImportance().slice(0, limit);

  const qgrams = keywordsOf(q);
  const scored = rows
    .map((m) => {
      let score = 0;
      for (const g of qgrams) if (m.content.includes(g)) score++;
      return { m, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.m.importance - a.m.importance)
    .map((s) => s.m);

  if (scored.length === 0) return byImportance().slice(0, limit);
  // 命中优先，不足 limit 用高重要度补齐，避免每次都塞满 30 条稀释上下文
  const hitIds = new Set(scored.map((m) => m.id));
  const fill = rows
    .filter((m) => !hitIds.has(m.id))
    .sort((a, b) => b.importance - a.importance || a.createdAt - b.createdAt);
  return [...scored, ...fill].slice(0, limit);
}

/** 注入到 system 的长期记忆块：按当前 query 关键词检索，最多 8 条。 */
export function buildMemoryContext(query?: string): string {
  const selected = retrieveMemories(query);
  if (selected.length === 0) return '';
  const lines = selected.map((m) => `- [${m.category}] ${m.content}`);
  return `以下是与你相关的长期记忆（可在合适时自然引用，不必逐条复述）：\n${lines.join('\n')}`;
}

function toDTO(m: typeof memories.$inferSelect) {
  return {
    id: m.id,
    category: m.category,
    content: m.content,
    source: m.source,
    relatedEntity: m.relatedEntity,
    importance: m.importance,
    active: m.active,
    createdAt: m.createdAt,
  };
}

/** 从模型输出里尽量解析出 JSON 数组（本地小模型输出可能带前后缀，取第一对 []）。 */
function parseExtracted(raw: string): { category: MemoryCategory; content: string }[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    const out: { category: MemoryCategory; content: string }[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const content = String(item.content ?? '').trim();
      if (!content) continue;
      out.push({ category: normalizeCategory(String(item.category ?? '')), content });
    }
    return out;
  } catch {
    return [];
  }
}

interface MemoryBody {
  category?: string;
  content?: string;
  source?: string;
  relatedEntity?: string | null;
  importance?: number;
  active?: boolean;
}

/**
 * 记忆路由（阶段 6）：
 * - CRUD 手动记忆（fact/event/relation）；
 * - POST /memories/extract 用模型从对话文本里自动提取并落库（source=model）；
 * - buildMemoryContext 供 chat/stream 注入 system 提示词。
 */
export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/memories', async () => {
    return db
      .select()
      .from(memories)
      .all()
      .filter((m) => m.deletedAt == null)
      .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/memories', async (req, reply) => {
    const body = (req.body ?? {}) as MemoryBody;
    const content = body.content?.trim();
    if (!content) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(memories)
      .values({
        id,
        category: normalizeCategory(body.category),
        content,
        source: body.source ?? 'manual',
        relatedEntity: body.relatedEntity ?? null,
        importance: body.importance ?? 0,
        active: body.active ?? true,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/memories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as MemoryBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.category !== undefined) set.category = normalizeCategory(body.category);
    if (body.content !== undefined) set.content = body.content.trim();
    if (body.relatedEntity !== undefined) set.relatedEntity = body.relatedEntity;
    if (body.importance !== undefined) set.importance = body.importance;
    if (body.active !== undefined) set.active = body.active;

    const result = db.update(memories).set(set).where(eq(memories.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '记忆不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/memories/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(memories).set({ deletedAt: ts, updatedAt: ts }).where(eq(memories.id, id)).run();
    return { ok: true };
  });

  // 模型自动提取记忆：从最近对话文本里抽取值得记住的事实/事件/关系，去重后落库。
  app.post('/memories/extract', async (req, reply) => {
    const body = (req.body ?? {}) as { text?: string; model?: string };
    const text = body.text?.trim();
    if (!text) {
      reply.code(400).send({ message: 'text 必填' });
      return;
    }
    const model = body.model?.trim() || getModelConfig().model;
    const adapter = openaiCompatibleAdapter(getAdapterConfig());

    const prompt: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是「小蓝莓」的记忆提取器。从对话里提取值得长期记住的、关于用户两人的事实/事件/关系。只输出一个 JSON 数组，每项形如 {"category":"fact|event|relation","content":"一句话记忆"}。没有值得记住的就输出 []，不要输出 JSON 以外的任何文字。',
      },
      { role: 'user', content: text },
    ];

    const created: { id: string; category: string; content: string }[] = [];
    const started = now();
    let usage: Usage | undefined;
    try {
      const r = await adapter.complete({ model, messages: prompt });
      usage = r.usage;
      const items = parseExtracted(r.content);
      const existing = new Set(
        db
          .select()
          .from(memories)
          .all()
          .filter((m) => m.deletedAt == null)
          .map((m) => m.content),
      );
      for (const item of items) {
        if (existing.has(item.content)) continue;
        existing.add(item.content);
        const id = newId();
        const ts = now();
        db.insert(memories)
          .values({
            id,
            category: item.category,
            content: item.content,
            source: 'model',
            relatedEntity: null,
            importance: 1,
            active: true,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        created.push({ id, category: item.category, content: item.content });
      }
    } catch (err) {
      console.error('提取记忆失败', err);
    }

    // 落 token_usage（featureType: memory），让花费统计自动覆盖记忆提取
    try {
      db.insert(tokenUsage)
        .values({
          id: newId(),
          timestamp: now(),
          conversationId: null,
          messageId: null,
          featureType: 'memory',
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

    reply.send({ created });
  });
}

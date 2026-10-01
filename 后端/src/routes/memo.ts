import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { ragDocuments, ragChunks, ragDocumentCollections, profiles, tokenUsage } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import * as rag from '../services/ragService.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import { getModelConfig, getAdapterConfig } from './stations.js';

/**
 * 备忘录路由：RAG 的用户视角封装。
 * 底层仍是 rag_documents（保留向量检索），这里提供双人共享备忘录的增删改查 / 分类统计 / 置顶 / 手动排序。
 */

const MEMO_CATEGORIES = ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'] as const;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function parseTags(v: string | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

function toMemoDTO(
  d: typeof ragDocuments.$inferSelect,
  profile?: { emoji: string | null; avatarColor: string | null },
) {
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    category: d.category,
    tags: parseTags(d.tags),
    importance: d.importance,
    pinned: d.pinned,
    order: d.order,
    authorType: d.authorType,
    source: d.source,
    fromWho: d.fromWho,
    toWho: d.toWho,
    avatarSeed: d.avatarSeed,
    emoji: profile?.emoji ?? null,
    avatarColor: profile?.avatarColor ?? null,
    needNotify: d.needNotify,
    ownerSide: d.ownerSide,
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** 按 toWho 昵称（回退 avatarSeed）解析所属方档案的头像 emoji 与颜色，供前端专属徽章展示。 */
function profileResolver(): (d: typeof ragDocuments.$inferSelect) => { emoji: string | null; avatarColor: string | null } {
  const ps = db.select().from(profiles).all();
  return (d) => {
    const byNick = d.toWho ? ps.find((p) => p.nickname === d.toWho) : undefined;
    const bySeed = d.avatarSeed ? ps.find((p) => p.avatarSeed === d.avatarSeed) : undefined;
    const p = byNick ?? bySeed;
    return { emoji: p?.emoji ?? null, avatarColor: p?.avatarColor ?? null };
  };
}

function normCategory(v: unknown, fallback: string): string {
  return typeof v === 'string' && (MEMO_CATEGORIES as readonly string[]).includes(v) ? v : fallback;
}

/** 读取「我」与「对方」的昵称，用于文件夹过滤（folder=me/partner 按 toWho 归属）。 */
function folderNicknames(): { me: string | null; partner: string | null } {
  const ps = db.select().from(profiles).all();
  const me = ps.find((p) => p.isMe)?.nickname ?? null;
  const partner = ps.find((p) => !p.isMe)?.nickname ?? null;
  return { me, partner };
}

/** 按 toWho 昵称解析其档案的 avatarSeed（显式传入优先）。 */
function resolveAvatarSeed(toWho: string | null, explicit: string | null): string | null {
  if (explicit) return explicit;
  if (!toWho) return null;
  const p = db.select().from(profiles).all().find((x) => x.nickname === toWho);
  return p?.avatarSeed ?? null;
}

/** 排序：置顶优先 → 手动 order 升序 → importance 降序 → 更新时间降序 */
function sortMemos<T extends typeof ragDocuments.$inferSelect>(rows: T[]): T[] {
  return rows.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.order - b.order ||
      b.importance - a.importance ||
      b.updatedAt - a.updatedAt,
  );
}

interface MemoClassifyDecision {
  index: number;
  ownerSide: 'me' | 'partner';
  category: string;
  title: string;
}

const CLASSIFY_SYSTEM =
  '你是小蓝莓的备忘录整理助手。请逐条判断以下随手记的内容：\n' +
  '1. ownerSide: "me" 表示「我记 TA」（关于对方、由我记）；"partner" 表示「TA 记我」（关于我、由对方记）。默认 "me"。\n' +
  '2. category: preference(忌口喜好)/agreement(约定)/plan(计划)/experience(经历)/info(信息)/inspiration(灵感)。\n' +
  '3. title: 不超过 15 字的简短标题。\n' +
  '只输出严格 JSON 数组，不要任何解释或多余文字，格式：\n' +
  '[{"index":0,"ownerSide":"me","category":"preference","title":"不吃洋葱"}]';

/** 调用 LLM 逐条判断归属/分类/标题，返回按 index 对齐的决策，并落 token_usage（featureType 标记用途）。 */
async function classifyContents(contents: string[], featureType: string): Promise<MemoClassifyDecision[]> {
  const model = getModelConfig().model;
  const adapter = openaiCompatibleAdapter(getAdapterConfig());
  const started = now();
  const r = await adapter.complete({
    model,
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: `内容列表：\n${contents.map((c, i) => `${i}. ${c}`).join('\n')}` },
    ],
  });

  try {
    db.insert(tokenUsage)
      .values({
        id: newId(),
        timestamp: now(),
        conversationId: null,
        messageId: null,
        featureType,
        model,
        stationId: null,
        tokenInput: r.usage?.input ?? 0,
        tokenOutput: r.usage?.output ?? 0,
        tokenTotal: (r.usage?.input ?? 0) + (r.usage?.output ?? 0),
        latencyMs: now() - started,
        status: 'success',
        createdAt: now(),
        updatedAt: now(),
      })
      .run();
  } catch {
    /* 落库失败不阻断 */
  }

  const text = r.content;
  let raw: Array<{ index?: unknown; ownerSide?: unknown; category?: unknown; title?: unknown }> = [];
  try {
    const parsed = JSON.parse(text);
    raw = Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        raw = Array.isArray(parsed) ? parsed : [];
      } catch {
        raw = [];
      }
    }
  }

  return raw
    .map((d) => ({
      index: Number(d?.index),
      ownerSide: d?.ownerSide === 'partner' ? ('partner' as const) : ('me' as const),
      category:
        typeof d?.category === 'string' && (MEMO_CATEGORIES as readonly string[]).includes(d.category)
          ? d.category
          : 'general',
      title: typeof d?.title === 'string' && d.title.trim() ? d.title.trim() : '',
    }))
    .filter((d) => Number.isInteger(d.index));
}

export async function memoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/memo', async (req) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const category = str(q.category);
    const search = str(q.search)?.toLowerCase();
    const tag = str(q.tag)?.toLowerCase();
    const folder = str(q.folder)?.toLowerCase();
    const status = str(q.status)?.toLowerCase();
    const ownerSide = str(q.ownerSide)?.toLowerCase();

    let rows = db
      .select()
      .from(ragDocuments)
      .all()
      .filter((d) => d.deletedAt == null);
    if (category) rows = rows.filter((d) => d.category === category);
    if (tag) rows = rows.filter((d) => parseTags(d.tags).some((t) => t.toLowerCase() === tag));
    if (search) {
      rows = rows.filter(
        (d) => d.title.toLowerCase().includes(search) || d.content.toLowerCase().includes(search),
      );
    }
    // 文件夹过滤：me → toWho=我；partner/ta → toWho=对方（按档案昵称归属）
    if (folder === 'me' || folder === 'partner' || folder === 'ta') {
      const { me, partner } = folderNicknames();
      const target = folder === 'me' ? me : partner;
      rows = target ? rows.filter((d) => d.toWho === target) : [];
    }
    if (status === 'unfiled' || status === 'archived') {
      rows = rows.filter((d) => d.status === status);
    }
    // 归属过滤：me 我记 TA / partner TA 记我
    if (ownerSide === 'me' || ownerSide === 'partner') {
      rows = rows.filter((d) => d.ownerSide === ownerSide);
    }
    const resolveProfile = profileResolver();
    return sortMemos(rows).map((d) => toMemoDTO(d, resolveProfile(d)));
  });

  app.get('/memo/categories', async () => {
    const rows = db
      .select()
      .from(ragDocuments)
      .all()
      .filter((d) => d.deletedAt == null);
    const counts = new Map<string, number>();
    for (const d of rows) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
    const list = MEMO_CATEGORIES.map((c) => ({ category: c, count: counts.get(c) ?? 0 }));
    return { total: rows.length, categories: list };
  });

  app.post('/memo', async (req, reply) => {
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      importance?: number;
      fromWho?: string;
      toWho?: string;
      avatarSeed?: string;
      status?: string;
      ownerSide?: string;
    };
    const content = body.content?.trim();
    if (!content) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const dup = await rag.checkDuplicate(content);
    if (dup.isDuplicate) {
      reply.code(409).send({
        message: '内容重复',
        duplicate: dup.similarDoc ? { id: dup.similarDoc.id, title: dup.similarDoc.title } : null,
      });
      return;
    }
    const fromWho = str(body.fromWho);
    const toWho = str(body.toWho);
    // 快速记一笔：默认进「未分类」（status=unfiled，ownerSide=me，category=general），等 AI/用户整理
    const titleInput = body.title?.trim();
    const title = titleInput || (content.length > 15 ? `${content.slice(0, 15)}…` : content);
    const status = body.status === 'archived' ? 'archived' : 'unfiled';
    const ownerSide = body.ownerSide === 'partner' ? 'partner' : 'me';
    const result = await rag.indexDocument({
      title,
      content,
      category: normCategory(body.category, 'general'),
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t)).filter(Boolean) : undefined,
      importance: Math.min(5, Math.max(1, Math.round(Number(body.importance) || 3))),
      source: 'manual',
      authorType: 'user',
      fromWho,
      toWho,
      avatarSeed: resolveAvatarSeed(toWho, str(body.avatarSeed)),
      ownerSide,
      status,
    });
    reply.code(201).send(result);
  });

  app.patch('/memo/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      importance?: number;
      pinned?: boolean;
      ownerSide?: string;
      status?: string;
    };
    const doc = db
      .select()
      .from(ragDocuments)
      .all()
      .find((d) => d.id === id && d.deletedAt == null);
    if (!doc) {
      reply.code(404).send({ message: '备忘录不存在' });
      return;
    }

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) {
      set.title = String(body.title).trim() || '(无标题)';
      set.status = 'archived'; // 补上标题即视为已收录
    }
    if (body.category !== undefined) set.category = normCategory(body.category, doc.category);
    if (body.tags !== undefined) {
      set.tags = Array.isArray(body.tags)
        ? JSON.stringify(body.tags.map((t) => String(t)).filter(Boolean))
        : null;
    }
    if (body.importance !== undefined) {
      set.importance = Math.min(5, Math.max(1, Math.round(Number(body.importance) || 3)));
    }
    if (body.pinned !== undefined) set.pinned = body.pinned === true;
    if (body.ownerSide !== undefined) set.ownerSide = body.ownerSide === 'partner' ? 'partner' : 'me';
    if (body.status !== undefined) set.status = body.status === 'archived' ? 'archived' : 'unfiled';

    const newContent = body.content !== undefined ? String(body.content).trim() : undefined;
    if (newContent !== undefined && newContent !== doc.content) {
      await rag.updateDocument(id, newContent);
    }
    db.update(ragDocuments).set(set).where(eq(ragDocuments.id, id)).run();
    return { ok: true };
  });

  app.delete('/memo/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const result = db.update(ragDocuments).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragDocuments.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '备忘录不存在' });
      return;
    }
    db.update(ragChunks).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragChunks.documentId, id)).run();
    db.delete(ragDocumentCollections).where(eq(ragDocumentCollections.documentId, id)).run();
    return { ok: true };
  });

  // AI 批量整理：把「未分类」便签归档（判断归属 ownerSide + 分类 category + 起标题）
  app.post('/memo/organize', async (req, reply) => {
    const drafts = db
      .select()
      .from(ragDocuments)
      .all()
      .filter((d) => d.deletedAt == null && d.status === 'unfiled');
    if (drafts.length === 0) return { organized: 0 };

    let decisions: MemoClassifyDecision[];
    try {
      decisions = await classifyContents(drafts.map((d) => d.content), 'memo_organize');
    } catch (err) {
      reply.code(502).send({ message: (err as Error).message });
      return;
    }

    const ts = now();
    let organized = 0;
    for (const dec of decisions) {
      const draft = drafts[dec.index];
      if (!draft) continue;
      db.update(ragDocuments)
        .set({
          ownerSide: dec.ownerSide,
          category: dec.category,
          title: dec.title || draft.content.slice(0, 15),
          status: 'archived',
          updatedAt: ts,
        })
        .where(eq(ragDocuments.id, draft.id))
        .run();
      organized += 1;
    }

    return { organized };
  });

  app.post('/memo/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .select()
      .from(ragDocuments)
      .all()
      .find((d) => d.id === id && d.deletedAt == null);
    if (!row) {
      reply.code(404).send({ message: '备忘录不存在' });
      return;
    }
    db.update(ragDocuments)
      .set({ pinned: !row.pinned, updatedAt: now() })
      .where(eq(ragDocuments.id, id))
      .run();
    return { pinned: !row.pinned };
  });

  app.post('/memo/:id/notify', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .select()
      .from(ragDocuments)
      .all()
      .find((d) => d.id === id && d.deletedAt == null);
    if (!row) {
      reply.code(404).send({ message: '备忘录不存在' });
      return;
    }
    db.update(ragDocuments)
      .set({ needNotify: !row.needNotify, updatedAt: now() })
      .where(eq(ragDocuments.id, id))
      .run();
    return { needNotify: !row.needNotify };
  });

  app.post('/memo/:id/claim', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { fromWho?: string; toWho?: string };
    const row = db
      .select()
      .from(ragDocuments)
      .all()
      .find((d) => d.id === id && d.deletedAt == null);
    if (!row) {
      reply.code(404).send({ message: '备忘录不存在' });
      return;
    }
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.fromWho !== undefined) set.fromWho = str(body.fromWho);
    if (body.toWho !== undefined) {
      const toWho = str(body.toWho);
      set.toWho = toWho;
      set.avatarSeed = resolveAvatarSeed(toWho, null);
    }
    db.update(ragDocuments).set(set).where(eq(ragDocuments.id, id)).run();
    return { ok: true };
  });

  app.post('/memo/reorder', async (req, reply) => {
    const body = (req.body ?? {}) as { orderedIds?: string[] };
    const ids = Array.isArray(body.orderedIds) ? body.orderedIds.map((x) => String(x)) : [];
    if (!ids.length) {
      reply.code(400).send({ message: 'orderedIds 必填' });
      return;
    }
    const ts = now();
    db.transaction((tx) => {
      ids.forEach((id, i) => {
        tx.update(ragDocuments)
          .set({ order: i, updatedAt: ts })
          .where(eq(ragDocuments.id, id))
          .run();
      });
    });
    return { ok: true, count: ids.length };
  });
}

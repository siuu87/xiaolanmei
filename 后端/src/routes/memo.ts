import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { ragDocuments, ragChunks, ragDocumentCollections } from '../db/schema.js';
import { now } from '../utils/id.js';
import * as rag from '../services/ragService.js';

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

function toMemoDTO(d: typeof ragDocuments.$inferSelect) {
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
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function normCategory(v: unknown, fallback: string): string {
  return typeof v === 'string' && (MEMO_CATEGORIES as readonly string[]).includes(v) ? v : fallback;
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

export async function memoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/memo', async (req) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const category = str(q.category);
    const search = str(q.search)?.toLowerCase();
    const tag = str(q.tag)?.toLowerCase();

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
    return sortMemos(rows).map(toMemoDTO);
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
    const result = await rag.indexDocument({
      title: body.title?.trim() || '(无标题)',
      content,
      category: normCategory(body.category, 'info'),
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t)).filter(Boolean) : undefined,
      importance: Math.min(5, Math.max(1, Math.round(Number(body.importance) || 3))),
      source: 'manual',
      authorType: 'user',
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
    if (body.title !== undefined) set.title = String(body.title).trim() || '(无标题)';
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

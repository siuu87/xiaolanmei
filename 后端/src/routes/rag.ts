import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  ragCollections,
  ragDocuments,
  ragChunks,
  ragDocumentCollections,
  memories,
  worldbook,
  diaries,
} from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import * as rag from '../services/ragService.js';

/**
 * RAG 路由（阶段 11）：文档 / 知识库 CRUD、检索测试、批量重建、从旧数据导入。
 */

const RAG_CATEGORIES = ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'] as const;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDocDTO(d: typeof ragDocuments.$inferSelect, collectionIds: string[]) {
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    chunkCount: d.chunkCount,
    source: d.source,
    fileType: d.fileType,
    tags: d.tags ? (() => { try { return JSON.parse(d.tags); } catch { return null; } })() : null,
    category: d.category,
    importance: d.importance,
    embeddingModel: d.embeddingModel,
    meta: d.meta ? (() => { try { return JSON.parse(d.meta); } catch { return null; } })() : null,
    collectionIds,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toColDTO(c: typeof ragCollections.$inferSelect, documentCount: number) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    embeddingModel: c.embeddingModel,
    documentCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function ragRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------ 文档 ------------------------------ */

  app.get('/rag/documents', async (req) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const collectionId = str(q.collectionId);
    const category = str(q.category);
    const search = str(q.search)?.toLowerCase();

    const links = db.select().from(ragDocumentCollections).all();
    const collByDoc = new Map<string, string[]>();
    for (const l of links) {
      const arr = collByDoc.get(l.documentId) ?? [];
      arr.push(l.collectionId);
      collByDoc.set(l.documentId, arr);
    }

    let docs = db
      .select()
      .from(ragDocuments)
      .all()
      .filter((d) => d.deletedAt == null);
    if (category) docs = docs.filter((d) => d.category === category);
    if (search) {
      docs = docs.filter(
        (d) => d.title.toLowerCase().includes(search) || d.content.toLowerCase().includes(search),
      );
    }
    if (collectionId) {
      docs = docs.filter((d) => (collByDoc.get(d.id) ?? []).includes(collectionId));
    }
    docs.sort((a, b) => b.updatedAt - a.updatedAt);
    return docs.map((d) => toDocDTO(d, collByDoc.get(d.id) ?? []));
  });

  app.post('/rag/documents', async (req, reply) => {
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      source?: string;
      category?: string;
      tags?: string[];
      importance?: number;
      collectionId?: string;
      fileType?: string;
      meta?: Record<string, unknown>;
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
      title: body.title ?? '',
      content,
      source: body.source ?? 'manual',
      category: body.category && RAG_CATEGORIES.includes(body.category as never) ? body.category : 'general',
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t)) : undefined,
      importance: body.importance ?? 3,
      collectionId: body.collectionId ?? null,
      fileType: body.fileType ?? null,
      meta: body.meta,
    });
    reply.code(201).send(result);
  });

  app.patch('/rag/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      importance?: number;
    };
    const doc = db
      .select()
      .from(ragDocuments)
      .all()
      .find((d) => d.id === id && d.deletedAt == null);
    if (!doc) {
      reply.code(404).send({ message: '文档不存在' });
      return;
    }

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) set.title = String(body.title).trim() || '(无标题)';
    if (body.category !== undefined) {
      set.category = RAG_CATEGORIES.includes(body.category as never) ? body.category : doc.category;
    }
    if (body.tags !== undefined) {
      set.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags.map((t) => String(t))) : null;
    }
    if (body.importance !== undefined) {
      set.importance = Math.min(5, Math.max(1, Math.round(Number(body.importance) || 3)));
    }

    const newContent = body.content !== undefined ? String(body.content).trim() : undefined;
    if (newContent !== undefined && newContent !== doc.content) {
      await rag.updateDocument(id, newContent);
    }
    db.update(ragDocuments).set(set).where(eq(ragDocuments.id, id)).run();
    return { ok: true };
  });

  app.post('/rag/documents/:id/reindex', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { model?: string };
    try {
      reply.send(await rag.reindexDocument(id, body.model?.trim() || undefined));
    } catch (err) {
      reply.code(404).send({ message: (err as Error).message });
    }
  });

  app.delete('/rag/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const result = db.update(ragDocuments).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragDocuments.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '文档不存在' });
      return;
    }
    db.update(ragChunks).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragChunks.documentId, id)).run();
    db.delete(ragDocumentCollections).where(eq(ragDocumentCollections.documentId, id)).run();
    return { ok: true };
  });

  /* ------------------------------ 知识库 ------------------------------ */

  app.get('/rag/collections', async () => {
    const links = db.select().from(ragDocumentCollections).all();
    return db
      .select()
      .from(ragCollections)
      .all()
      .filter((c) => c.deletedAt == null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => toColDTO(c, links.filter((l) => l.collectionId === c.id).length));
  });

  app.post('/rag/collections', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string; description?: string; color?: string; embeddingModel?: string };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(ragCollections)
      .values({
        id,
        name,
        description: body.description ?? null,
        color: body.color ?? null,
        embeddingModel: body.embeddingModel ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/rag/collections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; description?: string; color?: string; embeddingModel?: string };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.description !== undefined) set.description = body.description;
    if (body.color !== undefined) set.color = body.color;
    if (body.embeddingModel !== undefined) set.embeddingModel = body.embeddingModel;
    const result = db.update(ragCollections).set(set).where(eq(ragCollections.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '知识库不存在' });
      return;
    }
    return { ok: true };
  });

  app.delete('/rag/collections/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const result = db.update(ragCollections).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragCollections.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '知识库不存在' });
      return;
    }
    db.delete(ragDocumentCollections).where(eq(ragDocumentCollections.collectionId, id)).run();
    return { ok: true };
  });

  /* ------------------------------ 检索 / 重建 / 导入 ------------------------------ */

  app.get('/rag/search', async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const query = str(q.query);
    if (!query) {
      reply.code(400).send({ message: 'query 必填' });
      return;
    }
    const results = await rag.retrieveChunks(query, {
      topK: Number(q.topK) || 5,
      minScore: Number(q.minScore) || 0.3,
      collectionId: str(q.collectionId),
      category: str(q.category),
    });
    return {
      results: results.map((r) => ({
        score: r.score,
        chunk: { id: r.chunk.id, content: r.chunk.content, chunkIndex: r.chunk.chunkIndex },
        document: { id: r.document.id, title: r.document.title, category: r.document.category },
      })),
    };
  });

  app.post('/rag/reindex', async () => rag.reindexAll());

  app.post('/rag/import', async () => {
    const mems = db.select().from(memories).all().filter((m) => m.deletedAt == null);
    const wbs = db.select().from(worldbook).all().filter((w) => w.deletedAt == null);
    const dis = db.select().from(diaries).all().filter((d) => d.deletedAt == null);

    const mapMemCategory = (c: string) => (c === 'event' ? 'experience' : c === 'relation' ? 'agreement' : 'info');

    let imported = 0;
    let skipped = 0;
    const tasks: { title: string; content: string; category: string }[] = [];
    for (const m of mems) {
      tasks.push({ title: `记忆·${m.category}`, content: m.content, category: mapMemCategory(m.category) });
    }
    for (const w of wbs) tasks.push({ title: w.name, content: w.content, category: 'info' });
    for (const d of dis) tasks.push({ title: `日记 ${d.date}`, content: d.content, category: 'experience' });

    for (const t of tasks) {
      if (!t.content?.trim()) continue;
      const dup = await rag.checkDuplicate(t.content);
      if (dup.isDuplicate) {
        skipped += 1;
        continue;
      }
      await rag.indexDocument({ title: t.title, content: t.content, source: 'import', category: t.category });
      imported += 1;
    }
    return { imported, skipped };
  });
}

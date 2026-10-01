import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  ragCollections,
  ragDocuments,
  ragChunks,
  ragDocumentCollections,
} from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { getAdapterConfig } from '../routes/stations.js';

/**
 * RAG 双向记忆服务（阶段 11）：
 * - 向量存本地 SQLite（embedding 列 JSON 数组字符串），余弦相似度纯 JS 计算；
 * - 嵌入模型通过 stations 配置的 OpenAI 兼容 /embeddings 接口获取，失败降级为 hash 向量；
 * - 本地开发（无 embedding 模型）自动走 fallbackEmbedding。
 */

type DocumentRow = typeof ragDocuments.$inferSelect;
type ChunkRow = typeof ragChunks.$inferSelect;

/** 默认知识库使用固定 id（与 timetable_config 的 id='default' 同套路，幂等） */
const DEFAULT_COLLECTION_ID = 'default';
const DEFAULT_COLLECTION_NAME = '默认知识库';

/** 未显式配置 embedding 模型时的默认值；无此模型的站子会失败 → 走 hash 降级 */
const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

/* ------------------------------ 分块 ------------------------------ */

export interface ChunkOptions {
  /** 每块最大字符数（默认 500） */
  maxTokens?: number;
  /** 相邻块重叠字符数（默认 50） */
  overlap?: number;
}

/** 按段落优先切分：短段落整段为一块，超长段落按 maxTokens 硬切（带 overlap）。 */
export function chunkDocument(content: string, options?: ChunkOptions): string[] {
  const max = Math.max(1, options?.maxTokens ?? 500);
  const overlap = Math.min(Math.max(0, options?.overlap ?? 50), max - 1);
  const paras = content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const para of paras) {
    if (para.length <= max) {
      chunks.push(para);
      continue;
    }
    let start = 0;
    while (start < para.length) {
      chunks.push(para.slice(start, start + max));
      if (start + max >= para.length) break;
      start += max - overlap;
    }
  }
  return chunks.filter((c) => c.length > 0);
}

/* ------------------------------ 哈希 / 向量 ------------------------------ */

/** cyrb53 简单哈希（用于去重与降级向量），返回 16 位十六进制字符串 */
export function simpleHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** 纯 JS 余弦相似度；维度不一致时返回 0（混合嵌入维度时自然排除）。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** hash 降级向量：按字符 + 字符 bigram 撒到 dim 维，L2 归一化（文本重叠度近似语义相似）。 */
export function fallbackEmbedding(text: string, dim = 256): number[] {
  const vec = new Array<number>(dim).fill(0);
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    let x = (lower.charCodeAt(i) * 2654435761) >>> 0;
    for (let k = 0; k < 3; k++) {
      x = ((x ^ (x >>> 15)) * 2246822519) >>> 0;
      vec[x % dim] += k === 0 ? 1 : 0.5;
    }
  }
  for (let i = 0; i < lower.length - 1; i++) {
    const code = ((lower.charCodeAt(i) << 8) ^ lower.charCodeAt(i + 1)) >>> 0;
    const x = (code * 2654435761) >>> 0;
    vec[x % dim] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/** 通过 stations 配置的 OpenAI 兼容 /embeddings 接口获取向量；失败返回 null。 */
export async function embedText(text: string, model?: string): Promise<number[] | null> {
  const cfg = getAdapterConfig();
  const m = model?.trim() || DEFAULT_EMBED_MODEL;
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: m, input: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    const v = data.data?.[0]?.embedding;
    return Array.isArray(v) && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** 优先真实嵌入，失败降级 hash 向量；返回 { vector, model, fallback }。 */
async function embedOrFallback(
  text: string,
  model?: string,
): Promise<{ vector: number[]; model: string | null; fallback: boolean }> {
  const v = await embedText(text, model);
  if (v) return { vector: v, model: model?.trim() || DEFAULT_EMBED_MODEL, fallback: false };
  return { vector: fallbackEmbedding(text), model: null, fallback: true };
}

/* ------------------------------ 默认知识库 ------------------------------ */

function getOrCreateDefaultCollection(): string {
  const existing = db
    .select()
    .from(ragCollections)
    .all()
    .find((c) => c.id === DEFAULT_COLLECTION_ID && c.deletedAt == null);
  if (existing) return existing.id;
  const ts = now();
  db.insert(ragCollections)
    .values({
      id: DEFAULT_COLLECTION_ID,
      name: DEFAULT_COLLECTION_NAME,
      description: '系统默认知识库：AI 归档的长期记忆与导入内容',
      color: '#6366f1',
      embeddingModel: null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return DEFAULT_COLLECTION_ID;
}

/* ------------------------------ 检索 ------------------------------ */

export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
  collectionId?: string | null;
  category?: string | null;
}

export interface RetrievedChunk {
  chunk: ChunkRow;
  score: number;
  document: DocumentRow;
}

/** 检索：query 向量与所有未删除 chunk 求余弦相似度，支持 collectionId / category 过滤，降序取 topK。 */
export async function retrieveChunks(query: string, options?: RetrieveOptions): Promise<RetrievedChunk[]> {
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0.3;
  const q = query?.trim();
  if (!q) return [];

  const { vector } = await embedOrFallback(q);

  const docs = db
    .select()
    .from(ragDocuments)
    .all()
    .filter((d) => d.deletedAt == null);
  const docById = new Map(docs.map((d) => [d.id, d]));

  let allowedDocIds: Set<string> | null = null;
  if (options?.collectionId) {
    allowedDocIds = new Set(
      db
        .select()
        .from(ragDocumentCollections)
        .all()
        .filter((l) => l.collectionId === options.collectionId)
        .map((l) => l.documentId),
    );
  }

  const chunks = db
    .select()
    .from(ragChunks)
    .all()
    .filter((c) => c.deletedAt == null);

  const results: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const document = docById.get(chunk.documentId);
    if (!document) continue;
    if (allowedDocIds && !allowedDocIds.has(chunk.documentId)) continue;
    if (options?.category && document.category !== options.category) continue;
    if (!chunk.embedding) continue;
    let vec: number[];
    try {
      vec = JSON.parse(chunk.embedding);
    } catch {
      continue;
    }
    const score = cosineSimilarity(vector, vec);
    if (score < minScore) continue;
    results.push({ chunk, score, document });
  }
  results.sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex);
  return results.slice(0, topK);
}

/* ------------------------------ 索引 / 更新 ------------------------------ */

/** 重新分块 + 逐块向量化入库（软删旧 chunks），返回新块数与所用嵌入模型。 */
async function rechunkAndEmbed(
  docId: string,
  content: string,
  model?: string,
): Promise<{ chunkCount: number; embeddingModel: string | null }> {
  const ts = now();
  db.update(ragChunks).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragChunks.documentId, docId)).run();

  const chunks = chunkDocument(content);
  let usedModel: string | null = null;
  const rows = [];
  for (let i = 0; i < chunks.length; i++) {
    const { vector, model: m } = await embedOrFallback(chunks[i], model);
    if (m) usedModel = m;
    rows.push({
      id: newId(),
      documentId: docId,
      chunkIndex: i,
      content: chunks[i],
      tokenCount: chunks[i].length,
      embedding: JSON.stringify(vector),
      embeddingDim: vector.length,
      hash: simpleHash(chunks[i]),
      createdAt: ts,
      updatedAt: ts,
    });
  }
  if (rows.length) db.insert(ragChunks).values(rows).run();
  return { chunkCount: rows.length, embeddingModel: usedModel };
}

export interface IndexDocumentInput {
  title: string;
  content: string;
  source?: string; // manual | agent | import | file
  category?: string;
  tags?: string[];
  importance?: number;
  collectionId?: string | null;
  fileType?: string | null;
  authorType?: 'user' | 'agent'; // 备忘录作者（默认 user）
  meta?: Record<string, unknown>;
}

/** 创建文档 → 获取/创建默认知识库 → 建立关联 → 分块向量化 → 更新 chunkCount。 */
export async function indexDocument(input: IndexDocumentInput): Promise<{ id: string; chunkCount: number; collectionId: string }> {
  const ts = now();
  const docId = newId();
  const title = input.title?.trim() || '(无标题)';
  const content = input.content ?? '';
  const collectionId = input.collectionId || getOrCreateDefaultCollection();

  db.insert(ragDocuments)
    .values({
      id: docId,
      title,
      content,
      chunkCount: 0,
      source: input.source ?? 'manual',
      fileType: input.fileType ?? null,
      tags: input.tags?.length ? JSON.stringify(input.tags) : null,
      category: input.category ?? 'general',
      importance: input.importance ?? 3,
      authorType: input.authorType ?? 'user',
      embeddingModel: null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  db.insert(ragDocumentCollections)
    .values({ id: newId(), documentId: docId, collectionId, createdAt: ts })
    .run();

  const { chunkCount, embeddingModel } = await rechunkAndEmbed(docId, content);
  db.update(ragDocuments)
    .set({ chunkCount, embeddingModel, updatedAt: now() })
    .where(eq(ragDocuments.id, docId))
    .run();

  return { id: docId, chunkCount, collectionId };
}

export interface DuplicateResult {
  isDuplicate: boolean;
  similarDoc?: DocumentRow;
}

/** 去重：先全文精确 hash 匹配，再语义相似度 top1 比对（≥ threshold 视为重复）。 */
export async function checkDuplicate(content: string, threshold = 0.92): Promise<DuplicateResult> {
  const q = content?.trim();
  if (!q) return { isDuplicate: false };
  const docs = db
    .select()
    .from(ragDocuments)
    .all()
    .filter((d) => d.deletedAt == null);

  const qHash = simpleHash(q);
  for (const d of docs) {
    if (simpleHash(d.content) === qHash) return { isDuplicate: true, similarDoc: d };
  }

  const { vector, fallback } = await embedOrFallback(q);
  // 语义去重仅在真实嵌入模型可用时进行；hash 降级向量无语义（只有词面重叠），容易误判，跳过
  if (fallback) return { isDuplicate: false };
  let best: { doc: DocumentRow; score: number } | null = null;
  for (const d of docs) {
    const chunks = db
      .select()
      .from(ragChunks)
      .all()
      .filter((c) => c.documentId === d.id && c.deletedAt == null && c.embedding);
    for (const c of chunks) {
      let v: number[];
      try {
        v = JSON.parse(c.embedding as string);
      } catch {
        continue;
      }
      const s = cosineSimilarity(vector, v);
      if (!best || s > best.score) best = { doc: d, score: s };
    }
  }
  if (best && best.score >= threshold) return { isDuplicate: true, similarDoc: best.doc };
  return { isDuplicate: false };
}

/** 更新文档内容：保存历史版本到 meta.previousVersions（最多 5 个）→ 重新分块向量化。 */
export async function updateDocument(
  docId: string,
  newContent: string,
  reason?: string,
): Promise<{ id: string; chunkCount: number }> {
  const doc = db
    .select()
    .from(ragDocuments)
    .all()
    .find((d) => d.id === docId && d.deletedAt == null);
  if (!doc) throw new Error('文档不存在');

  const ts = now();
  let meta: Record<string, unknown> = {};
  try {
    meta = doc.meta ? JSON.parse(doc.meta) : {};
  } catch {
    meta = {};
  }
  const prevVersions = Array.isArray(meta.previousVersions) ? (meta.previousVersions as unknown[]) : [];
  meta.previousVersions = [
    { title: doc.title, content: doc.content, updatedAt: doc.updatedAt, reason: reason ?? null },
    ...prevVersions,
  ].slice(0, 5);

  const { chunkCount, embeddingModel } = await rechunkAndEmbed(docId, newContent);
  db.update(ragDocuments)
    .set({
      content: newContent,
      chunkCount,
      embeddingModel,
      meta: JSON.stringify(meta),
      updatedAt: ts,
    })
    .where(eq(ragDocuments.id, docId))
    .run();

  return { id: docId, chunkCount };
}

/** 重新索引单个文档（不写入历史版本）。 */
export async function reindexDocument(docId: string, model?: string): Promise<{ id: string; chunkCount: number }> {
  const doc = db
    .select()
    .from(ragDocuments)
    .all()
    .find((d) => d.id === docId && d.deletedAt == null);
  if (!doc) throw new Error('文档不存在');
  const { chunkCount, embeddingModel } = await rechunkAndEmbed(docId, doc.content, model);
  db.update(ragDocuments)
    .set({ chunkCount, embeddingModel, updatedAt: now() })
    .where(eq(ragDocuments.id, docId))
    .run();
  return { id: docId, chunkCount };
}

/** 遍历所有未删除文档重新索引。 */
export async function reindexAll(model?: string): Promise<{ reindexed: number }> {
  const docs = db
    .select()
    .from(ragDocuments)
    .all()
    .filter((d) => d.deletedAt == null);
  for (const d of docs) {
    await reindexDocument(d.id, model);
  }
  return { reindexed: docs.length };
}

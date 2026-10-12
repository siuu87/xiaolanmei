import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { watchItems } from '../db/schema.js';

/**
 * 追剧片单（阶段 P2 数据单源化）。
 *
 * 与 period 一致的整体替换语义：PUT 带全量 items，本次没出现的 id 打软删墓碑，
 * 便于双端同步（阶段 14）传播删除。前端 store 本来就持有整份列表，全量替换最省事。
 * poster 可能是 data URL（本地海报），字段放宽，只校验分类/状态/来源三个枚举。
 */

const CATEGORIES = ['movie', 'anime', 'show'];
const STATUSES = ['planned', 'watched'];
const SOURCES = ['manual', 'ai'];

interface WatchItemDTO {
  id: string;
  title: string;
  category: string;
  status: string;
  poster?: string | null;
  note?: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

function cleanItems(items: unknown): WatchItemDTO[] {
  if (!Array.isArray(items)) return [];
  const out: WatchItemDTO[] = [];
  for (const x of items) {
    if (!x || typeof x !== 'object') continue;
    const it = x as Record<string, unknown>;
    if (typeof it.id !== 'string' || typeof it.title !== 'string') continue;
    if (typeof it.category !== 'string' || !CATEGORIES.includes(it.category)) continue;
    if (typeof it.status !== 'string' || !STATUSES.includes(it.status)) continue;
    out.push({
      id: it.id,
      title: it.title,
      category: it.category,
      status: it.status,
      poster: typeof it.poster === 'string' ? it.poster : null,
      note: typeof it.note === 'string' ? it.note : null,
      source: typeof it.source === 'string' && SOURCES.includes(it.source) ? it.source : 'manual',
      createdAt: typeof it.createdAt === 'number' ? it.createdAt : Date.now(),
      updatedAt: typeof it.updatedAt === 'number' ? it.updatedAt : Date.now(),
    });
  }
  return out;
}

function toDTO(r: typeof watchItems.$inferSelect): WatchItemDTO {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    status: r.status,
    poster: r.poster,
    note: r.note,
    source: r.source,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function watchlistRoutes(app: FastifyInstance): Promise<void> {
  app.get('/watchlist', async (): Promise<{ items: WatchItemDTO[] }> => ({
    items: db
      .select()
      .from(watchItems)
      .all()
      .filter((r) => r.deletedAt == null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDTO),
  }));

  app.put('/watchlist', async (req) => {
    const body = (req.body ?? {}) as { items?: unknown };
    const incoming = cleanItems(body.items);
    const ts = Date.now();
    const incomingIds = new Set(incoming.map((i) => i.id));
    const existing = db.select().from(watchItems).all();

    for (const it of incoming) {
      const cur = existing.find((e) => e.id === it.id);
      if (cur) {
        db.update(watchItems)
          .set({
            title: it.title,
            category: it.category,
            status: it.status,
            poster: it.poster,
            note: it.note,
            source: it.source,
            updatedAt: ts,
            deletedAt: null,
          })
          .where(eq(watchItems.id, it.id))
          .run();
      } else {
        // 保留客户端时间戳（全量替换时维持相对排序），缺省才用服务器时间
        db.insert(watchItems)
          .values({
            id: it.id,
            title: it.title,
            category: it.category,
            status: it.status,
            poster: it.poster,
            note: it.note,
            source: it.source,
            createdAt: it.createdAt || ts,
            updatedAt: it.updatedAt || ts,
          })
          .run();
      }
    }
    // 本次没出现的 → 软删墓碑
    for (const e of existing) {
      if (e.deletedAt == null && !incomingIds.has(e.id)) {
        db.update(watchItems).set({ deletedAt: ts, updatedAt: ts }).where(eq(watchItems.id, e.id)).run();
      }
    }
    return { ok: true };
  });
}

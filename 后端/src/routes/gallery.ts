import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { galleryItems } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 相册（together → gallery）：本地优先的图片墙。
 *
 * **不重复存图片本体**：图片本体只有一条上传通道（`POST /api/upload` → `data/uploads`），
 * 这里只存 URL + 元数据（备注 / 标签 / 拍摄时间）。所以这个路由不接收 base64。
 *
 * 不做 AI 视觉描述（那要模型密钥，本机还没有）——但 `note` 字段是留给它的：
 * 将来接上多模态，往同一个字段写就行，不用改表。
 */

/** 标签统一存 JSON 字符串数组；容忍逗号/换行分隔的输入 */
function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          return [...new Set(arr.map((t) => String(t).trim()).filter(Boolean))];
        }
      } catch {
        /* 落到下面的分隔符解析 */
      }
    }
    return [...new Set(s.split(/[,，\n]/).map((t) => t.trim()).filter(Boolean))];
  }
  return [];
}

function readTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

interface GalleryBody {
  url?: string;
  name?: string;
  mime?: string;
  note?: string;
  tags?: unknown;
  takenAt?: number;
  sortOrder?: number;
}

function liveRows() {
  return db
    .select()
    .from(galleryItems)
    .all()
    .filter((g) => g.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || (b.takenAt ?? b.createdAt) - (a.takenAt ?? a.createdAt));
}

function toDTO(g: ReturnType<typeof liveRows>[number]) {
  return {
    id: g.id,
    url: g.url,
    name: g.name,
    mime: g.mime,
    note: g.note,
    tags: readTags(g.tags),
    takenAt: g.takenAt,
    sortOrder: g.sortOrder,
    createdAt: g.createdAt,
  };
}

export async function galleryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/gallery', async (req) => {
    const { tag } = (req.query ?? {}) as { tag?: string };
    const rows = liveRows();
    const t = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
    const filtered = t ? rows.filter((g) => readTags(g.tags).some((x) => x.toLowerCase() === t)) : rows;
    return filtered.map(toDTO);
  });

  /** 全部标签 + 计数（给筛选条用） */
  app.get('/gallery/tags', async () => {
    const counts = new Map<string, number>();
    for (const g of liveRows()) {
      for (const t of readTags(g.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  });

  app.post('/gallery', async (req, reply) => {
    const body = (req.body ?? {}) as GalleryBody;
    const url = body.url?.trim();
    if (!url) {
      reply.code(400).send({ message: 'url 必填（先用 POST /api/upload 上传图片）' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(galleryItems)
      .values({
        id,
        url,
        name: body.name ?? null,
        mime: body.mime ?? null,
        note: body.note ?? null,
        tags: JSON.stringify(parseTags(body.tags)),
        takenAt: body.takenAt ?? ts,
        sortOrder: body.sortOrder ?? 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/gallery/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as GalleryBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name;
    if (body.note !== undefined) set.note = body.note;
    if (body.tags !== undefined) set.tags = JSON.stringify(parseTags(body.tags));
    if (body.takenAt !== undefined) set.takenAt = body.takenAt;
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(galleryItems).set(set).where(eq(galleryItems.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '相册条目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  /**
   * 软删除。
   * 有意**不删磁盘文件**：同一条 upload 可能还被别的消息引用（发过的图也用同一个 URL），
   * 删文件会连带把聊天记录里的图弄成裂图。图片本来就小，先留着。
   */
  app.delete('/gallery/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(galleryItems).set({ deletedAt: ts, updatedAt: ts }).where(eq(galleryItems.id, id)).run();
    return { ok: true };
  });
}

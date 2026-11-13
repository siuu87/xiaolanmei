import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { diaries, diaryBooks } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 日记路由（阶段 7 收尾）：情侣双方日记的持久化。
 * 前端用 crypto.randomUUID 生成 id 原样落库（与 messages 一致），后端做哑存储。
 *
 * 2026-11-11 Paper 式日记本改版：
 * - `diaries` 新增 `book_id` 归属日记本（空 = 归「我的日记」）；
 * - `/diary/books` 提供日记本封面墙的 CRUD（建本 / 改名 / 换封面 / 改类型 / 排序 / 软删）。
 */

function toDTO(d: typeof diaries.$inferSelect) {
  return {
    id: d.id,
    date: d.date,
    author: d.author,
    content: d.content,
    bookId: d.bookId,
    // 一页可带多张图（/api/files/xxx），库里存 JSON 字符串
    images: parseImages(d.images),
    createdAt: d.createdAt,
  };
}

/** images 列 → string[]，脏数据一律当空数组，别让一页日记因为 JSON 坏了打不开 */
function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string' && !!u);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && !!u) : [];
  } catch {
    return [];
  }
}

/** 入参 images → 入库字符串（只留字符串、去重、限 9 张，base64 不入库只存 URL） */
function imagesToColumn(v: unknown): string {
  return JSON.stringify(parseImages(v).slice(0, 9));
}

function toBookDTO(b: typeof diaryBooks.$inferSelect) {
  return {
    id: b.id,
    name: b.name,
    kind: b.kind,
    cover: b.cover,
    // 上锁：locked 存 0/1，前端要 boolean；lockCode 只是本机仪式感，前端校验
    locked: !!b.locked,
    lockCode: b.lockCode,
    sortOrder: b.sortOrder,
    createdAt: b.createdAt,
  };
}

/** 密码统一成 0~4 位数字，避免前端传进来奇怪字符 */
function normCode(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').slice(0, 4);
}

export async function diaryRoutes(app: FastifyInstance): Promise<void> {
  // ---- 日记本（封面墙）----
  app.get('/diary/books', async () => {
    return db
      .select()
      .from(diaryBooks)
      .all()
      .filter((b) => b.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map(toBookDTO);
  });

  app.post('/diary/books', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string; name?: string; kind?: string; cover?: string; locked?: boolean; lockCode?: string;
    };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const count = db.select().from(diaryBooks).all().filter((b) => b.deletedAt == null).length;
    db.insert(diaryBooks)
      .values({
        id,
        name,
        kind: body.kind === 'partner' || body.kind === 'couple' ? body.kind : 'me',
        cover: body.cover?.trim() || '#7c5cff',
        locked: body.locked ? 1 : 0,
        lockCode: normCode(body.lockCode),
        sortOrder: count,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id });
  });

  app.patch('/diary/books/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string; kind?: string; cover?: string; locked?: boolean; lockCode?: string;
    };
    const patch: Partial<{ name: string; kind: string; cover: string; locked: number; lockCode: string }> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.kind !== undefined && ['me', 'partner', 'couple'].includes(body.kind)) patch.kind = body.kind;
    if (body.cover !== undefined) patch.cover = body.cover.trim();
    if (body.locked !== undefined) patch.locked = body.locked ? 1 : 0;
    if (body.lockCode !== undefined) patch.lockCode = normCode(body.lockCode);
    if (Object.keys(patch).length === 0) return { ok: true };
    db.update(diaryBooks).set({ ...patch, updatedAt: now() }).where(eq(diaryBooks.id, id)).run();
    return { ok: true };
  });

  app.delete('/diary/books/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(diaryBooks).set({ deletedAt: ts, updatedAt: ts }).where(eq(diaryBooks.id, id)).run();
    // 本子里的日记软删（保留数据，可恢复）
    db.update(diaries).set({ deletedAt: ts, updatedAt: ts }).where(eq(diaries.bookId, id)).run();
    return { ok: true };
  });

  // ---- 日记条目 ----
  app.get('/diaries', async (req) => {
    const { book } = req.query as { book?: string };
    return db
      .select()
      .from(diaries)
      .all()
      .filter((d) => d.deletedAt == null && (!book || d.bookId === book))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/diaries', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string; date?: string; author?: string; content?: string; bookId?: string; images?: unknown;
    };
    const date = body.date?.trim();
    const content = body.content?.trim() ?? '';
    const images = parseImages(body.images);
    // 文字与图片至少要有一个（一页可以只有一张图）
    if (!date || (!content && images.length === 0)) {
      reply.code(400).send({ message: 'date 必填，content 与 images 至少给一个' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(diaries)
      .values({
        id,
        date,
        author: body.author === 'partner' ? 'partner' : 'me',
        content,
        bookId: body.bookId?.trim() || '',
        images: imagesToColumn(images),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/diaries/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { date?: string; content?: string; bookId?: string; images?: unknown };
    const patch: Partial<{ date: string; content: string; bookId: string; images: string }> = {};
    if (body.date !== undefined) patch.date = body.date.trim();
    if (body.content !== undefined) patch.content = body.content;
    if (body.bookId !== undefined) patch.bookId = body.bookId.trim();
    if (body.images !== undefined) patch.images = imagesToColumn(body.images);
    if (Object.keys(patch).length === 0) return { ok: true };
    db.update(diaries).set({ ...patch, updatedAt: now() }).where(eq(diaries.id, id)).run();
    return { ok: true };
  });

  app.delete('/diaries/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(diaries).set({ deletedAt: ts, updatedAt: ts }).where(eq(diaries.id, id)).run();
    return { ok: true };
  });
}

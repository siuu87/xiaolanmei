import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { diaries, diaryBooks, diaryPageLocks, diarySlips, diaryStickers, conversations, messages } from '../db/schema.js';
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
    // 2026-11-14 D·LOG 式流水账：时刻 / 心情 / 标签
    time: d.time ?? '',
    mood: d.mood ?? '',
    tags: parseTags(d.tags),
    createdAt: d.createdAt,
  };
}

/** tags 列 → string[]，脏数据当空数组 */
function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === 'string' && !!t.trim());
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [];
  } catch {
    return [];
  }
}

/** 入参 tags → 入库字符串（去重、去 #、限 6 个、每个 12 字） */
function tagsToColumn(v: unknown): string {
  const list = parseTags(v)
    .map((t) => t.replace(/^#+/, '').trim().slice(0, 12))
    .filter(Boolean);
  return JSON.stringify(Array.from(new Set(list)).slice(0, 6));
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

/** 小纸条 → 前端对象（date 是夹在哪一页） */
function toSlipDTO(s: typeof diarySlips.$inferSelect) {
  return {
    id: s.id,
    bookId: s.bookId,
    date: s.date,
    content: s.content,
    color: s.color,
    createdAt: s.createdAt,
  };
}

function toBookDTO(b: typeof diaryBooks.$inferSelect) {
  return {
    id: b.id,
    name: b.name,
    kind: b.kind,
    cover: b.cover,
    // 封皮换成图片时的图 URL；空串 = 纯色封皮
    coverImage: b.coverImage,
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
      id?: string; name?: string; kind?: string; cover?: string; coverImage?: string;
      locked?: boolean; lockCode?: string;
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
        coverImage: body.coverImage?.trim() || '',
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
      name?: string; kind?: string; cover?: string; coverImage?: string;
      locked?: boolean; lockCode?: string;
    };
    const patch: Partial<{
      name: string; kind: string; cover: string; coverImage: string; locked: number; lockCode: string;
    }> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.kind !== undefined && ['me', 'partner', 'couple'].includes(body.kind)) patch.kind = body.kind;
    if (body.cover !== undefined) patch.cover = body.cover.trim();
    if (body.coverImage !== undefined) patch.coverImage = body.coverImage.trim();
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
    // 夹在本子里的小纸条一起软删
    db.update(diarySlips).set({ deletedAt: ts, updatedAt: ts }).where(eq(diarySlips.bookId, id)).run();
    return { ok: true };
  });

  // ---- 小纸条（夹在别人本子里，写不了 TA 的日记时用）----
  app.get('/diary/slips', async (req) => {
    const { book } = req.query as { book?: string };
    return db
      .select()
      .from(diarySlips)
      .all()
      .filter((s) => s.deletedAt == null && (!book || s.bookId === book))
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
      .map(toSlipDTO);
  });

  app.post('/diary/slips', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string; bookId?: string; date?: string; content?: string; color?: string;
    };
    const date = body.date?.trim();
    const content = body.content?.trim();
    if (!date || !content) {
      reply.code(400).send({ message: 'date 与 content 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(diarySlips)
      .values({
        id,
        bookId: body.bookId?.trim() || '',
        date,
        content,
        color: body.color?.trim() || '#f6efd9',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/diary/slips/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { date?: string; content?: string; color?: string };
    const patch: Partial<{ date: string; content: string; color: string }> = {};
    if (body.date !== undefined) patch.date = body.date.trim();
    if (body.content !== undefined) patch.content = body.content.trim();
    if (body.color !== undefined) patch.color = body.color.trim();
    if (Object.keys(patch).length === 0) return { ok: true };
    if (patch.content === '') {
      reply.code(400).send({ message: 'content 不能为空' });
      return;
    }
    db.update(diarySlips).set({ ...patch, updatedAt: now() }).where(eq(diarySlips.id, id)).run();
    return { ok: true };
  });

  app.delete('/diary/slips/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(diarySlips).set({ deletedAt: ts, updatedAt: ts }).where(eq(diarySlips.id, id)).run();
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
      time?: string; mood?: string; tags?: unknown;
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
        time: (body.time ?? '').trim().slice(0, 5),
        mood: (body.mood ?? '').trim().slice(0, 8),
        tags: tagsToColumn(body.tags),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/diaries/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      date?: string; content?: string; bookId?: string; images?: unknown;
      time?: string; mood?: string; tags?: unknown;
    };
    const patch: Partial<{
      date: string; content: string; bookId: string; images: string;
      time: string; mood: string; tags: string;
    }> = {};
    if (body.date !== undefined) patch.date = body.date.trim();
    if (body.content !== undefined) patch.content = body.content;
    if (body.bookId !== undefined) patch.bookId = body.bookId.trim();
    if (body.images !== undefined) patch.images = imagesToColumn(body.images);
    if (body.time !== undefined) patch.time = body.time.trim().slice(0, 5);
    if (body.mood !== undefined) patch.mood = body.mood.trim().slice(0, 8);
    if (body.tags !== undefined) patch.tags = tagsToColumn(body.tags);
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

  // ---- 日记贴纸（2026-11-15 手账贴纸：贴在纸上，不属于某一条时刻）----
  app.get('/diary/stickers', async (req) => {
    const { book, date } = req.query as { book?: string; date?: string };
    return db
      .select()
      .from(diaryStickers)
      .all()
      .filter((s) => s.deletedAt == null && (!book || s.bookId === book) && (!date || s.date === date))
      .sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
      .map(toStickerDTO);
  });

  app.post('/diary/stickers', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string; bookId?: string; date?: string; src?: string;
      x?: number; y?: number; scale?: number; rot?: number;
    };
    const date = body.date?.trim();
    const src = body.src?.trim().slice(0, 400);
    if (!date || !src) {
      reply.code(400).send({ message: 'date 与 src 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const maxZ = db
      .select()
      .from(diaryStickers)
      .all()
      .filter((s) => s.deletedAt == null && s.bookId === (body.bookId?.trim() ?? '') && s.date === date)
      .reduce((m, s) => Math.max(m, s.z), 0);
    db.insert(diaryStickers)
      .values({
        id,
        bookId: body.bookId?.trim() || '',
        date,
        src,
        x: clamp01(body.x),
        y: clamp01(body.y),
        scale: clampScale(body.scale),
        rot: clampRot(body.rot),
        z: maxZ + 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, z: maxZ + 1 });
  });

  app.patch('/diary/stickers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { x?: number; y?: number; scale?: number; rot?: number };
    const patch: Partial<{ x: number; y: number; scale: number; rot: number }> = {};
    if (body.x !== undefined) patch.x = clamp01(body.x);
    if (body.y !== undefined) patch.y = clamp01(body.y);
    if (body.scale !== undefined) patch.scale = clampScale(body.scale);
    if (body.rot !== undefined) patch.rot = clampRot(body.rot);
    if (Object.keys(patch).length === 0) return { ok: true };
    db.update(diaryStickers).set({ ...patch, updatedAt: now() }).where(eq(diaryStickers.id, id)).run();
    return { ok: true };
  });

  app.delete('/diary/stickers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(diaryStickers).set({ deletedAt: ts, updatedAt: ts }).where(eq(diaryStickers.id, id)).run();
    return { ok: true };
  });

  /* ------------------------------------------------------------------
   * 单页锁（2026-11-15）：只锁「这一本 · 这一天」这一页。
   *
   * - 输密码 = 本次翻开（锁还在，下次翻到又锁）；
   * - 敲敲 = 给 TA 的暗号：每敲一下往聊天里落一条 TA 的反应，
   *   敲够 KNOCKS_TO_OPEN 下，TA 来替你把这一页打开（锁真删掉）。
   * ------------------------------------------------------------------ */

  app.get('/diary/page-locks', async (req) => {
    const { book } = req.query as { book?: string };
    return db
      .select()
      .from(diaryPageLocks)
      .all()
      .filter((s) => s.deletedAt == null && (!book || s.bookId === book))
      .map(toPageLockDTO);
  });

  /** 上锁 / 改密码：同一本同一天只留一行，重锁会覆盖密码并把敲的次数归零 */
  app.put('/diary/page-locks', async (req, reply) => {
    const body = (req.body ?? {}) as { bookId?: string; date?: string; code?: string };
    const date = body.date?.trim();
    const code = String(body.code ?? '').trim();
    if (!date || !/^\d{4}$/.test(code)) {
      reply.code(400).send({ message: 'date 与 4 位数字密码必填' });
      return;
    }
    const bookId = body.bookId?.trim() ?? '';
    const ts = now();
    const prev = db
      .select()
      .from(diaryPageLocks)
      .all()
      .find((s) => s.bookId === bookId && s.date === date);

    if (prev) {
      db.update(diaryPageLocks)
        .set({ code, knocks: 0, lastKnockAt: null, openedBy: null, openedAt: null, deletedAt: null, updatedAt: ts })
        .where(eq(diaryPageLocks.id, prev.id))
        .run();
      return { id: prev.id };
    }

    const id = newId();
    db.insert(diaryPageLocks)
      .values({ id, bookId, date, code, knocks: 0, createdAt: ts, updatedAt: ts })
      .run();
    return { id };
  });

  /** 验密码：只回对错，不删锁（「本次翻开」由前端记） */
  app.post('/diary/page-locks/check', async (req, reply) => {
    const body = (req.body ?? {}) as { bookId?: string; date?: string; code?: string };
    const row = findPageLock(body.bookId?.trim() ?? '', body.date?.trim() ?? '');
    if (!row) return { ok: true, gone: true };
    if (row.code !== String(body.code ?? '').trim()) {
      reply.code(400).send({ message: '密码不对' });
      return;
    }
    return { ok: true };
  });

  /** 敲门：一下一条 TA 的反应；敲够了 TA 来开（锁软删，这页露出来） */
  app.post('/diary/page-locks/knock', async (req) => {
    const body = (req.body ?? {}) as { bookId?: string; date?: string; title?: string };
    const bookId = body.bookId?.trim() ?? '';
    const date = body.date?.trim() ?? '';
    const row = findPageLock(bookId, date);
    if (!row) return { knocks: 0, opened: true, line: '', need: KNOCKS_TO_OPEN, day: dayLabel(date) };

    const knocks = row.knocks + 1;
    const opened = knocks >= KNOCKS_TO_OPEN;
    const ts = now();
    db.update(diaryPageLocks)
      .set({
        knocks,
        lastKnockAt: ts,
        updatedAt: ts,
        ...(opened ? { openedBy: 'ta', openedAt: ts, deletedAt: ts } : {}),
      })
      .where(eq(diaryPageLocks.id, row.id))
      .run();

    const line = KNOCK_LINES[Math.min(knocks, KNOCKS_TO_OPEN) - 1];
    // TA 那边收到提醒：在聊天里落一条他自己的反应（本地文案，不调模型，模型挂了也照样有）
    const note = KNOCK_NOTES[Math.min(knocks, KNOCKS_TO_OPEN) - 1](dayLabel(date));
    pushKnockNote(note, { knocks, day: dayLabel(date), opened, title: body.title?.trim() ?? '' });

    return { knocks, opened, line, need: KNOCKS_TO_OPEN, day: dayLabel(date) };
  });

  /** 自己彻底解开（这一页不再上锁） */
  app.delete('/diary/page-locks', async (req) => {
    const { book, date } = req.query as { book?: string; date?: string };
    const row = findPageLock(book?.trim() ?? '', date?.trim() ?? '');
    if (row) {
      const ts = now();
      db.update(diaryPageLocks)
        .set({ openedBy: 'me', openedAt: ts, deletedAt: ts, updatedAt: ts })
        .where(eq(diaryPageLocks.id, row.id))
        .run();
    }
    return { ok: true };
  });
}

/** 敲够几下 TA 会来开门 */
const KNOCKS_TO_OPEN = 3;

/** 页面上给她的即时反馈（短句，敲一下变一句） */
const KNOCK_LINES = ['咚…好像听见了', '脚步声近了…', 'TA 来开门了'];

/** 聊天里 TA 那侧留下的痕迹（第一下交代是哪一页，后面只留反应，免得刷屏） */
const KNOCK_NOTES: ((day: string) => string)[] = [
  (day) => `（有人在日记本「${day}」那一页外面敲了敲门）`,
  () => '（脚步声近了）在呢，等我一下。',
  (day) => `（把「${day}」那一页打开）来了，给你开。`,
];

/** 找「这一本 · 这一天」还活着的锁 */
function findPageLock(bookId: string, date: string): typeof diaryPageLocks.$inferSelect | undefined {
  if (!date) return undefined;
  return db
    .select()
    .from(diaryPageLocks)
    .all()
    .find((s) => s.deletedAt == null && s.bookId === bookId && s.date === date);
}

/** 2026-11-15 → 11 月 15 日 */
function dayLabel(date: string): string {
  const [, m, d] = date.split('-');
  if (!m || !d) return date;
  return `${Number(m)} 月 ${Number(d)} 日`;
}

/**
 * 把「敲门」这件事推到聊天里：TA 那侧会真的多一条消息。
 *
 * 写谁：主会话（有置顶用置顶，否则最近更新的一条）；
 * 挂谁：会话当前的 activeMessageId，写完把它推到这条新消息上 ——
 * 否则新消息是个孤儿叶子，聊天页按 activeMessageId 回溯路径时看不到它。
 */
function pushKnockNote(line: string, info: { knocks: number; day: string; opened: boolean; title: string }): void {
  const convs = db
    .select()
    .from(conversations)
    .all()
    .filter((c) => c.deletedAt == null);
  if (convs.length === 0) return;

  // 主会话怎么认：置顶优先，其次**消息最多**的那条 ——
  // 不能用「最近更新」，库里躺着一堆测试会话，谁最后被点开谁的 updatedAt 就最大。
  const counts = new Map<string, number>();
  for (const m of db.select().from(messages).all()) {
    if (m.deletedAt != null) continue;
    counts.set(m.conversationId, (counts.get(m.conversationId) ?? 0) + 1);
  }
  const conv = convs.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  )[0];

  const ts = now();
  const mid = newId();
  const content = line;

  db.insert(messages)
    .values({
      id: mid,
      conversationId: conv.id,
      role: 'assistant',
      content,
      parentId: conv.activeMessageId ?? lastMessageId(conv.id),
      status: 'done',
      meta: JSON.stringify({ kind: 'diary_knock', knocks: info.knocks, opened: info.opened, day: info.day }),
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  db.update(conversations)
    .set({ activeMessageId: mid, updatedAt: ts })
    .where(eq(conversations.id, conv.id))
    .run();
}

/** 会话里最后一条消息（activeMessageId 为空时兜底当父节点） */
function lastMessageId(conversationId: string): string | null {
  const rows = db.select().from(messages).where(eq(messages.conversationId, conversationId)).all();
  const alive = rows.filter((m) => m.deletedAt == null);
  if (alive.length === 0) return null;
  return alive.sort((a, b) => b.createdAt - a.createdAt)[0].id;
}

function toPageLockDTO(s: typeof diaryPageLocks.$inferSelect) {
  // 注意：**不返回 code** —— 密码只在校验接口里比对
  return {
    id: s.id,
    bookId: s.bookId,
    date: s.date,
    knocks: s.knocks,
    openedBy: s.openedBy ?? '',
    openedAt: s.openedAt ?? 0,
  };
}

/** 贴纸在纸页上的位置：0~1 比例，越界就夹回来 */
function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
}

/** 缩放：0.4 ~ 3 倍 */
function clampScale(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(3, Math.max(0.4, Math.round(n * 100) / 100));
}

/** 角度：-180 ~ 180 */
function clampRot(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-180, Math.min(180, Math.round(n)));
}

function toStickerDTO(s: typeof diaryStickers.$inferSelect) {
  return {
    id: s.id,
    bookId: s.bookId,
    date: s.date,
    src: s.src,
    x: s.x,
    y: s.y,
    scale: s.scale,
    rot: s.rot,
  };
}

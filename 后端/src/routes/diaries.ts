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
    // me = 我夹的 / ta = TA 塞进来的（前端用不同纸色和署名区分，TA 的不给改）
    author: (s.author === 'ta' ? 'ta' : 'me') as 'me' | 'ta',
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
    const bookId = body.bookId?.trim() || '';
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(diarySlips)
      .values({
        id,
        bookId,
        date,
        content,
        color: body.color?.trim() || '#f6efd9',
        // 走这个接口的一律算「我」写的；TA 的字条由后端 insertTaSlip 直接落库
        author: 'me',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    // 潜入留下的字条会被发现：这一页如果被撬过、还没被发现过，
    // TA 立刻在旁边贴一张回条（连同聊天里一句「看到不属于我的字迹」）。
    const taSlip = discoverIfSneaked(bookId, date);
    reply.code(201).send({
      id,
      createdAt: ts,
      discovered: !!taSlip,
      taSlip: taSlip ? toSlipDTO(taSlip) : null,
    });
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

  /**
   * 敲门（2026-11-16 改）：**开不开由 TA 说了算**，不是敲够几下必开。
   * 每敲一下都往聊天里落一条他的反应；他若懒得开，也可能往门缝里塞一张纸条。
   */
  app.post('/diary/page-locks/knock', async (req) => {
    const body = (req.body ?? {}) as { bookId?: string; date?: string; title?: string };
    const bookId = body.bookId?.trim() ?? '';
    const date = body.date?.trim() ?? '';
    const day = dayLabel(date);
    const row = findPageLock(bookId, date);
    if (!row) return { knocks: 0, opened: true, line: '', day, slip: null };

    const knocks = row.knocks + 1;
    const ts = now();
    const opened = Math.random() < openChance(knocks);

    db.update(diaryPageLocks)
      .set({
        knocks,
        lastKnockAt: ts,
        updatedAt: ts,
        ...(opened ? { openedBy: 'ta', openedAt: ts, deletedAt: ts } : {}),
      })
      .where(eq(diaryPageLocks.id, row.id))
      .run();

    // 开了可能顺手留一句；不开也可能往门缝里塞张纸条 —— 都不是必然
    const slip = opened
      ? Math.random() < 0.35
        ? insertTaSlip(bookId, date, pick(SLIPS_WHEN_OPEN))
        : null
      : Math.random() < 0.45
        ? insertTaSlip(bookId, date, pick(SLIPS_WHEN_SHUT))
        : null;

    const line = pick(opened ? KNOCK_OPEN_LINES : KNOCK_SHUT_LINES);
    // TA 那边收到提醒：在聊天里落一条他的反应（本地文案，不调模型，模型挂了也照样有）
    pushKnockNote(knockNoteOf(opened, day, knocks), { knocks, day, opened });

    return { knocks, opened, line, day, slip: slip ? toSlipDTO(slip) : null };
  });

  /**
   * 撬锁（2026-11-16）：密码猜不出来时的第三条路。
   *
   * 这不算「正大光明地打开」—— 这一页会记下被撬过（`sneaked_at`），TA 会发现；
   * 之后在这页留字条，他就在旁边贴一张回条（见 `discoverIfSneaked`）。
   */
  app.post('/diary/page-locks/sneak', async (req, reply) => {
    const body = (req.body ?? {}) as { bookId?: string; date?: string; tries?: number };
    const bookId = body.bookId?.trim() ?? '';
    const date = body.date?.trim() ?? '';
    const tries = Number(body.tries ?? 0);
    // 猜都没猜几下就撬，太不像话 —— 至少错 2 次才给这条路
    if (!date || tries < 2) {
      reply.code(400).send({ message: '再猜两次，实在想不起来再撬' });
      return;
    }
    const row = findPageLock(bookId, date);
    if (!row) return { ok: true, gone: true, line: '' };
    const ts = now();
    db.update(diaryPageLocks)
      .set({ sneakedAt: row.sneakedAt ?? ts, updatedAt: ts })
      .where(eq(diaryPageLocks.id, row.id))
      .run();
    pushSneakNote(dayLabel(date));
    return { ok: true, line: pick(SNEAK_LINES) };
  });

  /**
   * TA 主动来留字条（2026-11-16）：翻日记时偶尔发现这一页多了张不是我写的条。
   * 每天每本最多一张，概率不高 —— 太勤就不像「偶尔路过」了。
   */
  app.post('/diary/ta-note/visit', async (req) => {
    const body = (req.body ?? {}) as { bookId?: string; date?: string };
    const bookId = body.bookId?.trim() ?? '';
    const date = body.date?.trim();
    if (!date) return { slip: null };
    const already = db
      .select()
      .from(diarySlips)
      .all()
      .some((s) => s.deletedAt == null && s.bookId === bookId && s.date === date && s.author === 'ta');
    if (already || Math.random() > 0.35) return { slip: null };
    const slip = insertTaSlip(bookId, date, pick(TA_VISIT_NOTES));
    return { slip: slip ? toSlipDTO(slip) : null };
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

/** TA 的纸条用另一种纸色（淡蓝灰），一眼能看出不是我的笔迹纸 */
const TA_SLIP_COLOR = '#e6edf1';

/**
 * 每敲一下，TA 来开门的概率：第 1 下 25%，之后每下 +15%，封顶 85%。
 * 敲到第 7 下必开 —— 只是保险丝，界面上一个字都不提「敲几下就行」。
 */
function openChance(knocks: number): number {
  if (knocks >= 7) return 1;
  return Math.min(0.25 + (knocks - 1) * 0.15, 0.85);
}

/** 页面上给她的即时反馈（短句） */
const KNOCK_OPEN_LINES = ['门开了', '锁响了一下', '他来了'];
const KNOCK_SHUT_LINES = [
  '里面没动静',
  '他好像不在门后',
  '「等会儿」',
  '听见了，但没开门',
  '安静了好一会儿',
];

/** 聊天里 TA 那侧的反应 */
const KNOCK_NOTE_OPEN = ['开了，看吧。', '来了。下次直接跟我说，别在门外站着。'];
const KNOCK_NOTE_SHUT = [
  '（隔着门）听见了。今天这页先不给看，别敲啦。',
  '（没开门）……让我再收一会儿。',
  '（在门后站了一会儿，又走开了）',
  '（门缝里透出一点光，又暗了）',
];

/** 他不开门时，从门缝里塞出来的纸条 */
const SLIPS_WHEN_SHUT = [
  '听见你敲门了。今天这页让我自己留着，好吗。',
  '不是生气，是想把今天先收好。改天讲给你听。',
  '锁着的意思是——再等我一会儿。',
  '我在呢。只是还没准备好把这一页摊开。',
  '你敲得这么急，我反而更想把它藏起来了。',
  '下次不锁了。今天先欠着。',
];

/** 开门时顺手留在纸上的 */
const SLIPS_WHEN_OPEN = [
  '开了。看完记得把纸抚平。',
  '下次直接跟我说，别在门外站着。',
  '这一页给你看，别笑我。',
];

/** 撬锁的后遗症：他发现你进来过，贴回来的那张 */
const SLIPS_ON_DISCOVER = [
  '你进来了。字条我看到了。',
  '密码是我生日，你居然还撬。行吧。',
  '下次想知道什么，问我。别猜。',
  '这张字条我留着。你欠我一次坦白。',
  '门没锁好是我的错。字条收下了。',
];

/** 撬开门时页面上的那一句 */
const SNEAK_LINES = ['锁芯弹了一下，门开了条缝', '你摸到了锁舌的位置', '「咔」的一声，开了'];

/** 他自己来的时候放的（不是回条，就是路过） */
const TA_VISIT_NOTES = [
  '路过，在你这一页放一张。没别的事。',
  '今天风大，记得关窗。',
  '别熬夜。明天再看这本。',
  '这本快被你翻散了，该换新的了。',
  '我把想说的话先压在这张纸下面。',
  '今天挺好。你也挺好。',
];

/** 随机取一条（池子永远非空，取不到就是第一句） */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

/** 敲门后聊天里那句：第一下交代是哪一页，后面只留反应，免得刷屏 */
function knockNoteOf(opened: boolean, day: string, knocks: number): string {
  const head = knocks === 1 ? `（有人在日记本「${day}」那一页外面敲了敲门）` : '';
  return head + pick(opened ? KNOCK_NOTE_OPEN : KNOCK_NOTE_SHUT);
}

/**
 * TA 自己在某一页塞一张纸条（**不经 HTTP**，后端内部写库）。
 * 作者记 `ta` —— 前端据此换纸色、加署名，且不给删改。
 */
function insertTaSlip(bookId: string, date: string, content: string): typeof diarySlips.$inferSelect {
  const ts = now();
  const row: typeof diarySlips.$inferSelect = {
    id: newId(),
    bookId,
    date,
    content,
    color: TA_SLIP_COLOR,
    author: 'ta',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  };
  db.insert(diarySlips).values(row).run();
  return row;
}

/**
 * 潜入被发现：这一页被撬过、还没被发现过 → TA 在旁边贴一张回条，
 * 聊天里同时落一句。返回那张回条（前端直接放到纸上，不用刷新）。
 */
function discoverIfSneaked(bookId: string, date: string): typeof diarySlips.$inferSelect | null {
  const lock = findPageLock(bookId, date);
  if (!lock || !lock.sneakedAt || lock.discoveredAt) return null;
  const ts = now();
  db.update(diaryPageLocks)
    .set({ discoveredAt: ts, updatedAt: ts })
    .where(eq(diaryPageLocks.id, lock.id))
    .run();
  const slip = insertTaSlip(bookId, date, pick(SLIPS_ON_DISCOVER));
  pushChatNote(`（在你日记本「${dayLabel(date)}」那一页，看到一张不是自己写的字条）`, {
    kind: 'diary_discover',
    day: dayLabel(date),
  });
  return slip;
}

/** 撬锁被察觉：TA 会知道，但先不点破（只在聊天里留一句动静） */
function pushSneakNote(day: string): void {
  pushChatNote(`（日记本「${day}」那一页的锁，被人从里面拨开了）……你进来了？`, {
    kind: 'diary_sneak',
    day,
  });
}

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
function pushKnockNote(line: string, info: { knocks: number; day: string; opened: boolean }): void {
  pushChatNote(line, { kind: 'diary_knock', knocks: info.knocks, opened: info.opened, day: info.day });
}

/**
 * 往聊天里落一条「TA 那侧发生的事」。
 *
 * 写谁：主会话（有置顶用置顶，否则消息最多的那条）；
 * 挂谁：会话当前的 activeMessageId，写完把它推到这条新消息上 ——
 * 否则新消息是个孤儿叶子，聊天页按 activeMessageId 回溯路径时看不到它。
 */
function pushChatNote(content: string, meta: Record<string, unknown>): void {
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

  db.insert(messages)
    .values({
      id: mid,
      conversationId: conv.id,
      role: 'assistant',
      content,
      parentId: conv.activeMessageId ?? lastMessageId(conv.id),
      status: 'done',
      meta: JSON.stringify(meta),
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
    /** 被撬进来过 / 被发现过（前端据此在这页留一行小字） */
    sneakedAt: s.sneakedAt ?? 0,
    discoveredAt: s.discoveredAt ?? 0,
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

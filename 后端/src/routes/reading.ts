import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { annotationNotes, annotations, books, readingLogs, readingProgress } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { extractReadable, parseFanqiePage, parseFanqieUrl } from '../reading/sources.js';

/**
 * 一起读 / 书房路由：书目、双人进度、划线批注与双人留言。
 * 正文 content 按 \\n\\n 分段，chapter 即段落索引（0 起），offset 为段内字符偏移。
 */

function parseToc(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/** 正文段落数（totalChapters 按段落数计） */
function paragraphCount(content: string | null): number {
  const n = (content ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
  return n || 1;
}

function parseSourceMeta(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bookDTO(b: typeof books.$inferSelect) {
  return {
    id: b.id,
    title: b.title,
    author: b.author ?? undefined,
    coverUrl: b.coverUrl ?? undefined,
    totalChapters: b.totalChapters,
    content: b.content ?? '',
    desc: b.desc ?? undefined,
    toc: parseToc(b.toc),
    color: b.color ?? undefined,
    band: b.band ?? undefined,
    height: b.height ?? undefined,
    source: b.source,
    sourceId: b.sourceId ?? undefined,
    sourceMeta: parseSourceMeta(b.sourceMeta),
    lastSyncedAt: b.lastSyncedAt ?? undefined,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

function progressDTO(p: typeof readingProgress.$inferSelect) {
  return {
    reader: p.reader,
    currentChapter: p.currentChapter,
    currentPosition: p.currentPosition,
    percent: p.percent,
    syncStatus: p.syncStatus,
    lastSyncedAt: p.lastSyncedAt ?? undefined,
    updatedAt: p.updatedAt,
  };
}

function noteDTO(n: typeof annotationNotes.$inferSelect) {
  return {
    id: n.id,
    annotationId: n.annotationId,
    author: n.author,
    content: n.content,
    createdAt: n.createdAt,
  };
}

async function annotationDTO(a: typeof annotations.$inferSelect) {
  const notes = db
    .select()
    .from(annotationNotes)
    .all()
    .filter((n) => n.annotationId === a.id && n.deletedAt == null)
    .sort((x, y) => x.createdAt - y.createdAt)
    .map(noteDTO);
  return {
    id: a.id,
    bookId: a.bookId,
    chapter: a.chapter,
    startOffset: a.startOffset,
    endOffset: a.endOffset,
    selectedText: a.selectedText,
    color: a.color,
    createdAt: a.createdAt,
    notes,
  };
}

const FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/** 抓网页（15s 超时、带浏览器 UA，避免被当成爬虫直接 403） */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': FETCH_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`);
  return res.text();
}

export async function readingRoutes(app: FastifyInstance): Promise<void> {
  // ---- 书目 ----
  app.get('/reading/books', async () => {
    return db
      .select()
      .from(books)
      .all()
      .filter((b) => b.deletedAt == null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => bookDTO(b));
  });

  app.get('/reading/books/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = db.select().from(books).all().find((x) => x.id === id && x.deletedAt == null);
    if (!b) {
      reply.code(404).send({ message: '书不存在' });
      return;
    }
    return bookDTO(b);
  });

  app.post('/reading/books', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      title?: string;
      author?: string;
      coverUrl?: string;
      content?: string;
      desc?: string;
      toc?: string[];
      color?: string;
      band?: string;
      height?: number;
      source?: string;
      sourceId?: string;
      sourceMeta?: Record<string, unknown>;
    };
    const title = body.title?.trim();
    if (!title) {
      reply.code(400).send({ message: 'title 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const content = body.content ?? null;
    const tocArr = Array.isArray(body.toc) ? body.toc.map((x) => String(x)).filter(Boolean) : [];
    const source = ['local', 'weread', 'fanqie'].includes(body.source ?? '') ? body.source! : 'local';
    db.insert(books)
      .values({
        id,
        title,
        author: body.author?.trim() || null,
        coverUrl: body.coverUrl?.trim() || null,
        totalChapters: content?.trim() ? paragraphCount(content) : Math.max(1, tocArr.length),
        content,
        desc: body.desc?.trim() || null,
        toc: tocArr.length ? JSON.stringify(tocArr) : null,
        color: body.color || null,
        band: body.band || null,
        height: body.height ?? null,
        source,
        sourceId: body.sourceId?.trim() || null,
        sourceMeta: body.sourceMeta ? JSON.stringify(body.sourceMeta) : null,
        lastSyncedAt: source === 'local' ? null : ts,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.put('/reading/books/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      title?: string;
      author?: string;
      coverUrl?: string | null;
      content?: string;
      desc?: string | null;
      toc?: string[];
      color?: string | null;
      band?: string | null;
      height?: number | null;
      sourceMeta?: Record<string, unknown> | null;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) set.title = body.title.trim();
    if (body.author !== undefined) set.author = body.author.trim() || null;
    if (body.coverUrl !== undefined) set.coverUrl = body.coverUrl || null;
    if (body.content !== undefined) {
      set.content = body.content;
      set.totalChapters = paragraphCount(body.content);
    }
    if (body.desc !== undefined) set.desc = body.desc || null;
    if (body.toc !== undefined) set.toc = body.toc.length ? JSON.stringify(body.toc) : null;
    if (body.color !== undefined) set.color = body.color || null;
    if (body.band !== undefined) set.band = body.band || null;
    if (body.height !== undefined) set.height = body.height ?? null;
    if (body.sourceMeta !== undefined) {
      set.sourceMeta = body.sourceMeta ? JSON.stringify(body.sourceMeta) : null;
    }

    const result = db.update(books).set(set).where(eq(books.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '书不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/reading/books/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(books).set({ deletedAt: ts, updatedAt: ts }).where(eq(books.id, id)).run();
    return { ok: true };
  });

  // ---- 双人进度 ----
  app.get('/reading/progress', async (req) => {
    const { bookId } = req.query as { bookId?: string };
    if (!bookId) return [];
    return db
      .select()
      .from(readingProgress)
      .all()
      .filter((p) => p.bookId === bookId && p.deletedAt == null)
      .map(progressDTO);
  });

  app.put('/reading/progress', async (req, reply) => {
    const body = (req.body ?? {}) as {
      bookId?: string;
      reader?: string;
      currentChapter?: number;
      currentPosition?: number;
      percent?: number;
    };
    const bookId = body.bookId?.trim();
    const reader = body.reader === 'partner' ? 'partner' : 'me';
    if (!bookId) {
      reply.code(400).send({ message: 'bookId 必填' });
      return;
    }
    const ts = now();
    const existing = db
      .select()
      .from(readingProgress)
      .all()
      .find((p) => p.bookId === bookId && p.reader === reader && p.deletedAt == null);

    const currentChapter = Math.max(1, Math.round(body.currentChapter ?? 1));
    const currentPosition = Math.max(0, Math.round(body.currentPosition ?? 0));
    const percent = Math.min(100, Math.max(0, Math.round(body.percent ?? 0)));
    const book = db
      .select()
      .from(books)
      .all()
      .find((b) => b.id === bookId && b.deletedAt == null);
    const syncStatus = book && book.source !== 'local' ? 'pending' : 'local';

    if (existing) {
      db.update(readingProgress)
        .set({ currentChapter, currentPosition, percent, syncStatus, updatedAt: ts })
        .where(eq(readingProgress.id, existing.id))
        .run();
    } else {
      db.insert(readingProgress)
        .values({
          id: newId(),
          bookId,
          reader,
          currentChapter,
          currentPosition,
          percent,
          syncStatus,
          updatedAt: ts,
        })
        .run();
    }
    reply.send({ ok: true, reader, percent });
  });

  // ---- 划线批注 ----
  app.get('/reading/annotations', async (req) => {
    const { bookId, chapter } = req.query as { bookId?: string; chapter?: string };
    const rows = db
      .select()
      .from(annotations)
      .all()
      .filter((a) => a.deletedAt == null && (!bookId || a.bookId === bookId) && (chapter == null || a.chapter === Number(chapter)))
      .sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(rows.map(annotationDTO));
  });

  app.post('/reading/annotations', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      bookId?: string;
      chapter?: number;
      startOffset?: number;
      endOffset?: number;
      selectedText?: string;
      color?: string;
    };
    const bookId = body.bookId?.trim();
    const selectedText = body.selectedText?.trim();
    if (!bookId || !selectedText) {
      reply.code(400).send({ message: 'bookId 与 selectedText 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const colors = ['yellow', 'green', 'blue', 'pink', 'violet', 'amber'];
    const color = colors.includes(body.color ?? '') ? body.color! : 'yellow';
    db.insert(annotations)
      .values({
        id,
        bookId,
        chapter: Math.max(0, Math.round(body.chapter ?? 0)),
        startOffset: Math.max(0, Math.round(body.startOffset ?? 0)),
        endOffset: Math.max(0, Math.round(body.endOffset ?? 0)),
        selectedText,
        color,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const a = db.select().from(annotations).all().find((x) => x.id === id)!;
    reply.code(201).send(await annotationDTO(a));
  });

  app.delete('/reading/annotations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(annotations).set({ deletedAt: ts, updatedAt: ts }).where(eq(annotations.id, id)).run();
    // 同步软删其下的留言
    const notes = db.select().from(annotationNotes).all().filter((n) => n.annotationId === id && n.deletedAt == null);
    for (const n of notes) {
      db.update(annotationNotes).set({ deletedAt: ts }).where(eq(annotationNotes.id, n.id)).run();
    }
    return { ok: true };
  });

  // ---- 批注留言（双人气泡） ----
  app.get('/reading/annotations/:id/notes', async (req) => {
    const { id } = req.params as { id: string };
    return db
      .select()
      .from(annotationNotes)
      .all()
      .filter((n) => n.annotationId === id && n.deletedAt == null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(noteDTO);
  });

  app.post('/reading/annotations/:id/notes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { id?: string; author?: string; content?: string };
    const content = body.content?.trim();
    if (!content) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const noteId = body.id?.trim() || newId();
    const ts = now();
    const author = body.author === 'partner' ? 'partner' : 'me';
    db.insert(annotationNotes)
      .values({ id: noteId, annotationId: id, author, content, createdAt: ts })
      .run();
    reply.code(201).send({ id: noteId, annotationId: id, author, content, createdAt: ts });
  });

  // ---- 阅读时长（分钟，按天累计） ----
  app.get('/reading/time', async (req) => {
    const { reader, from, to } = req.query as { reader?: string; from?: string; to?: string };
    const r = reader === 'partner' ? 'partner' : 'me';
    const rows = db
      .select()
      .from(readingLogs)
      .all()
      .filter((l) => l.deletedAt == null && l.reader === r && (!from || l.day >= from) && (!to || l.day <= to));
    const map = new Map<string, number>();
    for (const l of rows) map.set(l.day, (map.get(l.day) ?? 0) + l.minutes);
    return [...map.entries()].map(([day, minutes]) => ({ day, minutes })).sort((a, b) => a.day.localeCompare(b.day));
  });

  app.put('/reading/time', async (req, reply) => {
    const body = (req.body ?? {}) as { bookId?: string; reader?: string; day?: string; minutes?: number };
    const bookId = body.bookId?.trim();
    const day = body.day?.trim();
    const minutes = Math.max(0, Math.round(body.minutes ?? 0));
    if (!bookId || !day || minutes <= 0) {
      reply.code(400).send({ message: 'bookId / day / minutes 必填且 minutes>0' });
      return;
    }
    const reader = body.reader === 'partner' ? 'partner' : 'me';
    const ts = now();
    const existing = db
      .select()
      .from(readingLogs)
      .all()
      .find((l) => l.bookId === bookId && l.reader === reader && l.day === day && l.deletedAt == null);
    if (existing) {
      db.update(readingLogs).set({ minutes: existing.minutes + minutes, updatedAt: ts }).where(eq(readingLogs.id, existing.id)).run();
    } else {
      db.insert(readingLogs).values({ id: newId(), bookId, reader, day, minutes, createdAt: ts, updatedAt: ts }).run();
    }
    reply.send({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════
  // 多源书架（2026-10-19）
  // ═══════════════════════════════════════════════════════════

  /** 来源能力表：UI 用它决定哪些入口可用（不假装已接通微信读书） */
  app.get('/reading/sources', async () => ({
    sources: [
      {
        id: 'local',
        label: '本地文本',
        ready: true,
        note: '粘贴 / 上传 txt，正文原样入库',
      },
      {
        id: 'fanqie',
        label: '番茄小说',
        ready: true,
        note: '导入书名、作者、封面与全量目录；正文有字体混淆，需外部下载器导出后粘贴',
      },
      {
        id: 'link',
        label: '网页链接',
        ready: true,
        note: '抓公开网页正文（公版书 / 文章）',
      },
      {
        id: 'weread',
        label: '微信读书',
        ready: false,
        note: '需要微信读书凭证，官方没有稳定公开接口；暂未自动拉取',
      },
    ],
  }));

  /**
   * 番茄：从书籍页导入元数据 + 目录。
   * 正文是 PUA 字体混淆的，**不写库**；只导入目录，避免把乱码塞进阅读器。
   */
  app.post('/reading/import/fanqie', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string };
    const bookId = parseFanqieUrl(body.url ?? '');
    if (!bookId) {
      reply.code(400).send({ message: '请填番茄书籍链接，如 https://fanqienovel.com/page/7143…' });
      return;
    }

    let html = '';
    try {
      html = await fetchHtml(`https://fanqienovel.com/page/${bookId}`);
    } catch (err) {
      reply.code(502).send({ message: `番茄页面抓取失败：${(err as Error).message}` });
      return;
    }
    const meta = parseFanqiePage(html);
    if (!meta) {
      reply.code(502).send({ message: '番茄页面结构可能变了，没解析到书名/目录' });
      return;
    }

    const ts = now();
    const sourceMeta = {
      url: `https://fanqienovel.com/page/${bookId}`,
      bookId,
      chapterTotal: meta.totalChapters,
      itemIds: meta.itemIds,
    };
    const existing = db
      .select()
      .from(books)
      .all()
      .find((b) => b.source === 'fanqie' && b.sourceId === bookId && b.deletedAt == null);

    if (existing) {
      db.update(books)
        .set({
          title: meta.title,
          author: meta.author || existing.author,
          coverUrl: meta.coverUrl || existing.coverUrl,
          desc: meta.desc || existing.desc,
          toc: JSON.stringify(meta.toc),
          totalChapters: meta.toc.length || meta.totalChapters,
          sourceMeta: JSON.stringify(sourceMeta),
          lastSyncedAt: ts,
          updatedAt: ts,
        })
        .where(eq(books.id, existing.id))
        .run();
      reply.send({
        id: existing.id,
        updated: true,
        title: meta.title,
        author: meta.author,
        chapters: meta.toc.length,
        hasText: !!(existing.content ?? '').trim(),
        warning: '正文有字体混淆，未抓取；目录已更新。',
      });
      return;
    }

    const id = newId();
    db.insert(books)
      .values({
        id,
        title: meta.title,
        author: meta.author || null,
        coverUrl: meta.coverUrl,
        totalChapters: meta.toc.length || meta.totalChapters,
        content: null,
        desc: meta.desc || null,
        toc: JSON.stringify(meta.toc),
        color: null,
        band: null,
        height: null,
        source: 'fanqie',
        sourceId: bookId,
        sourceMeta: JSON.stringify(sourceMeta),
        lastSyncedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({
      id,
      title: meta.title,
      author: meta.author,
      chapters: meta.toc.length,
      hasText: false,
      warning: '已导入目录；正文请用外部下载器导出后粘贴到「本地文本」里。',
    });
  });

  /** 通用网页：抓正文入库（公开页面 / 公版书） */
  app.post('/reading/import/link', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string; title?: string };
    const url = body.url?.trim() ?? '';
    if (!/^https?:\/\//i.test(url)) {
      reply.code(400).send({ message: '请填 http(s) 链接' });
      return;
    }

    let html = '';
    try {
      html = await fetchHtml(url);
    } catch (err) {
      reply.code(502).send({ message: `抓取失败：${(err as Error).message}` });
      return;
    }
    const page = extractReadable(html);
    if (page.content.trim().length < 120) {
      reply.code(422).send({ message: '这个页面没抓到足够正文（可能是 JS 渲染的），换一个来源或直接粘贴文本' });
      return;
    }

    const ts = now();
    const id = newId();
    const title = body.title?.trim() || page.title || new URL(url).hostname;
    db.insert(books)
      .values({
        id,
        title: title.slice(0, 120),
        author: null,
        coverUrl: null,
        totalChapters: paragraphCount(page.content),
        content: page.content,
        desc: null,
        toc: null,
        color: null,
        band: null,
        height: null,
        source: 'local',
        sourceId: null,
        sourceMeta: JSON.stringify({ url }),
        lastSyncedAt: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, title, chars: page.content.length });
  });

  /**
   * 进度同步（最小实现）：
   * - 本地书 → 没有远端，直接 `local`；
   * - 番茄/微信读书 → 记为 `pending`（待回传），并记 `lastSyncedAt`。
   * 微信读书的回传需要凭证/接口，本版本只落「待回传」状态，不谎报已同步。
   */
  app.post('/reading/progress/sync', async (req, reply) => {
    const body = (req.body ?? {}) as { bookId?: string };
    const bookId = body.bookId?.trim();
    if (!bookId) {
      reply.code(400).send({ message: 'bookId 必填' });
      return;
    }
    const book = db
      .select()
      .from(books)
      .all()
      .find((b) => b.id === bookId && b.deletedAt == null);
    if (!book) {
      reply.code(404).send({ message: '书不存在' });
      return;
    }

    const ts = now();
    const rows = db
      .select()
      .from(readingProgress)
      .all()
      .filter((p) => p.bookId === bookId && p.deletedAt == null);
    const status = book.source === 'local' ? 'local' : 'pending';
    for (const p of rows) {
      db.update(readingProgress)
        .set({ syncStatus: status, lastSyncedAt: ts, updatedAt: ts })
        .where(eq(readingProgress.id, p.id))
        .run();
    }

    return {
      status,
      source: book.source,
      note:
        book.source === 'local'
          ? '本地书只在本机，无需同步'
          : book.source === 'fanqie'
            ? '已记入待回传；番茄没有公开进度接口，回传需外部适配器'
            : '已记入待回传；微信读书回传需要凭证/接口',
      progress: db
        .select()
        .from(readingProgress)
        .all()
        .filter((p) => p.bookId === bookId && p.deletedAt == null)
        .map(progressDTO),
    };
  });
}

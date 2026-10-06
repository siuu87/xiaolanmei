import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { annotationNotes, annotations, books, readingProgress } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

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
    };
    const title = body.title?.trim();
    if (!title) {
      reply.code(400).send({ message: 'title 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const content = body.content ?? null;
    db.insert(books)
      .values({
        id,
        title,
        author: body.author?.trim() || null,
        coverUrl: body.coverUrl?.trim() || null,
        totalChapters: paragraphCount(content),
        content,
        desc: body.desc?.trim() || null,
        toc: Array.isArray(body.toc) && body.toc.length ? JSON.stringify(body.toc) : null,
        color: body.color || null,
        band: body.band || null,
        height: body.height ?? null,
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

    if (existing) {
      db.update(readingProgress)
        .set({ currentChapter, currentPosition, percent, updatedAt: ts })
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
}

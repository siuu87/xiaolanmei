import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { wishClips } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { parseClip, extractUrl, detectPlatform, type ClipPlatform } from '../services/clipParse.js';

/**
 * 剪藏（wish_clips）—— 从外面捡回来的小红书笔记 / GitHub 仓库 / B 站视频 / 网页。
 *
 * 三条进货通道：
 *   ① `POST /parse`     只解析不落库，给「粘贴链接 → 先看眼对不对」用；
 *   ② `POST /`          解析 + 存，正常剪藏走这条；
 *   ③ `POST /clip`      浏览器书签直接把页面上抓到的东西推进来（跨域带上来的），不解析。
 *
 * 同一个链接只留一张卡：再剪一次就覆盖旧卡（`updated: true`），
 * 否则列表里会堆出一排一模一样的。
 */

const MAX = {
  title: 300,
  author: 120,
  excerpt: 2000,
  content: 40000,
  note: 4000,
  tags: 300,
};

function cut(s: string | undefined, n: number): string {
  return (s ?? '').toString().slice(0, n);
}

function toDTO(r: typeof wishClips.$inferSelect) {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    author: r.author,
    platform: r.platform as ClipPlatform,
    cover: r.cover,
    excerpt: r.excerpt,
    content: r.content,
    note: r.note,
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
    folderId: r.folderId ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function listAll() {
  return db
    .select()
    .from(wishClips)
    .all()
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => b.createdAt - a.createdAt) // 新捡的在上
    .map(toDTO);
}

/** 存一条；同 url 已存在就覆盖（保留原 id 和创建时间） */
function upsert(fields: {
  url: string;
  title: string;
  author: string;
  platform: string;
  cover: string;
  excerpt: string;
  content: string;
  note?: string;
  tags?: string;
  folderId?: string;
}): { id: string; updated: boolean } {
  const ts = now();
  const exist = db
    .select()
    .from(wishClips)
    .all()
    .find((r) => r.deletedAt == null && r.url === fields.url);

  if (exist) {
    db.update(wishClips)
      .set({
        title: fields.title || exist.title,
        author: fields.author || exist.author,
        platform: fields.platform || exist.platform,
        cover: fields.cover || exist.cover,
        excerpt: fields.excerpt || exist.excerpt,
        // 正文只在抓到新的时候覆盖：书签抓的比服务端多，别用空的盖掉老的
        content: fields.content || exist.content,
        updatedAt: ts,
      })
      .where(eq(wishClips.id, exist.id))
      .run();
    return { id: exist.id, updated: true };
  }

  const id = newId();
  db.insert(wishClips)
    .values({
      id,
      url: fields.url,
      title: fields.title,
      author: fields.author,
      platform: fields.platform,
      cover: fields.cover,
      excerpt: fields.excerpt,
      content: fields.content,
      note: cut(fields.note, MAX.note),
      tags: cut(fields.tags, MAX.tags),
      folderId: fields.folderId ?? '',
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return { id, updated: false };
}

export async function wishClipRoutes(app: FastifyInstance): Promise<void> {
  app.get('/wish-clips', async () => listAll());

  /** 只解析，不落库。前端粘贴后先看一眼，确认了再存 */
  app.post('/wish-clips/parse', async (req, reply) => {
    const body = (req.body ?? {}) as { text?: string };
    const text = (body.text ?? '').trim();
    if (!text) {
      reply.code(400).send({ message: '把链接或分享文案贴进来' });
      return;
    }
    if (!extractUrl(text)) {
      reply.code(400).send({ message: '这段里没有链接' });
      return;
    }
    try {
      const parsed = await parseClip(text);
      reply.send(parsed);
    } catch (e) {
      reply.code(422).send({ message: e instanceof Error ? e.message : '解析失败' });
    }
  });

  /** 剪藏：贴一段文字（链接或分享文案），解析后存下来 */
  app.post('/wish-clips', async (req, reply) => {
    const body = (req.body ?? {}) as {
      text?: string;
      folderId?: string;
      note?: string;
      /** 允许前端带上手动补的标题/正文（小红书这种抓不到正文的时候） */
      title?: string;
      content?: string;
      /** 自己打的标签（记录灵感页填的），有就覆盖掉解析出来的 */
      tags?: string[];
    };
    const text = (body.text ?? '').trim();
    if (!text) {
      reply.code(400).send({ message: '把链接或分享文案贴进来' });
      return;
    }
    try {
      const p = await parseClip(text);
      const saved = upsert({
        url: p.url,
        title: cut(body.title || p.title, MAX.title),
        author: cut(p.author, MAX.author),
        platform: p.platform,
        cover: p.cover,
        excerpt: cut(p.excerpt, MAX.excerpt),
        content: cut(body.content || p.content, MAX.content),
        note: body.note,
        tags: (body.tags?.length ? body.tags.join(',') : p.tags.join(',')).slice(0, MAX.tags),
        folderId: body.folderId?.trim() || '',
      });
      reply.code(saved.updated ? 200 : 201).send({ ...saved, title: p.title });
    } catch (e) {
      reply.code(422).send({ message: e instanceof Error ? e.message : '剪藏失败' });
    }
  });

  /**
   * 书签收件口：浏览器书签在页面里抓到的东西直接推进来。
   * 不解析（页面已经渲染好了，比服务端抓的全），只负责存。
   */
  app.post('/wish-clips/clip', async (req, reply) => {
    const b = (req.body ?? {}) as {
      url?: string;
      title?: string;
      author?: string;
      content?: string;
      cover?: string;
      platform?: string;
      folderId?: string;
    };
    const url = (b.url ?? '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      reply.code(400).send({ message: 'url 不对' });
      return;
    }
    const platform = (b.platform as string) || detectPlatform(url);
    const saved = upsert({
      url,
      title: cut(b.title, MAX.title),
      author: cut(b.author, MAX.author),
      platform,
      cover: cut(b.cover, 1000),
      excerpt: cut(b.content, MAX.excerpt),
      content: cut(b.content, MAX.content),
      tags: '',
      folderId: b.folderId?.trim() || '',
    });
    reply.code(saved.updated ? 200 : 201).send({ ...saved });
  });

  app.patch('/wish-clips/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      title?: string;
      note?: string;
      content?: string;
      folderId?: string;
      tags?: string[] | string;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) set.title = cut(body.title, MAX.title);
    if (body.note !== undefined) set.note = cut(body.note, MAX.note);
    if (body.content !== undefined) set.content = cut(body.content, MAX.content);
    if (body.folderId !== undefined) set.folderId = body.folderId.trim();
    if (body.tags !== undefined) {
      const t = Array.isArray(body.tags) ? body.tags.join(',') : body.tags;
      set.tags = cut(t, MAX.tags);
    }
    const r = db.update(wishClips).set(set).where(eq(wishClips.id, id)).run();
    if (r.changes === 0) {
      reply.code(404).send({ message: '这条不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/wish-clips/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(wishClips).set({ deletedAt: ts, updatedAt: ts }).where(eq(wishClips.id, id)).run();
    return { ok: true };
  });
}

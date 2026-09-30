import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { stickers } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 自定义表情包路由（阶段 7 收尾）：设置页上传图片 → 存 URL，聊天表情包面板读取。
 * url 由 /api/upload 落盘后返回（/api/files/xxx），这里只存引用，不做额外校验。
 */

function toDTO(s: typeof stickers.$inferSelect) {
  return { id: s.id, name: s.name, url: s.url };
}

export async function stickerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stickers', async () => {
    return db
      .select()
      .from(stickers)
      .all()
      .filter((s) => s.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map(toDTO);
  });

  app.post('/stickers', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown> & { id?: string };
    const name = String(body.name ?? '').trim();
    const url = String(body.url ?? '').trim();
    if (!name || !url) {
      reply.code(400).send({ message: 'name 和 url 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(stickers)
      .values({ id, name, url, sortOrder: 0, createdAt: ts, updatedAt: ts })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.delete('/stickers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(stickers).set({ deletedAt: ts, updatedAt: ts }).where(eq(stickers.id, id)).run();
    return { ok: true };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { gifts } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 礼物盒路由（2026-10-22 新增）：礼物 CRUD + 拆封态持久化。
 * 礼物由哥哥（AI 伴侣）送出，这里只负责落库与读写；isOpened 记拆封态。
 */

const GIFT_TYPES = ['letter', 'whisper', 'sticker', 'easter'] as const;
type GiftType = (typeof GIFT_TYPES)[number];

function toDTO(g: typeof gifts.$inferSelect) {
  return {
    id: g.id,
    title: g.title,
    content: g.content ?? '',
    giftType: (GIFT_TYPES.includes(g.giftType as GiftType) ? g.giftType : 'letter') as GiftType,
    isOpened: g.isOpened ?? false,
    createdAt: g.createdAt,
  };
}

export async function giftRoutes(app: FastifyInstance): Promise<void> {
  app.get('/gifts', async () => {
    return db
      .select()
      .from(gifts)
      .all()
      .filter((g) => g.deletedAt == null)
      // 最新的礼物排最前（未拆区先看到刚送到的）
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/gifts', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      title?: string;
      content?: string;
      giftType?: string;
    };
    const title = body.title?.trim();
    if (!title) {
      reply.code(400).send({ message: 'title 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const giftType = GIFT_TYPES.includes(body.giftType as GiftType)
      ? (body.giftType as GiftType)
      : 'letter';
    db.insert(gifts)
      .values({
        id,
        title,
        content: body.content || '',
        giftType,
        isOpened: false,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/gifts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      title?: string;
      content?: string;
      giftType?: string;
      isOpened?: boolean;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) set.title = body.title.trim();
    if (body.content !== undefined) set.content = body.content;
    if (body.giftType !== undefined && GIFT_TYPES.includes(body.giftType as GiftType)) {
      set.giftType = body.giftType;
    }
    if (body.isOpened !== undefined) set.isOpened = body.isOpened;

    const result = db.update(gifts).set(set).where(eq(gifts.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '礼物不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/gifts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(gifts).set({ deletedAt: ts, updatedAt: ts }).where(eq(gifts.id, id)).run();
    return { ok: true };
  });
}

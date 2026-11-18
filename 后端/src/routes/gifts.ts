import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { gifts } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 礼物盒路由（2026-10-22 新增）：礼物 CRUD + 拆封态持久化。
 * 礼物由哥哥（AI 伴侣）送出，这里只负责落库与读写；isOpened 记拆封态。
 * 2026-11-17：只留「实物礼物」——letter/whisper 退役（信在 notes、悄悄话在日记），
 * 旧数据启动时已迁成 object；这里再兜一层 DTO 映射。
 */

const GIFT_TYPES = ['flower', 'object', 'easter', 'keepsake'] as const;
type GiftType = (typeof GIFT_TYPES)[number];

/** 旧类型 → 新类型：letter/whisper 都当小摆件（标题和文字内容原样保留） */
const LEGACY_TYPE_MAP: Record<string, GiftType> = { letter: 'object', whisper: 'object' };

function normalizeType(raw: unknown): GiftType {
  if (typeof raw === 'string') {
    if ((GIFT_TYPES as readonly string[]).includes(raw)) return raw as GiftType;
    if (LEGACY_TYPE_MAP[raw]) return LEGACY_TYPE_MAP[raw];
  }
  return 'flower';
}

function toDTO(g: typeof gifts.$inferSelect) {
  return {
    id: g.id,
    title: g.title,
    content: g.content ?? '',
    giftType: normalizeType(g.giftType),
    /** 附加数据：花束礼物是 { bouquet: {...} }、小摆件是 { model: 'star-jar' | ... } 的 JSON 字符串 */
    meta: g.meta ?? null,
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
      meta?: string | null;
    };
    const title = body.title?.trim();
    if (!title) {
      reply.code(400).send({ message: 'title 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const giftType = normalizeType(body.giftType);
    db.insert(gifts)
      .values({
        id,
        title,
        content: body.content || '',
        giftType,
        meta: body.meta ? String(body.meta).slice(0, 4000) : null,
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
      meta?: string | null;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.title !== undefined) set.title = body.title.trim();
    if (body.content !== undefined) set.content = body.content;
    if (body.giftType !== undefined) set.giftType = normalizeType(body.giftType);
    if (body.isOpened !== undefined) set.isOpened = body.isOpened;
    if (body.meta !== undefined) set.meta = body.meta ? String(body.meta).slice(0, 4000) : null;

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

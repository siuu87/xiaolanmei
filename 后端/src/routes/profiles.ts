import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles } from '../db/schema.js';
import { now } from '../utils/id.js';

/**
 * 双人档案路由（阶段 11）：两个人的昵称与头像配置，用于备忘录归属徽章。
 * 首次访问自动初始化 me / partner 两条默认档案。
 */

const DEFAULTS = [
  { id: 'me', nickname: '我', avatarSeed: 'me', avatarColor: '#8b5cf6', emoji: '🙂', isMe: true },
  { id: 'partner', nickname: '对方', avatarSeed: 'partner', avatarColor: '#ec4899', emoji: '😽', isMe: false },
] as const;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDTO(p: typeof profiles.$inferSelect) {
  return {
    id: p.id,
    nickname: p.nickname,
    avatarSeed: p.avatarSeed,
    avatarColor: p.avatarColor,
    emoji: p.emoji,
    isMe: p.isMe,
  };
}

function ensureProfiles(): void {
  const rows = db.select().from(profiles).all();
  const ts = now();
  for (const d of DEFAULTS) {
    if (!rows.some((r) => r.id === d.id)) {
      db.insert(profiles)
        .values({
          id: d.id,
          nickname: d.nickname,
          avatarSeed: d.avatarSeed,
          avatarColor: d.avatarColor,
          emoji: d.emoji,
          isMe: d.isMe,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    }
  }
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/profiles', async () => {
    ensureProfiles();
    const rows = db
      .select()
      .from(profiles)
      .all()
      .sort((a, b) => Number(b.isMe) - Number(a.isMe));
    return rows.map(toDTO);
  });

  app.patch('/profiles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    ensureProfiles();
    const row = db.select().from(profiles).all().find((p) => p.id === id);
    if (!row) {
      reply.code(404).send({ message: '档案不存在' });
      return;
    }
    const body = (req.body ?? {}) as {
      nickname?: string;
      avatarSeed?: string;
      avatarColor?: string;
      emoji?: string;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.nickname !== undefined) set.nickname = str(body.nickname) ?? row.nickname;
    if (body.avatarSeed !== undefined) set.avatarSeed = str(body.avatarSeed) ?? row.avatarSeed;
    if (body.avatarColor !== undefined) set.avatarColor = str(body.avatarColor) ?? row.avatarColor;
    if (body.emoji !== undefined) set.emoji = str(body.emoji);
    db.update(profiles).set(set).where(eq(profiles.id, id)).run();
    const updated = db.select().from(profiles).all().find((p) => p.id === id)!;
    return toDTO(updated);
  });
}

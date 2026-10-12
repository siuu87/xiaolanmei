import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { moods } from '../db/schema.js';

/**
 * 每日心情（阶段 P2 数据单源化）。
 *
 * - id 即日期 key（非补零 YYYY-M-D，与前端 moodStore.dateKeyOf 一致），
 *   一条记录 = 那一天两个人的心情；me/ai 可空（只记了一个人的时候）。
 * - 写入用「整体替换 + 软删墓碑」：PUT 带全量 days 映射，本次没出现的日期打
 *   deleted_at，与双端同步（阶段 14）的传播方式一致。
 * - 合法心情值只有三种（高兴 / 平静 / 难过），非法值一律忽略，防止脏数据写库。
 */

export type MoodKeyDTO = 'happy' | 'calm' | 'sad';

const MOOD_KEYS: MoodKeyDTO[] = ['happy', 'calm', 'sad'];

function sanitize(v: unknown): MoodKeyDTO | null {
  return typeof v === 'string' && (MOOD_KEYS as string[]).includes(v) ? (v as MoodKeyDTO) : null;
}

interface DayMoodDTO {
  me?: MoodKeyDTO | null;
  ai?: MoodKeyDTO | null;
}

type DaysDTO = Record<string, DayMoodDTO>;

/** 入参 days → 清洗后的映射（丢掉两人都空 / key 不合法的天） */
function cleanDays(days: unknown): DaysDTO {
  const out: DaysDTO = {};
  if (!days || typeof days !== 'object') return out;
  for (const [k, v] of Object.entries(days as Record<string, unknown>)) {
    // key 形如 YYYY-M-D（月份日期不补零），与前端 dateKeyOf 对齐
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(k)) continue;
    if (!v || typeof v !== 'object') continue;
    const me = sanitize((v as DayMoodDTO).me);
    const ai = sanitize((v as DayMoodDTO).ai);
    if (!me && !ai) continue;
    out[k] = { me, ai };
  }
  return out;
}

export async function moodRoutes(app: FastifyInstance): Promise<void> {
  app.get('/moods', async (): Promise<{ days: DaysDTO }> => {
    const days: DaysDTO = {};
    for (const r of db.select().from(moods).all()) {
      if (r.deletedAt != null) continue;
      const me = sanitize(r.me);
      const ai = sanitize(r.ai);
      if (!me && !ai) continue;
      days[r.id] = { me, ai };
    }
    return { days };
  });

  app.put('/moods', async (req) => {
    const body = (req.body ?? {}) as { days?: unknown };
    const incoming = cleanDays(body.days);
    const ts = Date.now();

    const existing = db.select().from(moods).all();
    const existingLive = existing.filter((r) => r.deletedAt == null);

    for (const [day, mood] of Object.entries(incoming)) {
      const cur = existing.find((e) => e.id === day);
      const me = mood.me ?? null;
      const ai = mood.ai ?? null;
      if (cur) {
        db.update(moods)
          .set({ me, ai, deletedAt: null, updatedAt: ts })
          .where(eq(moods.id, day))
          .run();
      } else {
        db.insert(moods).values({ id: day, me, ai, createdAt: ts, updatedAt: ts }).run();
      }
    }
    // 本次没出现的日期 → 软删墓碑（同步靠 deleted_at 传播删除）
    for (const e of existingLive) {
      if (!(e.id in incoming)) {
        db.update(moods).set({ deletedAt: ts, updatedAt: ts }).where(eq(moods.id, e.id)).run();
      }
    }
    return { ok: true };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { periodRecords } from '../db/schema.js';
import { getSettingValue, setSetting } from './settings.js';

/**
 * 经期路由（阶段 7 收尾）：经期记录 + 设置持久化。
 * - 记录存 period_records 表（days/symptoms 整体 JSON）；
 * - 设置存 settings 表（key=period.settings，本地偏好）。
 * 写入用「整体替换 + 软删墓碑」，保证与双端同步（阶段 14）兼容。
 */

const PERIOD_SETTINGS_KEY = 'period.settings';
const DEFAULT_SETTINGS = { periodDays: 5, cycleDays: 28, regular: true };

interface PeriodRecordDTO {
  id: string;
  days: string[];
  symptoms: Record<string, { cramps: number; discomfort: string; mood?: string }>;
}

function toDTO(r: typeof periodRecords.$inferSelect): PeriodRecordDTO {
  let days: string[] = [];
  let symptoms: PeriodRecordDTO['symptoms'] = {};
  try {
    days = JSON.parse(r.days) as string[];
  } catch {
    days = [];
  }
  try {
    symptoms = JSON.parse(r.symptoms) as PeriodRecordDTO['symptoms'];
  } catch {
    symptoms = {};
  }
  return { id: r.id, days, symptoms };
}

export async function periodRoutes(app: FastifyInstance): Promise<void> {
  app.get('/period', async () => ({
    settings: getSettingValue(PERIOD_SETTINGS_KEY, DEFAULT_SETTINGS),
    records: db
      .select()
      .from(periodRecords)
      .all()
      .filter((r) => r.deletedAt == null)
      .sort((a, b) => a.days.localeCompare(b.days))
      .map(toDTO),
  }));

  app.put('/period', async (req) => {
    const body = (req.body ?? {}) as {
      settings?: { periodDays?: number; cycleDays?: number; regular?: boolean };
      records?: PeriodRecordDTO[];
    };
    if (body.settings) setSetting(PERIOD_SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...body.settings });

    if (Array.isArray(body.records)) {
      const ts = Date.now();
      const incoming = body.records.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.days));
      const incomingIds = new Set(incoming.map((r) => r.id));
      const existing = db
        .select()
        .from(periodRecords)
        .all()
        .filter((r) => r.deletedAt == null);

      for (const r of incoming) {
        const days = JSON.stringify(r.days);
        const symptoms = JSON.stringify(r.symptoms ?? {});
        const cur = existing.find((e) => e.id === r.id);
        if (cur) {
          db.update(periodRecords)
            .set({ days, symptoms, updatedAt: ts })
            .where(eq(periodRecords.id, r.id))
            .run();
        } else {
          db.insert(periodRecords)
            .values({ id: r.id, days, symptoms, createdAt: ts, updatedAt: ts })
            .run();
        }
      }
      // 软删本次不再出现的记录（同步靠 deleted_at 墓碑传播删除）
      for (const e of existing) {
        if (!incomingIds.has(e.id)) {
          db.update(periodRecords)
            .set({ deletedAt: ts, updatedAt: ts })
            .where(eq(periodRecords.id, e.id))
            .run();
        }
      }
    }
    return { ok: true };
  });
}

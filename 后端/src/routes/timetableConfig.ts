import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { timetableConfig } from '../db/schema.js';
import { now } from '../utils/id.js';

/**
 * 课程表配置路由（阶段 7 收尾）：单行（id='default'）存总周数 + 每节课上下课时间。
 * 前端 timetableStore 读写；上下课时间随课程表一起跨端同步。
 */

const CONFIG_ID = 'default';
const DEFAULT_TOTAL_WEEKS = 20;
const DEFAULT_PERIOD_TIMES = JSON.stringify(
  Array.from({ length: 12 }, () => ({ start: '', end: '' })),
);

function readConfig(): { totalWeeks: number; periodTimes: string } {
  const row = db.select().from(timetableConfig).where(eq(timetableConfig.id, CONFIG_ID)).get();
  if (!row) {
    const ts = now();
    db.insert(timetableConfig)
      .values({
        id: CONFIG_ID,
        totalWeeks: DEFAULT_TOTAL_WEEKS,
        periodTimes: DEFAULT_PERIOD_TIMES,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return { totalWeeks: DEFAULT_TOTAL_WEEKS, periodTimes: DEFAULT_PERIOD_TIMES };
  }
  return { totalWeeks: row.totalWeeks, periodTimes: row.periodTimes };
}

export async function timetableConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get('/timetable/config', async () => {
    const { totalWeeks, periodTimes } = readConfig();
    let parsed: { start: string; end: string }[] = [];
    try {
      parsed = JSON.parse(periodTimes);
    } catch {
      parsed = [];
    }
    return { totalWeeks, periodTimes: parsed };
  });

  app.put('/timetable/config', async (req, reply) => {
    const body = (req.body ?? {}) as { totalWeeks?: number; periodTimes?: { start: string; end: string }[] };
    const current = readConfig();
    const totalWeeks = Number.isFinite(Number(body.totalWeeks))
      ? Math.max(1, Math.round(Number(body.totalWeeks)))
      : current.totalWeeks;
    const periodTimes = Array.isArray(body.periodTimes) ? body.periodTimes : JSON.parse(current.periodTimes);
    const ts = now();
    db.update(timetableConfig)
      .set({ totalWeeks, periodTimes: JSON.stringify(periodTimes), updatedAt: ts })
      .where(eq(timetableConfig.id, CONFIG_ID))
      .run();
    return { ok: true };
  });
}

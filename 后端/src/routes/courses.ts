import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { courses } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 课程表路由（阶段 7 收尾）：课程 CRUD。
 * 课程由前端手动编辑，或由聊天图片识别工具（save_courses）写入后前端 reload 同步。
 */

const FALLBACK_COLOR = '#6366f1';

/** 转成整数并夹在 [lo, hi]；非法值退回 dflt */
function clamp(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

function toDTO(c: typeof courses.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    teacher: c.teacher ?? undefined,
    location: c.location ?? undefined,
    day: c.day,
    startPeriod: c.startPeriod,
    endPeriod: c.endPeriod,
    startWeek: c.startWeek,
    endWeek: c.endWeek,
    parity: c.parity,
    color: c.color,
  };
}

export async function courseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/courses', async () => {
    return db
      .select()
      .from(courses)
      .all()
      .filter((c) => c.deletedAt == null)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toDTO);
  });

  app.post('/courses', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown> & { id?: string };
    const name = String(body.name ?? '').trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const startPeriod = clamp(body.startPeriod, 1, 20, 1);
    const endPeriod = clamp(body.endPeriod, 1, 20, startPeriod);
    const startWeek = clamp(body.startWeek, 1, 52, 1);
    const endWeek = clamp(body.endWeek, 1, 52, startWeek);
    db.insert(courses)
      .values({
        id,
        name,
        teacher: body.teacher ? String(body.teacher).trim() : null,
        location: body.location ? String(body.location).trim() : null,
        day: clamp(body.day, 1, 7, 1),
        startPeriod,
        endPeriod,
        startWeek,
        endWeek,
        parity: body.parity === 'odd' || body.parity === 'even' ? body.parity : 'all',
        color: body.color ? String(body.color) : FALLBACK_COLOR,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/courses/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = String(body.name).trim();
    if (body.teacher !== undefined) set.teacher = body.teacher ? String(body.teacher).trim() : null;
    if (body.location !== undefined) set.location = body.location ? String(body.location).trim() : null;
    if (body.day !== undefined) set.day = clamp(body.day, 1, 7, 1);
    if (body.startPeriod !== undefined) set.startPeriod = clamp(body.startPeriod, 1, 20, 1);
    if (body.endPeriod !== undefined) set.endPeriod = clamp(body.endPeriod, 1, 20, 1);
    if (body.startWeek !== undefined) set.startWeek = clamp(body.startWeek, 1, 52, 1);
    if (body.endWeek !== undefined) set.endWeek = clamp(body.endWeek, 1, 52, 1);
    if (body.parity !== undefined) set.parity = body.parity === 'odd' || body.parity === 'even' ? body.parity : 'all';
    if (body.color !== undefined) set.color = String(body.color);

    const result = db.update(courses).set(set).where(eq(courses.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '课程不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/courses/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(courses).set({ deletedAt: ts, updatedAt: ts }).where(eq(courses.id, id)).run();
    return { ok: true };
  });
}

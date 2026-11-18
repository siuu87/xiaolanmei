import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tasks } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 小任务（2026-11-18 三十五改，参考小红书「Nid douillet」的灵动岛指令卡）：
 * TA 在聊天里下达的限时任务。AI 走 assign_task 工具落库（写库发生在工具层，
 * 这里给前端补查/改状态用），聊天页顶部灵动岛浮条 + 消息流任务卡两处展示。
 *
 * status：pending 待完成 / done 已完成 / cancelled 已取消。
 * 「迟到」不算状态——前端拿 dueAt 和当前时间自己比，后端不跑定时器（同来电的规矩）。
 */

const STATUSES = new Set(['pending', 'done', 'cancelled']);

function toDTO(t: typeof tasks.$inferSelect) {
  return {
    id: t.id,
    title: t.title,
    note: t.note,
    dueAt: t.dueAt,
    status: t.status,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
  };
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  /** 全部未删任务，新的在前（前端自己筛 pending / 算迟到） */
  app.get('/tasks', async () => {
    return db
      .select()
      .from(tasks)
      .where(isNull(tasks.deletedAt))
      .orderBy(desc(tasks.createdAt))
      .limit(200)
      .all()
      .map(toDTO);
  });

  /** 建任务（AI 工具 assign_task 内部不走这里，这里是给前端/调试用的直通口） */
  app.post('/tasks', async (req, reply) => {
    const body = (req.body ?? {}) as { title?: string; note?: string; dueAt?: number };
    const title = String(body.title ?? '').trim().slice(0, 60);
    if (!title) {
      reply.code(400).send({ message: 'title 必填' });
      return;
    }
    const ts = now();
    const dueAt = Number(body.dueAt);
    if (!Number.isFinite(dueAt) || dueAt <= ts - 60_000) {
      reply.code(400).send({ message: 'dueAt 必须是未来的毫秒时间戳' });
      return;
    }
    const id = newId();
    db.insert(tasks)
      .values({
        id,
        title,
        note: String(body.note ?? '').trim().slice(0, 200),
        dueAt: Math.round(dueAt),
        status: 'pending',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send(toDTO(db.select().from(tasks).where(eq(tasks.id, id)).get()!));
  });

  /** 改状态：完成 / 取消（撤销完成也走这里，status 传回 pending） */
  app.patch('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { status?: string };
    const status = String(body.status ?? '');
    if (!STATUSES.has(status)) {
      reply.code(400).send({ message: 'status 必须是 pending / done / cancelled' });
      return;
    }
    const ts = now();
    const result = db
      .update(tasks)
      .set({ status, completedAt: status === 'pending' ? null : ts, updatedAt: ts })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '任务不存在' });
      return;
    }
    reply.send(toDTO(db.select().from(tasks).where(eq(tasks.id, id)).get()!));
  });

  /** 软删 */
  app.delete('/tasks/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(tasks).set({ deletedAt: ts, updatedAt: ts }).where(eq(tasks.id, id)).run();
    return { ok: true };
  });
}

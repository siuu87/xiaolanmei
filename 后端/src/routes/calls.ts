import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { calls } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 通话记录：挂断后前端 POST 一条，同时会往聊天流推一张内联卡片消息。
 *
 * 「数据单源存于 SQLite」是硬要求 —— 所以时长/时间戳以**这里**为准，
 * 聊天卡片只是同一份事实在对话里的可视表示（卡片上的时长就是这张表的 seconds）。
 *
 * 与 `messages.meta.call` 的分工：
 * - 消息卡：出现在对话流里、跟着上下文位置走，刷新后还在（走 meta JSON 往返）；
 * - 这张表：可统计（时长合计 / 最近一次通话 / 按类型分组）。
 * 两处都写是有意的，不是冗余。
 */

/** answered 接通 / declined 已拒接 / missed 未接 */
export const CALL_STATES = ['answered', 'declined', 'missed'] as const;
export type CallState = (typeof CALL_STATES)[number];

export const CALL_KINDS = ['voice', 'video'] as const;
export type CallKind = (typeof CALL_KINDS)[number];

function normState(v: unknown): CallState {
  return typeof v === 'string' && (CALL_STATES as readonly string[]).includes(v)
    ? (v as CallState)
    : 'answered';
}

function normKind(v: unknown): CallKind {
  return typeof v === 'string' && (CALL_KINDS as readonly string[]).includes(v) ? (v as CallKind) : 'voice';
}

interface CallBody {
  id?: string;
  conversationId?: string | null;
  kind?: string;
  state?: string;
  seconds?: number;
  startedAt?: number;
  endedAt?: number;
}

function liveRows() {
  return db
    .select()
    .from(calls)
    .all()
    .filter((c) => c.deletedAt == null)
    .sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt));
}

function toDTO(c: ReturnType<typeof liveRows>[number]) {
  return {
    id: c.id,
    conversationId: c.conversationId,
    kind: c.kind,
    state: c.state,
    seconds: c.seconds,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    createdAt: c.createdAt,
  };
}

export async function callRoutes(app: FastifyInstance): Promise<void> {
  /** 列表：最近的在最后（跟聊天流方向一致，便于前端直接追加） */
  app.get('/calls', async (req) => {
    const { conversationId } = (req.query ?? {}) as { conversationId?: string };
    const rows = liveRows().filter((c) =>
      conversationId ? c.conversationId === conversationId : true,
    );
    return rows.map(toDTO);
  });

  /**
   * 汇总：给「通话记录」展示用。
   * answered 才计入时长合计 —— 拒接/未接的 seconds 恒为 0，但显式过滤更不容易出错。
   */
  app.get('/calls/stats', async () => {
    const rows = liveRows();
    const answered = rows.filter((c) => c.state === 'answered');
    const last = rows[rows.length - 1];
    return {
      total: rows.length,
      answered: answered.length,
      totalSeconds: answered.reduce((s, c) => s + (c.seconds ?? 0), 0),
      voiceSeconds: answered.filter((c) => c.kind !== 'video').reduce((s, c) => s + (c.seconds ?? 0), 0),
      videoSeconds: answered.filter((c) => c.kind === 'video').reduce((s, c) => s + (c.seconds ?? 0), 0),
      lastCallAt: last ? (last.endedAt ?? last.startedAt ?? last.createdAt) : null,
    };
  });

  app.post('/calls', async (req, reply) => {
    const body = (req.body ?? {}) as CallBody;
    const state = normState(body.state);
    const seconds = Math.max(0, Math.floor(Number(body.seconds ?? 0) || 0));
    // 没接通就不该有时长；拒接/未接一律归零，免得统计被脏数据带偏
    const safeSeconds = state === 'answered' ? seconds : 0;

    const id = body.id?.trim() || newId();
    const ts = now();
    db.insert(calls)
      .values({
        id,
        conversationId: body.conversationId ?? null,
        kind: normKind(body.kind),
        state,
        seconds: safeSeconds,
        startedAt: body.startedAt ?? null,
        endedAt: body.endedAt ?? ts,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, seconds: safeSeconds, state });
  });

  app.patch('/calls/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as CallBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.state !== undefined) set.state = normState(body.state);
    if (body.kind !== undefined) set.kind = normKind(body.kind);
    if (body.seconds !== undefined) set.seconds = Math.max(0, Math.floor(Number(body.seconds) || 0));
    if (body.startedAt !== undefined) set.startedAt = body.startedAt;
    if (body.endedAt !== undefined) set.endedAt = body.endedAt;

    const result = db.update(calls).set(set).where(eq(calls.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '通话记录不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/calls/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(calls).set({ deletedAt: ts, updatedAt: ts }).where(eq(calls.id, id)).run();
    return { ok: true };
  });
}

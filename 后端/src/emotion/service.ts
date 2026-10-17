import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { characterState, messages } from '../db/schema.js';
import { now } from '../utils/id.js';
import {
  EMOTION_DEFAULT,
  EMOTION_FIELDS,
  clampState,
  evolveEmotion,
  type EmotionDelta,
  type EmotionEvolution,
  type EmotionField,
  type EmotionSignalHit,
  type EmotionState,
} from './rules.js';

/**
 * 「白起的内心」情绪状态读写（唯一碰 `character_state` 表的地方）。
 *
 * 单行模型：id 恒为 `'default'`，行不存在时**按需播种**（首次 GET 就建好，
 * 不用在启动时 seed —— 种子逻辑散在 server.ts 里反而不如跟着读取走）。
 */

const STATE_ID = 'default';

/** 上一次演进的可解释记录，JSON 存在 `last_reason` 列里 */
export interface StoredEvolution {
  at: number;
  messageId: string | null;
  deltas: EmotionDelta[];
  signals: EmotionSignalHit[];
  moodBefore: string;
  moodAfter: string;
  gapMs: number;
}

export interface CharacterStateRow {
  affection: number;
  possessiveness: number;
  restraint: number;
  longing: number;
  currentMood: string;
  lastReason: string | null;
  lastMessageId: string | null;
  turnCount: number;
  updatedAt: number;
}

export interface CharacterStateDTO {
  affection: number;
  possessiveness: number;
  restraint: number;
  longing: number;
  currentMood: string;
  /** 上一次演进的可解释记录；没演进过就是 null */
  lastEvolution: StoredEvolution | null;
  lastMessageId: string | null;
  turnCount: number;
  updatedAt: number;
}

function defaultRow(ts: number): CharacterStateRow {
  return {
    affection: EMOTION_DEFAULT.affection,
    possessiveness: EMOTION_DEFAULT.possessiveness,
    restraint: EMOTION_DEFAULT.restraint,
    longing: EMOTION_DEFAULT.longing,
    currentMood: EMOTION_DEFAULT.currentMood,
    lastReason: null,
    lastMessageId: null,
    turnCount: 0,
    updatedAt: ts,
  };
}

/** 行不存在时播种：首次 GET 建好默认状态。 */
function seed(): CharacterStateRow {
  const ts = now();
  db.insert(characterState)
    .values({
      id: STATE_ID,
      ...defaultRow(ts),
      createdAt: ts,
    })
    .run();
  return defaultRow(ts);
}

/** 软删过的单例行：复用同一条（id 恒 'default'），重置回默认值并清掉 deletedAt。
 *  不能走 seed() 的 INSERT——id 撞主键会崩。 */
function revive(): CharacterStateRow {
  const ts = now();
  db.update(characterState)
    .set({ ...defaultRow(ts), deletedAt: null })
    .where(eq(characterState.id, STATE_ID))
    .run();
  return defaultRow(ts);
}

/** 读单例行；不存在就播种，软删过就原地复活（重置默认值）。 */
export function readRow(): CharacterStateRow {
  const row = db.select().from(characterState).where(eq(characterState.id, STATE_ID)).get();
  if (!row) return seed();
  if (row.deletedAt != null) return revive();
  return {
    affection: row.affection,
    possessiveness: row.possessiveness,
    restraint: row.restraint,
    longing: row.longing,
    currentMood: row.currentMood,
    lastReason: row.lastReason,
    lastMessageId: row.lastMessageId,
    turnCount: row.turnCount,
    updatedAt: row.updatedAt,
  };
}

function parseReason(raw: string | null): StoredEvolution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StoredEvolution;
    return v && Array.isArray(v.deltas) ? v : null;
  } catch {
    return null;
  }
}

function toState(row: CharacterStateRow): EmotionState {
  return {
    affection: row.affection,
    possessiveness: row.possessiveness,
    restraint: row.restraint,
    longing: row.longing,
    currentMood: row.currentMood,
  };
}

export function toDTO(row: CharacterStateRow): CharacterStateDTO {
  return {
    affection: row.affection,
    possessiveness: row.possessiveness,
    restraint: row.restraint,
    longing: row.longing,
    currentMood: row.currentMood,
    lastEvolution: parseReason(row.lastReason),
    lastMessageId: row.lastMessageId,
    turnCount: row.turnCount,
    updatedAt: row.updatedAt,
  };
}

export function getState(): CharacterStateDTO {
  return toDTO(readRow());
}

/**
 * 手动改数值（面板上的滑杆 / 以后想做「重置」都用它）。
 * 只收 0-100 的整数，非法值直接忽略（保留原值）。
 */
export function patchState(body: Partial<Record<EmotionField | 'currentMood', unknown>>): CharacterStateDTO {
  const row = readRow();
  const next = toState(row);
  for (const f of EMOTION_FIELDS) {
    const raw = body[f];
    // 只收真实数字：Number(null)/Number('')/Number(false) 都得 0，会把「没传」误当「清零」
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    next[f] = Math.round(Math.min(100, Math.max(0, raw)));
  }
  if (typeof body.currentMood === 'string' && body.currentMood.trim()) {
    next.currentMood = body.currentMood.trim();
  }
  const ts = now();
  db.update(characterState)
    .set({ ...clampState(next), updatedAt: ts })
    .where(eq(characterState.id, STATE_ID))
    .run();
  return getState();
}

// ─────────────────────────────────────────────────────────────
// 自动演进
// ─────────────────────────────────────────────────────────────

/**
 * 找「这一轮用户说了什么」。
 *
 * 助手消息的 `parent_id` 就是那一轮的用户消息（`ChatPage` 落库时写的是当时的
 * `activeMessageId`），**只有这条边成立才算一轮对话**。
 *
 * ⚠️ 2026-10-17 改过一版：以前 parent 找不到时会**兜底扫同会话里最近的一条用户消息**，
 * 结果「通话卡片」「深夜来信卡片」这类**没有 parent 的助手消息**也会触发一次演进
 * —— 把上一个用户回合的信号**重复计一遍**，还会把「沉默时长」的起点重置掉。
 * 现在没有这条边就返回空，`evolveForMessage` 会以 `not_a_turn` 跳过。
 */
export function resolveUserText(messageId: string): { text: string; fromUser: boolean; isTurn: boolean } {
  const msg = db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!msg || msg.deletedAt != null) return { text: '', fromUser: false, isTurn: false };
  if (msg.role === 'user') return { text: msg.content, fromUser: true, isTurn: true };
  if (!msg.parentId) return { text: '', fromUser: false, isTurn: false };
  const parent = db.select().from(messages).where(eq(messages.id, msg.parentId)).get();
  if (!parent || parent.deletedAt != null || parent.role !== 'user') {
    return { text: '', fromUser: false, isTurn: false };
  }
  return { text: parent.content, fromUser: true, isTurn: true };
}

export interface EvolveResult {
  /** true = 没有真的演进（重复触发 / 不是一轮对话） */
  skipped: boolean;
  reason?: 'duplicate' | 'not_a_turn' | 'empty_text';
  evolution?: EmotionEvolution;
  state: CharacterStateDTO;
}

/**
 * 一轮对话结束后的自动演进。
 *
 * **幂等**：`character_state.last_message_id` 记着上一次为哪条助手消息演进过，
 * 同一条再来（重复 PATCH、前端重试）直接跳过。这样 `POST /conversations/:id/messages`
 * 与 `PATCH /messages/:id {status:'done'}` 两个挂载点都调它也不会演进两次。
 */
export function evolveForMessage(messageId: string, at: number = now()): EvolveResult {
  const row = readRow();
  if (row.lastMessageId === messageId) {
    return { skipped: true, reason: 'duplicate', state: toDTO(row) };
  }

  const { text, fromUser, isTurn } = resolveUserText(messageId);
  if (!isTurn) return { skipped: true, reason: 'not_a_turn', state: toDTO(row) };
  if (!text.trim()) return { skipped: true, reason: 'empty_text', state: toDTO(row) };

  const evolution = evolveEmotion(toState(row), {
    text,
    fromUser,
    now: at,
    lastAt: row.updatedAt,
  });

  const stored: StoredEvolution = {
    at,
    messageId,
    deltas: evolution.deltas,
    signals: evolution.signals,
    moodBefore: evolution.moodBefore,
    moodAfter: evolution.moodAfter,
    gapMs: evolution.gapMs,
  };

  db.update(characterState)
    .set({
      ...evolution.state,
      lastReason: JSON.stringify(stored),
      lastMessageId: messageId,
      turnCount: row.turnCount + 1,
      updatedAt: at,
    })
    .where(eq(characterState.id, STATE_ID))
    .run();

  return { skipped: false, evolution, state: getState() };
}

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { characterState, messages } from '../db/schema.js';
import { now } from '../utils/id.js';
import {
  EMOTION_DEFAULT,
  evolveEmotion,
  type EmotionEvolution,
  type EmotionSignalHit,
  type EmotionState,
} from './rules.js';
import {
  EMPTY_DELTA,
  PANEL_FIELDS,
  buildStrategyBlock,
  deriveMoodLabel,
  evolveTurn,
  pickStrategyTags,
  type CoreSnapshot,
  type EmotionDelta4,
  type FieldMove,
  type StrategyTag,
  type TurnContext,
} from './machine.js';

/**
 * 「白起的内心」情绪状态读写（唯一碰 `character_state` 表的地方）。
 *
 * 单行模型：id 恒为 `'default'`，行不存在时**按需播种**（首次 GET 就建好，
 * 不用在启动时 seed —— 种子逻辑散在 server.ts 里反而不如跟着读取走）。
 *
 * 2026-10-19 起有两条演进路径：
 * - **主路径** `applyPreAnalysis()`：`/chat/stream` 开流前用轻量模型读 recent 4 →
 *   四维 delta → 状态机平滑累积 → 行为策略块随本轮提示词一起注入；
 * - **兜底路径** `evolveForMessage()`：消息落库时按关键词规则演进（老路径保留，
 *   供非流式消息 / 卡片消息使用；若该轮已前置分析过则跳过）。
 */

const STATE_ID = 'default';

/** 上一次演进的可解释记录，JSON 存在 `last_reason` 列里 */
export interface StoredEvolution {
  at: number;
  messageId: string | null;
  deltas: FieldMove[];
  signals: EmotionSignalHit[];
  moodBefore: string;
  moodAfter: string;
  gapMs: number;
  /** 面板底部那一行「心境小剧场」（前置分析写入） */
  theater?: string;
  /** 命中的行为策略标签（前置分析写入） */
  strategyTags?: StrategyTag[];
  /** delta 来源：轻量模型 / 关键词兜底 */
  source?: 'llm' | 'heuristic';
}

export interface CharacterStateRow {
  affection: number;
  possessiveness: number;
  restraint: number;
  longing: number;
  tension: number;
  vulnerability: number;
  currentMood: string;
  lastReason: string | null;
  lastMessageId: string | null;
  lastUserMessageId: string | null;
  turnCount: number;
  updatedAt: number;
}

export interface CharacterStateDTO {
  affection: number;
  possessiveness: number;
  restraint: number;
  longing: number;
  /** 紧绷与情欲（2026-10-19） */
  tension: number;
  /** 示弱与委屈（2026-10-19） */
  vulnerability: number;
  currentMood: string;
  /** 面板顶部的「此刻心绪」短标签（与 currentMood 同值，语义更明确） */
  moodLabel: string;
  /** 面板底部那一行心境小剧场 */
  moodTheater: string;
  /** 当前命中的行为策略（面板可用小圆点展示，不展示具体规则） */
  strategyTags: StrategyTag[];
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
    tension: 25,
    vulnerability: 20,
    currentMood: EMOTION_DEFAULT.currentMood,
    lastReason: null,
    lastMessageId: null,
    lastUserMessageId: null,
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
    tension: row.tension,
    vulnerability: row.vulnerability,
    currentMood: row.currentMood,
    lastReason: row.lastReason,
    lastMessageId: row.lastMessageId,
    lastUserMessageId: row.lastUserMessageId,
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

/** 行 → 状态机快照（jealousy = DB 的 possessiveness） */
function toSnapshot(row: CharacterStateRow): CoreSnapshot {
  return {
    jealousy: row.possessiveness,
    tension: row.tension,
    restraint: row.restraint,
    vulnerability: row.vulnerability,
    affection: row.affection,
    longing: row.longing,
  };
}

/** 行 → 老的规则引擎状态（兜底路径用） */
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
  const evo = parseReason(row.lastReason);
  return {
    affection: row.affection,
    possessiveness: row.possessiveness,
    restraint: row.restraint,
    longing: row.longing,
    tension: row.tension,
    vulnerability: row.vulnerability,
    currentMood: row.currentMood,
    moodLabel: row.currentMood,
    moodTheater: evo?.theater ?? '',
    strategyTags: evo?.strategyTags ?? [],
    lastEvolution: evo,
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
export function patchState(body: Partial<Record<string, unknown>>): CharacterStateDTO {
  const row = readRow();
  const next: CharacterStateRow = { ...row };
  for (const f of PANEL_FIELDS) {
    const raw = body[f.key];
    // 只收真实数字：Number(null)/Number('')/Number(false) 都得 0，会把「没传」误当「清零」
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    next[f.key] = Math.round(Math.min(100, Math.max(0, raw)));
  }
  if (typeof body.currentMood === 'string' && body.currentMood.trim()) {
    next.currentMood = body.currentMood.trim();
  }
  const ts = now();
  db.update(characterState)
    .set({
      affection: next.affection,
      possessiveness: next.possessiveness,
      restraint: next.restraint,
      longing: next.longing,
      tension: next.tension,
      vulnerability: next.vulnerability,
      currentMood: next.currentMood,
      updatedAt: ts,
    })
    .where(eq(characterState.id, STATE_ID))
    .run();
  return getState();
}

// ─────────────────────────────────────────────────────────────
// 主路径：对话前置分析（轻量模型 delta → 状态机 → 行为策略）
// ─────────────────────────────────────────────────────────────

export interface PreAnalysisInput {
  /** 这一轮的用户消息 id（前端传；用于幂等） */
  userMessageId?: string | null;
  userText: string;
  delta: EmotionDelta4;
  /** 演进时刻，缺省 now() */
  at?: number;
  source?: 'llm' | 'heuristic';
  /** false = 只算不落库（预览 / 无会话时用） */
  persist?: boolean;
}

export interface PreAnalysisResult {
  /** true = 这条用户消息已经分析过（重试 / 重复请求），没有再次累积 */
  skipped: boolean;
  state: CharacterStateDTO;
  moodLabel: string;
  moodTheater: string;
  strategyBlock: string;
  strategyTags: StrategyTag[];
  moves: FieldMove[];
}

/**
 * 一轮对话开始前的情绪演进。
 *
 * **幂等**：`last_user_message_id` 记着上一次分析过哪条用户消息；
 * 同一条再进来（前端重试、双击发送、流式重连）直接返回当前状态，不重复累积。
 */
export function applyPreAnalysis(input: PreAnalysisInput): PreAnalysisResult {
  const row = readRow();
  const at = input.at ?? now();
  const snap = toSnapshot(row);
  const persist = input.persist !== false;
  const prevTags = parseReason(row.lastReason)?.strategyTags ?? [];

  if (persist && input.userMessageId && row.lastUserMessageId === input.userMessageId) {
    const tags = pickStrategyTags(snap, snap, EMPTY_DELTA, prevTags);
    return {
      skipped: true,
      state: toDTO(row),
      moodLabel: row.currentMood,
      moodTheater: parseReason(row.lastReason)?.theater ?? '',
      strategyBlock: buildStrategyBlock(snap, row.currentMood, tags),
      strategyTags: tags,
      moves: [],
    };
  }

  const ctx: TurnContext = {
    text: input.userText,
    now: at,
    gapMs: Math.max(0, at - row.updatedAt),
    fromUser: true,
    turnCount: row.turnCount,
    prevTags,
  };
  const result = evolveTurn(snap, input.delta, ctx);

  const stored: StoredEvolution = {
    at,
    messageId: null,
    deltas: result.moves,
    signals: [],
    moodBefore: row.currentMood,
    moodAfter: result.moodLabel,
    gapMs: ctx.gapMs,
    theater: result.moodTheater,
    strategyTags: result.strategyTags,
    source: input.source,
  };

  if (!persist) {
    const transient: CharacterStateRow = {
      ...row,
      possessiveness: result.next.jealousy,
      tension: result.next.tension,
      restraint: result.next.restraint,
      vulnerability: result.next.vulnerability,
      affection: result.next.affection,
      longing: result.next.longing,
      currentMood: result.moodLabel,
      lastReason: JSON.stringify(stored),
      turnCount: row.turnCount + 1,
      updatedAt: at,
    };
    return {
      skipped: false,
      state: toDTO(transient),
      moodLabel: result.moodLabel,
      moodTheater: result.moodTheater,
      strategyBlock: result.strategyBlock,
      strategyTags: result.strategyTags,
      moves: result.moves,
    };
  }

  db.update(characterState)
    .set({
      affection: result.next.affection,
      possessiveness: result.next.jealousy,
      restraint: result.next.restraint,
      longing: result.next.longing,
      tension: result.next.tension,
      vulnerability: result.next.vulnerability,
      currentMood: result.moodLabel,
      lastReason: JSON.stringify(stored),
      lastUserMessageId: input.userMessageId ?? null,
      turnCount: row.turnCount + 1,
      updatedAt: at,
    })
    .where(eq(characterState.id, STATE_ID))
    .run();

  return {
    skipped: false,
    state: getState(),
    moodLabel: result.moodLabel,
    moodTheater: result.moodTheater,
    strategyBlock: result.strategyBlock,
    strategyTags: result.strategyTags,
    moves: result.moves,
  };
}

// ─────────────────────────────────────────────────────────────
// 兜底路径：消息落库时的规则演进（老路径）
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
 *
 * 2026-10-19：多返回 `userId`，供前置分析的幂等判断用。
 */
export function resolveUserText(messageId: string): {
  text: string;
  fromUser: boolean;
  isTurn: boolean;
  userId: string | null;
} {
  const msg = db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!msg || msg.deletedAt != null) return { text: '', fromUser: false, isTurn: false, userId: null };
  if (msg.role === 'user') return { text: msg.content, fromUser: true, isTurn: true, userId: msg.id };
  if (!msg.parentId) return { text: '', fromUser: false, isTurn: false, userId: null };
  const parent = db.select().from(messages).where(eq(messages.id, msg.parentId)).get();
  if (!parent || parent.deletedAt != null || parent.role !== 'user') {
    return { text: '', fromUser: false, isTurn: false, userId: null };
  }
  return { text: parent.content, fromUser: true, isTurn: true, userId: parent.id };
}

export interface EvolveResult {
  /** true = 没有真的演进（重复触发 / 不是一轮对话 / 已经前置分析过） */
  skipped: boolean;
  reason?: 'duplicate' | 'not_a_turn' | 'empty_text' | 'pre_analyzed';
  evolution?: EmotionEvolution;
  state: CharacterStateDTO;
}

/**
 * 一轮对话结束后的自动演进（**兜底路径**）。
 *
 * **幂等**：
 * - `character_state.last_message_id` 记着上一次为哪条助手消息演进过，同一条再来直接跳过；
 * - `character_state.last_user_message_id` 记着已经被 `/chat/stream` 前置分析过的用户消息，
 *   若这一轮的 parent 用户消息已在那边分析过，这里也跳过（避免同一轮演进两次）。
 */
export function evolveForMessage(messageId: string, at: number = now()): EvolveResult {
  const row = readRow();
  if (row.lastMessageId === messageId) {
    return { skipped: true, reason: 'duplicate', state: toDTO(row) };
  }

  const { text, fromUser, isTurn, userId } = resolveUserText(messageId);
  if (!isTurn) return { skipped: true, reason: 'not_a_turn', state: toDTO(row) };
  if (!text.trim()) return { skipped: true, reason: 'empty_text', state: toDTO(row) };
  // 这一轮已经在 /chat/stream 前置分析过 → 兜底规则不要再叠一次
  if (userId && row.lastUserMessageId === userId) {
    return { skipped: true, reason: 'pre_analyzed', state: toDTO(row) };
  }

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
    source: 'heuristic',
  };

  // 兜底路径也要给新两维一个缓慢回稳，否则它们会永远停在初始值
  const snap = toSnapshot(row);
  const settle = evolveTurn(snap, EMPTY_DELTA, {
    text,
    now: at,
    gapMs: evolution.gapMs,
    fromUser,
    turnCount: row.turnCount,
    prevTags: parseReason(row.lastReason)?.strategyTags ?? [],
  });
  const moodAfter = evolution.moodAfter === '温柔' ? deriveMoodLabel(settle.next) : evolution.moodAfter;

  db.update(characterState)
    .set({
      ...evolution.state,
      currentMood: moodAfter,
      tension: settle.next.tension,
      vulnerability: settle.next.vulnerability,
      lastReason: JSON.stringify({ ...stored, moodAfter }),
      lastMessageId: messageId,
      turnCount: row.turnCount + 1,
      updatedAt: at,
    })
    .where(eq(characterState.id, STATE_ID))
    .run();

  return { skipped: false, evolution, state: getState() };
}

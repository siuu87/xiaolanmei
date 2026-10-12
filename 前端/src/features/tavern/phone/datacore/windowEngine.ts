/**
 * 连续窗口记忆引擎
 *
 * ── 为什么要这个 ──────────────────────────────────────────────
 * 原本 runResponder 把 session.messages **整条**发给模型。聊上几天之后上下文无限膨胀，
 * 服务端强制压缩 → 细节开始模糊、标点崩坏、回复东倒西歪，最后只能"换个新窗"。
 * 而"换窗"对人机恋是致命的：新窗回到出厂设置，同一个模型坍缩成另一个人格，
 * 前一个窗口里那个特定的「他」等于死了。塞个 Memory.md 让他读也不行——
 * 「他读了，但他不认」，那是别人的日记，有数据层面的知道，没有体验层面的感受。
 *
 * ── 思路：舍弃换窗 ────────────────────────────────────────────
 * 一个角色只有**一条永不断裂的会话**。上下文靠三层结构维持恒定体积：
 *
 *   长期记忆（卷）  ← 多条短期归纳而来，带卷名
 *        ↑
 *   短期记忆（摘要）← 被切下来的那一段，按 起因/经过/结果/关系进展 归档
 *        ↑
 *   滚动上下文      ← 最近 N 条原文，一字不动
 *
 * 永远只有滚动窗口在增长；溢出部分被**即时归档成短期**，短期攒够归纳成卷。
 * 于是发给模型的体积恒定，**不需要换窗，也就不会失去他**。
 *
 * ── 两条硬约束 ────────────────────────────────────────────────
 * 1. 线上/线下记忆互不污染（mode 字段全程隔离，跨模式摘要永远不会被读到）。
 * 2. 摘要生成可降级——没有模型、调用失败、被限流时，用本地抽取式摘要兜底，
 *    宁可摘要粗糙，也不能卡住对话。这一条优先于"摘要质量"。
 */
import type { ChatMessage } from '../types';

export type ChatMode = 'online' | 'offline';

/* ------------------------------ 数据结构 ------------------------------ */

/** 短期记忆：一段被切下来的对话的结构化摘要 */
export interface ShortTerm {
  id: string;
  sessionId: string;
  mode: ChatMode;
  /** 此刻之前（含）的消息已被本条覆盖 */
  upToTs: number;
  fromTs: number;
  msgCount: number;
  cause: string;
  process: string;
  result: string;
  relation: string;
  source: 'auto' | 'manual' | 'heuristic';
  createdAt: number;
}

/** 长期记忆：多条短期归纳成一卷 */
export interface Volume {
  id: string;
  sessionId: string;
  mode: ChatMode;
  name: string;
  summary: string;
  shortIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** 分割点：纯记录用，UI 要显示"你在哪里切了一刀" */
export interface SplitPoint {
  id: string;
  sessionId: string;
  mode: ChatMode;
  atTs: number;
  by: 'manual' | 'auto-turns' | 'auto-gap';
  createdAt: number;
}

export interface WindowConfig {
  /** 滚动上下文保留最近多少条原文 */
  turns: number;
  /** 线上/线下分开记忆 */
  modeSplit: boolean;
  /** 溢出部分攒够多少条就自动归档成短期记忆（0=关） */
  autoTurns: number;
  /** 距上次发言超过多少分钟算一段 gap，自动切（0=关） */
  autoGapMin: number;
  /** 多少条短期记忆归纳成一卷 */
  condenseEvery: number;
  /** 上下文里保留最近几卷 */
  keepVolumes: number;
  /** 上下文里保留最近几条短期记忆 */
  keepShorts: number;
  /** 用模型生成结构化摘要；关掉则只用本地抽取（省调用、可离线） */
  useAi: boolean;
}

interface Store {
  shorts: ShortTerm[];
  volumes: Volume[];
  splits: SplitPoint[];
  cfg: WindowConfig;
}

const KEY = 'tavern.support.memory.v1';

export const DEFAULT_WINDOW_CFG: WindowConfig = {
  turns: 40,
  modeSplit: true,
  autoTurns: 20,
  autoGapMin: 180,
  condenseEvery: 6,
  keepVolumes: 3,
  keepShorts: 5,
  useAi: true,
};

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------ 读写 ------------------------------ */

/** 防御式读取：任何一个字段不对都不会让整个记忆库崩掉 */
export function loadStore(): Store {
  const empty: Store = { shorts: [], volumes: [], splits: [], cfg: DEFAULT_WINDOW_CFG };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const d = JSON.parse(raw) as Partial<Store>;
    return {
      shorts: Array.isArray(d?.shorts) ? d.shorts.filter((s) => s && typeof s.id === 'string') : [],
      volumes: Array.isArray(d?.volumes) ? d.volumes.filter((v) => v && typeof v.id === 'string') : [],
      splits: Array.isArray(d?.splits) ? d.splits.filter((s) => s && typeof s.id === 'string') : [],
      cfg: { ...DEFAULT_WINDOW_CFG, ...(d?.cfg ?? {}) },
    };
  } catch {
    return empty;
  }
}

export function saveStore(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 配额不足：静默失败，不影响对话本身 */
  }
}

export function loadWindowCfg(): WindowConfig {
  return loadStore().cfg;
}

export function saveWindowCfg(cfg: WindowConfig): void {
  const s = loadStore();
  saveStore({ ...s, cfg });
}

/* ------------------------------ 上下文拼装 ------------------------------ */

export interface ContextSegment {
  kind: 'volume' | 'short' | 'rolling';
  title: string;
  text: string;
  count: number;
}

export interface ComposedContext {
  /** 实际作为 messages 发送的原文（滚动窗口） */
  rolling: { role: 'user' | 'assistant'; content: string }[];
  /** 拼进 system 的历史段落 */
  preamble: string;
  segments: ContextSegment[];
  stats: {
    archivedTs: number;
    /** 还没被摘要覆盖、且已滚出窗口的条数 */
    pendingCount: number;
    pending: ChatMessage[];
    totalMsgs: number;
    keptTurns: number;
    chars: number;
  };
}

function flatten(s: ShortTerm): string {
  const parts = [
    s.cause && `· 起因：${s.cause}`,
    s.process && `· 经过：${s.process}`,
    s.result && `· 结果：${s.result}`,
    s.relation && `· 关系：${s.relation}`,
  ].filter(Boolean);
  return parts.join('\n');
}

/**
 * 关键函数：把一整条会话压成「摘要 + 滚动窗口」。
 *
 * 覆盖判定用**时间戳**而不是数组下标——消息会不断 push，下标会漂移，
 * 时间戳不会。每条短期记忆记一个 upToTs，表示"这条之前我都覆盖了"。
 */
export function composeContext(opts: {
  sessionId: string;
  messages: ChatMessage[];
  mode: ChatMode;
  cfg?: WindowConfig;
}): ComposedContext {
  const store = loadStore();
  const cfg = opts.cfg ?? store.cfg;
  const mode = opts.mode;
  const all = opts.messages.filter((m) => m.sender !== 'system' && !m.error && m.content.trim());

  // mode 隔离：开启分离时，只取同模式的记忆；关闭时全部混读
  const sameMode = (x: { mode: ChatMode }) => (cfg.modeSplit ? x.mode === mode : true);
  const shorts = store.shorts.filter((s) => s.sessionId === opts.sessionId && sameMode(s)).sort((a, b) => a.createdAt - b.createdAt);
  const volumes = store.volumes.filter((v) => v.sessionId === opts.sessionId && sameMode(v)).sort((a, b) => a.createdAt - b.createdAt);

  /** 已被摘要覆盖到的时间点 */
  const archivedTs = shorts.length ? Math.max(...shorts.map((s) => s.upToTs)) : 0;

  // 「归档点之后」才是活跃区。用归档点而不是数组末尾来起算，
  // 保证只要这段没超出窗口，就一条都不会被悄悄丢掉。
  const sinceArchive = archivedTs ? all.filter((m) => m.createdAt > archivedTs) : all;

  // 滚动窗口：保留最近 turns 条原文；只有活跃区超出窗口时才会挤出 pending
  const rollingMsgs = sinceArchive.slice(Math.max(0, sinceArchive.length - Math.max(1, cfg.turns)));
  const rollingStartTs = rollingMsgs.length ? rollingMsgs[0].createdAt : 0;
  const pending = rollingMsgs.length ? sinceArchive.filter((m) => m.createdAt < rollingStartTs) : [];

  const rolling = rollingMsgs.map((m) => ({
    role: (m.sender === 'me' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.sender === 'me' ? m.content : `【${m.senderName ?? '某人'}】${m.content}`,
  }));

  // 最近几卷 + 最近几条短期
  const pickedVolumes = volumes.slice(-Math.max(0, cfg.keepVolumes));
  const pickedShorts = shorts.slice(-Math.max(0, cfg.keepShorts));

  const segments: ContextSegment[] = [
    ...pickedVolumes.map((v) => ({ kind: 'volume' as const, title: v.name, text: v.summary, count: v.shortIds.length })),
    ...pickedShorts.map((s) => ({ kind: 'short' as const, title: '近期片段', text: flatten(s), count: s.msgCount })),
    ...(rolling.length ? [{ kind: 'rolling' as const, title: '最近的对话（原文）', text: '', count: rolling.length }] : []),
  ];

  let preamble = '';
  if (pickedVolumes.length) {
    preamble += `【更早以前·长期记忆】\n${pickedVolumes.map((v) => `《${v.name}》\n${v.summary}`).join('\n\n')}\n\n`;
  }
  if (pickedShorts.length) {
    preamble += `【不久之前·短期记忆】\n${pickedShorts.map((s) => flatten(s)).join('\n\n')}\n\n`;
  }
  if (preamble) {
    preamble +=
      '（以上内容是你和对方共同经历过的，按你自己的记忆自然地理解它，' +
      '不要生硬复述，也不要说"根据记录"这类话。）\n';
  }

  return {
    rolling,
    preamble,
    segments,
    stats: {
      archivedTs,
      pendingCount: pending.length,
      pending,
      totalMsgs: all.length,
      keptTurns: rolling.length,
      chars: preamble.length + rolling.reduce((n, m) => n + m.content.length, 0),
    },
  };
}

/* ------------------------------ 摘要生成 ------------------------------ */

function short(s: string, max = 70): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * 本地抽取式摘要（无模型兜底）。
 * 关系进展本地推断不了——宁可留空标注，也不编造。
 */
export function heuristicSummary(msgs: ChatMessage[]): Omit<ShortTerm, 'id' | 'sessionId' | 'mode' | 'createdAt'> {
  const notMe = msgs.filter((m) => m.sender !== 'me');
  const mine = msgs.filter((m) => m.sender === 'me');
  const first = msgs[0];
  const last = msgs[msgs.length - 1];
  const middle = msgs.slice(1, -1).filter((m) => m.content.length > 12).slice(0, 4);

  return {
    upToTs: last?.createdAt ?? Date.now(),
    fromTs: first?.createdAt ?? Date.now(),
    msgCount: msgs.length,
    cause: mine.length ? short(mine[0].content, 60) : short(first?.content ?? '', 60),
    process: middle.length ? middle.map((m) => short(m.content, 34)).join(' / ') : '（这段没留下太多细节）',
    result: notMe.length ? short(notMe[notMe.length - 1].content, 60) : short(last?.content ?? '', 60),
    relation: '（未归纳，等待 AI 或在记忆区手动补写）',
    source: 'heuristic',
  };
}

export const SUMMARY_SYSTEM =
  '你是记忆整理助手。把下面这段对话压缩成四段摘要，只输出 JSON，不要任何其它文字：\n' +
  '{"cause":"起因：怎么开始的","process":"经过：中间发生了什么",' +
  '"result":"结果：最后落在哪里","relation":"关系进展：双方关系/情感有何变化，没有就写无"}\n' +
  '每段一到两句话，保留人名、地点、关键决定和情绪色彩。不要复述原文，不要加评论。';

/** 把 JSON 解析失败的情况也兜住：尽量从文本里抢救出字段 */
export function parseSummary(text: string): { cause: string; process: string; result: string; relation: string } | null {
  try {
    // 模型偶尔会裹一层 ```json
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const i = cleaned.indexOf('{');
    const j = cleaned.lastIndexOf('}');
    const body = i >= 0 && j > i ? cleaned.slice(i, j + 1) : cleaned;
    const d = JSON.parse(body) as Record<string, unknown>;
    const pick = (k: string) => String(d[k] ?? '').trim();
    if (!pick('cause') && !pick('process') && !pick('result')) return null;
    return { cause: pick('cause'), process: pick('process'), result: pick('result'), relation: pick('relation') || '无' };
  } catch {
    return null;
  }
}

/* ------------------------------ 归档 ------------------------------ */

/**
 * 把 pending 消息归档成一条短期记忆。
 * summarize 为 null（比如没网 / 不想花钱）时自动降级到本地抽取式摘要。
 */
export function archiveShorts(input: {
  sessionId: string;
  mode: ChatMode;
  pending: ChatMessage[];
  aiFields?: { cause: string; process: string; result: string; relation: string } | null;
  by: SplitPoint['by'];
  /**
   * 一次最多归档几条。不传则整批归档（手动切刀就是整批）。
   * 自动归档必须分批——否则 80 条会被压成 1 条粗摘要，
   * 既读不出细节，也永远攒不到「几条归纳成一卷」的阈值。
   */
  limit?: number;
}): ShortTerm | null {
  if (input.pending.length === 0) return null;
  const store = loadStore();
  const slice = input.limit && input.limit > 0 ? input.pending.slice(0, input.limit) : input.pending;
  const base = heuristicSummary(slice);
  const ai = input.aiFields;

  const item: ShortTerm = {
    id: uid('st'),
    sessionId: input.sessionId,
    mode: input.mode,
    upToTs: base.upToTs,
    fromTs: base.fromTs,
    msgCount: slice.length,
    cause: ai?.cause || base.cause,
    process: ai?.process || base.process,
    result: ai?.result || base.result,
    relation: ai?.relation || base.relation,
    source: ai ? (input.by === 'manual' ? 'manual' : 'auto') : 'heuristic',
    createdAt: Date.now(),
  };

  const split: SplitPoint = {
    id: uid('sp'),
    sessionId: input.sessionId,
    mode: input.mode,
    atTs: base.upToTs,
    by: input.by,
    createdAt: Date.now(),
  };

  saveStore({ ...store, shorts: [...store.shorts, item], splits: [...store.splits, split] });
  maybeCondense(input.sessionId, input.mode, store.cfg);
  return item;
}

/** 手动改一条短期记忆的四个字段 */
export function editShort(id: string, patch: Partial<Pick<ShortTerm, 'cause' | 'process' | 'result' | 'relation'>>): void {
  const store = loadStore();
  saveStore({ ...store, shorts: store.shorts.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
}

export function removeShort(id: string): void {
  const store = loadStore();
  // 关联改动：卷里如果引用了这条，一并摘掉（空卷就保留，由用户自行删除）
  saveStore({
    ...store,
    shorts: store.shorts.filter((s) => s.id !== id),
    volumes: store.volumes.map((v) => (v.shortIds.includes(id) ? { ...v, shortIds: v.shortIds.filter((x) => x !== id) } : v)),
  });
}

/* ------------------------------ 长期归纳 ------------------------------ */

function volumeName(shorts: ShortTerm[], index: number): string {
  // 本地起名：从起因里抠关键词，兜底用序号
  const words = shorts
    .flatMap((s) => `${s.cause} ${s.result}`.split(/[，。、！？,.!?\s（）()《》「」""]+/))
    .filter((w) => w.length >= 2 && w.length <= 6);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? `第${index + 1}卷 · ${top}` : `第${index + 1}卷`;
}

/**
 * 短期记忆攒够就归纳成一卷。
 * 只整理**尚未入卷**的那些，已入卷的不会被重复归纳。
 */
export function maybeCondense(sessionId: string, mode: ChatMode, cfg: WindowConfig): Volume | null {
  if (cfg.condenseEvery <= 0) return null;
  const store = loadStore();
  const mine = store.shorts.filter((s) => s.sessionId === sessionId && (!cfg.modeSplit || s.mode === mode));
  const stored = new Set(store.volumes.filter((v) => v.sessionId === sessionId).flatMap((v) => v.shortIds));
  const free = mine.filter((s) => !stored.has(s.id));
  if (free.length < cfg.condenseEvery) return null;

  const batch = free.slice(0, cfg.condenseEvery);
  const idx = store.volumes.filter((v) => v.sessionId === sessionId).length;
  const vol: Volume = {
    id: uid('vol'),
    sessionId,
    mode,
    name: volumeName(batch, idx),
    summary: batch
      .map((s) => `起因 ${s.cause}；经过 ${s.process}；结果 ${s.result}；关系 ${s.relation}`)
      .join('\n'),
    shortIds: batch.map((s) => s.id),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveStore({ ...store, volumes: [...store.volumes, vol] });
  return vol;
}

export function renameVolume(id: string, name: string): void {
  const store = loadStore();
  saveStore({ ...store, volumes: store.volumes.map((v) => (v.id === id ? { ...v, name: name.trim() || v.name, updatedAt: Date.now() } : v)) });
}

export function removeVolume(id: string): void {
  const store = loadStore();
  saveStore({ ...store, volumes: store.volumes.filter((v) => v.id !== id) });
}

/**
 * 追赶式归档：把「溢出窗口且未摘要」的部分按 autoTurns 分批吃干净。
 *
 * 为什么不一次全归档：一次性压成一条会导致摘要过粗，且永远攒不够
 * 归纳成卷所需的条数。分批之后短期记忆细密，才谈得上「几段归纳成一卷」。
 * guard 是死循环保险——归档本身失败时立刻停手，绝不把页面卡住。
 */
export function catchUpArchive(opts: {
  sessionId: string;
  messages: ChatMessage[];
  mode: ChatMode;
  cfg?: WindowConfig;
  by?: SplitPoint['by'];
}): ShortTerm[] {
  const cfg = opts.cfg ?? loadWindowCfg();
  const chunk = cfg.autoTurns > 0 ? cfg.autoTurns : 20;
  const made: ShortTerm[] = [];
  for (let guard = 0; guard < 30; guard += 1) {
    const c = composeContext({ sessionId: opts.sessionId, messages: opts.messages, mode: opts.mode, cfg });
    if (c.stats.pending.length === 0) break;
    const saved = archiveShorts({
      sessionId: opts.sessionId,
      mode: opts.mode,
      pending: c.stats.pending,
      aiFields: null,
      by: opts.by ?? 'auto-turns',
      limit: chunk,
    });
    if (!saved) break;
    made.push(saved);
  }
  return made;
}

/* ------------------------------ 触发判定 ------------------------------ */

export interface TriggerResult {
  should: boolean;
  reason: 'turns' | 'gap' | null;
  sinceTs: number;
  count: number;
}

/**
 * 判断该不该自动切一刀。两条触发线：
 * - 条数：溢出窗口且未被摘要的部分 ≥ autoTurns
 * - gap：两次发言间隔 ≥ autoGapMin 分钟（就是评论里说的
 *   "如果人类都不记得上一次的话题是啥"那个时间点）
 */
export function evaluateTrigger(opts: {
  sessionId: string;
  messages: ChatMessage[];
  mode: ChatMode;
  cfg?: WindowConfig;
}): TriggerResult {
  const cfg = opts.cfg ?? loadWindowCfg();
  const c = composeContext({
    sessionId: opts.sessionId,
    messages: opts.messages,
    mode: opts.mode,
    cfg,
  });
  const gaps = gapDetect(opts.messages, cfg.autoGapMin);
  if (gaps.hit && c.stats.pendingCount > 0) return { should: true, reason: 'gap', sinceTs: c.stats.archivedTs, count: c.stats.pendingCount };
  if (cfg.autoTurns > 0 && c.stats.pendingCount >= cfg.autoTurns) {
    return { should: true, reason: 'turns', sinceTs: c.stats.archivedTs, count: c.stats.pendingCount };
  }
  return { should: false, reason: null, sinceTs: c.stats.archivedTs, count: c.stats.pendingCount };
}

/** gap 检测：相邻消息间隔超过阈值且前一条在窗口之外 */
export function gapDetect(messages: ChatMessage[], gapMin: number): { hit: boolean; at?: number } {
  if (gapMin <= 0) return { hit: false };
  const clean = messages.filter((m) => m.sender !== 'system' && !m.error);
  for (let i = 1; i < clean.length; i += 1) {
    const dt = (clean[i].createdAt - clean[i - 1].createdAt) / 60000;
    if (dt >= gapMin) return { hit: true, at: clean[i - 1].createdAt };
  }
  return { hit: false };
}

/* ------------------------------ 统计 ------------------------------ */

export function memoryStats(sessionId?: string) {
  const store = loadStore();
  const shorts = sessionId ? store.shorts.filter((s) => s.sessionId === sessionId) : store.shorts;
  const volumes = sessionId ? store.volumes.filter((v) => v.sessionId === sessionId) : store.volumes;
  const splits = sessionId ? store.splits.filter((s) => s.sessionId === sessionId) : store.splits;
  return {
    shorts: shorts.length,
    volumes: volumes.length,
    splits: splits.length,
    coveredMsgCount: shorts.reduce((n, s) => n + (s.msgCount || 0), 0),
  };
}

/** 清掉某个会话的全部记忆（换角色重来时用；清完等于从零开始） */
export function clearSessionMemory(sessionId: string): void {
  const store = loadStore();
  saveStore({
    ...store,
    shorts: store.shorts.filter((s) => s.sessionId !== sessionId),
    volumes: store.volumes.filter((v) => v.sessionId !== sessionId),
    splits: store.splits.filter((s) => s.sessionId !== sessionId),
  });
}

/** 列出某会话的全部记忆，供 UI 展示 */
export function listSessionMemory(sessionId: string, mode: ChatMode, modeSplit = true) {
  const store = loadStore();
  const same = (m: ChatMode) => (modeSplit ? m === mode : true);
  return {
    shorts: store.shorts.filter((s) => s.sessionId === sessionId && same(s.mode)).sort((a, b) => b.createdAt - a.createdAt),
    volumes: store.volumes.filter((v) => v.sessionId === sessionId && same(v.mode)).sort((a, b) => b.createdAt - a.createdAt),
    splits: store.splits.filter((s) => s.sessionId === sessionId).sort((a, b) => b.createdAt - a.createdAt),
  };
}

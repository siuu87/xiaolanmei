/**
 * 消息时间戳 patch（2026-10-19）—— 让模型「看得见」每条消息是什么时候发的。
 *
 * 核心原则（来自 Hermes 时间戳 patch 的思路）：
 * **存档保持干净，时间戳只在「送去给模型看」的那一步动态渲染。**
 * 如果把 `[Tue 2026-08-11 17:32:10 CST]` 写进 `messages.content` 落库，
 * 每次加载都会再叠一层，几轮之后变成 `[时间][时间][时间]正文`，上下文越滚越脏。
 *
 * 三块：
 * 1. 渲染：`[Tue 2026-08-11 17:32:10 CST · +9h 44m] 正文`
 *    - 时间固定按 **CST（UTC+8）** 渲染，不随服务器时区漂移；
 *    - 间隔尾巴只在上一条存在且 ≥1 分钟时出现。
 * 2. 幂等：`stripTimestamps()` 先剥掉已有前缀（正则同时吃掉间隔尾巴），重复渲染不叠加。
 * 3. 开关：`MESSAGE_TIMESTAMPS=off` 时 `decorateMessages()` 原样返回。
 *
 * 挂载点只有一处：`/chat/stream` 组装好 `finalMessages` 之后、`runAgentLoop` 之前。
 * 因为本项目的「历史加载」与「新消息」最终都汇成同一份 `messages` 数组，
 * 在这一处统一渲染即可同时覆盖文章里说的两个入口，且**绝不回写数据库**。
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** CST = UTC+8，固定偏移，避免服务器/Docker 时区把时间算偏 */
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 已渲染前缀：[Tue 2026-08-11 17:32:10 CST] 或 [Tue ... CST · +9h 44m] */
const PREFIX_RE =
  /^\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[A-Z]{2,5}(?:\s+·\s+\+[^\]]+)?\]\s*/;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `Tue 2026-08-11 17:32:10 CST`（不含方括号） */
export function formatTimestampBody(ms: number): string {
  const d = new Date((Number.isFinite(ms) ? ms : Date.now()) + CST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const da = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${WEEKDAYS[d.getUTCDay()]} ${y}-${mo}-${da} ${hh}:${mm}:${ss} CST`;
}

/**
 * 两条消息的间隔：`+9h 44m` / `+12m` / `+2d 3h`。
 * < 1 分钟返回空串（刚连着发的消息不需要尾巴，免得刷屏）。
 */
export function formatGap(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return '';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length ? `+${parts.join(' ')}` : '';
}

/** 完整前缀（含方括号）：`[Tue 2026-08-11 17:32:10 CST · +9h 44m] ` */
export function formatMessagePrefix(at: number, gapMs?: number | null): string {
  const gap = gapMs != null ? formatGap(gapMs) : '';
  return `[${formatTimestampBody(at)}${gap ? ` · ${gap}` : ''}] `;
}

/**
 * 剥掉已有时间戳前缀（可多层）。
 * 只认严格格式，正文里普通的 `[注]` / `[图片]` 不会被误伤。
 */
export function stripTimestamps(text: string): string {
  let out = text ?? '';
  // 最多剥 3 层，防御历史脏数据；正常只会有一层
  for (let i = 0; i < 3; i++) {
    const next = out.replace(PREFIX_RE, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

export interface TimestampableMessage {
  role: string;
  content: string;
  /** 这条消息的发送时刻（ms）；缺省用 opts.now */
  createdAt?: number;
}

export interface DecorateOptions {
  /** false = 原样返回（MESSAGE_TIMESTAMPS=off） */
  enabled?: boolean;
  /** 缺失 createdAt 时用的「现在」 */
  now?: number;
  /** 只给这些角色加时间戳（默认 user + assistant） */
  includeRoles?: string[];
}

/**
 * 给一组消息动态渲染时间戳。**返回新数组，不修改入参，也不落库。**
 *
 * - 只处理 `includeRoles` 里的角色（system / tool 不动）；
 * - 间隔按「相邻两条被渲染的消息」计算；
 * - 幂等：先 strip 再 render，重复调用不会叠加前缀。
 */
export function decorateMessages<T extends TimestampableMessage>(
  messages: T[],
  opts: DecorateOptions = {},
): T[] {
  if (opts.enabled === false) return messages;
  const include = new Set(opts.includeRoles ?? ['user', 'assistant']);
  const fallbackNow = opts.now ?? Date.now();
  let prevAt: number | null = null;

  return messages.map((m) => {
    if (!include.has(m.role)) return m;
    const raw = m.createdAt;
    const at = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : fallbackNow;
    const gap = prevAt != null && at > prevAt ? at - prevAt : null;
    prevAt = at;
    const clean = stripTimestamps(String(m.content ?? ''));
    return { ...m, content: `${formatMessagePrefix(at, gap)}${clean}` };
  });
}

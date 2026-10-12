/**
 * 数据中枢 · 来源采集器
 *
 * 每个采集器负责：从 localStorage 读出某个模块的数据 → 压成几行人话。
 * 约定：
 * - 读不到 / 没数据就返回 null，由上层静默跳过，绝不抛。
 * - 单行长度必须克制（这里是 AI 的参考素材，不是给它看的原文）。
 * - 所有采集都**不去抖、不加密、只读**，不产生副作用。
 */
import type { BridgeConfig } from './contextBridge';

export interface Gathered {
  title: string;
  lines: string[];
}

/* ------------------------------ 小工具 ------------------------------ */

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 压成单行：去掉换行与多余空白，超长截断 */
function oneLine(s: string, max = 46): string {
  const flat = String(s ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

interface MinimalMsg {
  sender?: string;
  senderName?: string;
  content?: string;
  streaming?: boolean;
}

interface MinimalSession {
  title?: string;
  kind?: 'single' | 'group';
  messages?: MinimalMsg[];
  lastActiveAt?: number;
}

/* ------------------------------ 聊天记录 ------------------------------ */

export function sourceSessions(cfg: BridgeConfig): Gathered | null {
  const blob = readJSON<{ sessions?: MinimalSession[] }>('tavern.phone.v1');
  const sessions = blob?.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const limit = cfg.sources.sessions?.limit ?? 8;
  const picked = sessions
    .filter((s) => (cfg.includeGroup ? true : s.kind !== 'group'))
    // 流式中的半成品不进上下文
    .map((s) => ({ ...s, messages: (s.messages ?? []).filter((m) => !m.streaming) }))
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))
    .slice(0, limit);

  if (picked.length === 0) return null;

  const lines = picked.map((s) => {
    const tail = s.messages.slice(-2).map((m) => {
      const who = m.sender === 'me' ? '我' : m.senderName || '对方';
      return `${who}：${oneLine(m.content ?? '')}`;
    });
    return `- ${s.title ?? '会话'}（${tail.join(' / ')}）`;
  });
  return { title: '最近聊过', lines };
}

/* ------------------------------ 朋友圈 ------------------------------ */

interface MinimalMoment {
  authorName?: string;
  content?: string;
  mine?: boolean;
  likes?: string[];
  comments?: { content?: string; author?: string; mine?: boolean }[];
  createdAt?: number;
}

export function sourceMoments(cfg: BridgeConfig): Gathered | null {
  const blob = readJSON<{ moments?: MinimalMoment[] }>('tavern.phone.v1');
  const moments = blob?.moments;
  if (!Array.isArray(moments) || moments.length === 0) return null;

  const limit = cfg.sources.moments?.limit ?? 6;
  const picked = [...moments].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, limit);
  if (picked.length === 0) return null;

  const lines = picked.map((m) => {
    const who = m.mine ? '我' : m.authorName || '好友';
    const likes = m.likes?.length ? ` · ${m.likes.length} 赞` : '';
    const cmt = m.comments?.[0]?.content ? ` · 评论：${oneLine(m.comments[0].content, 24)}` : '';
    return `- ${who}：${oneLine(m.content ?? '')}${likes}${cmt}`;
  });
  return { title: '朋友圈动态', lines };
}

/* ------------------------------ 片单 ------------------------------ */

interface MinimalWatch {
  title?: string;
  category?: string;
  status?: string;
  note?: string;
}

const CAT_LABEL: Record<string, string> = { movie: '影视', anime: '动漫', show: '演出' };
const ST_LABEL: Record<string, string> = { planned: '准备看的', unwatched: '没看的' };

export function sourceWatchlist(cfg: BridgeConfig): Gathered | null {
  const items = readJSON<MinimalWatch[]>('blueberry.watchlist.v1');
  if (!Array.isArray(items) || items.length === 0) return null;

  const limit = cfg.sources.watchlist?.limit ?? 6;
  const lines = items.slice(0, limit).map((it) => {
    const tag = `${CAT_LABEL[it.category ?? ''] ?? '影视'}·${ST_LABEL[it.status ?? ''] ?? '准备看的'}`;
    const note = it.note ? `（${oneLine(it.note, 22)}）` : '';
    return `- ${oneLine(it.title ?? '', 30)} [${tag}]${note}`;
  });
  return { title: '片单', lines };
}

/* ------------------------------ 书库（当前是书架） ------------------------------ */

interface MinimalBook {
  title?: string;
  author?: string;
  progress?: number;
}

export function sourceLibrary(cfg: BridgeConfig): Gathered | null {
  const items = readJSON<MinimalBook[]>('blueberry.bookhouse.books.v2');
  if (!Array.isArray(items) || items.length === 0) return null;

  const limit = cfg.sources.library?.limit ?? 4;
  const lines = items.slice(0, limit).map((b) => {
    const pct = typeof b.progress === 'number' && b.progress > 0 ? ` · 已读 ${b.progress}%` : '';
    return `- 《${oneLine(b.title ?? '', 26)}》${b.author ? ` / ${b.author}` : ''}${pct}`;
  });
  return { title: '在读的书', lines };
}

/* ------------------------------ 长期记忆（待【记忆区】落地） ------------------------------ */

interface MinimalVolume {
  name?: string;
  summary?: string;
  updatedAt?: number;
}

export function sourceMemory(cfg: BridgeConfig): Gathered | null {
  const data = readJSON<{ volumes?: MinimalVolume[] } | MinimalVolume[]>('tavern.support.memory.v1');
  const volumes = Array.isArray(data) ? data : data?.volumes;
  if (!Array.isArray(volumes) || volumes.length === 0) return null;

  const limit = cfg.sources.memory?.limit ?? 6;
  const lines = volumes
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit)
    .map((v) => `- ${v.name ?? '未命名卷'}：${oneLine(v.summary ?? '', 60)}`);
  return { title: '长期记忆', lines };
}

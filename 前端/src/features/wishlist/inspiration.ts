/**
 * 灵感库的统一数据层（2026-11-14 flomoplus 式改版）。
 *
 * 以前这个页面是两套东西：上面 `wish_clips`（剪藏）、下面 `plugin_wishlist`（想法 + 夹子）。
 * 现在按 flomoplus 的模型收成**一条灵感流** —— 一条灵感可以是「只有想法」，
 * 也可以是「一个来源 + 正文 + 自己的想法」，界面上不再分两个区。
 *
 * 两块数据仍然分表存（AI 写入接口、书签收件口都依赖现有表结构），
 * 只在**读**的时候合并成 `Entry[]`，按时间倒序。这样不用迁移表、也不会断掉任何写入通道。
 */

import { PLATFORM, type Clip, type ClipPlatform } from './clips';

/* ------------------------------------------------------------------ */
/* 想法（plugin_wishlist）                                             */
/* ------------------------------------------------------------------ */

export interface WishItem {
  id: string;
  content: string;
  isTodo: boolean;
  completed: boolean;
  completedAt: number | null;
  sortOrder: number;
  folderId: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const WISH_API = '/api/plugin-wishlist';

export async function fetchWishes(): Promise<WishItem[]> {
  const r = await fetch(WISH_API);
  if (!r.ok) throw new Error('读取灵感失败');
  const raw = (await r.json()) as (Omit<WishItem, 'tags'> & { tags?: string[] })[];
  // 老数据可能没有 tags 字段（后端刚加列时），这里兜一下，别让 map 炸
  return raw.map((w) => ({ ...w, tags: w.tags ?? [] }));
}

export async function createWish(body: {
  content: string;
  tags?: string[];
  isTodo?: boolean;
}): Promise<{ id: string }> {
  const r = await fetch(WISH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!r.ok || !d.id) throw new Error(d.message || '没存上');
  return { id: d.id };
}

export async function patchWish(
  id: string,
  patch: { content?: string; tags?: string[]; completed?: boolean },
): Promise<void> {
  const r = await fetch(`${WISH_API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('没改上');
}

export async function deleteWish(id: string): Promise<void> {
  const r = await fetch(`${WISH_API}/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('没删掉');
}

/* ------------------------------------------------------------------ */
/* 统一条目                                                            */
/* ------------------------------------------------------------------ */

/** 没有来源的纯想法，也给它一套「平台外观」，列表里才能和剪藏排成一行 */
export const NOTE_LOOK = { label: '想法', color: '#9A7B4F', tint: 'rgba(154,123,79,.14)' };

export type EntryKind = 'clip' | 'note';
export type EntryPlatform = ClipPlatform | 'note';

export interface Entry {
  /** React key，带前缀避免两张表 id 撞上 */
  key: string;
  kind: EntryKind;
  id: string;
  /** 列表里的主标题（想法取第一行） */
  title: string;
  /** 标题下面那两行摘要 */
  summary: string;
  cover: string;
  platform: EntryPlatform;
  tags: string[];
  url: string;
  author: string;
  createdAt: number;
  completed: boolean;
  clip?: Clip;
  wish?: WishItem;
}

/** 想法的第一行当标题，剩下的当摘要 —— 用户写多行时长列表里才不会糊成一团 */
function splitNote(text: string): { title: string; summary: string } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { title: '（空）', summary: '' };
  return { title: lines[0], summary: lines.slice(1).join(' ') };
}

export function clipToEntry(c: Clip): Entry {
  return {
    key: `clip:${c.id}`,
    kind: 'clip',
    id: c.id,
    title: c.title || c.url,
    summary: c.excerpt || c.note || '',
    cover: c.cover,
    platform: c.platform,
    tags: c.tags,
    url: c.url,
    author: c.author,
    createdAt: c.createdAt,
    completed: false,
    clip: c,
  };
}

export function wishToEntry(w: WishItem): Entry {
  const { title, summary } = splitNote(w.content);
  return {
    key: `note:${w.id}`,
    kind: 'note',
    id: w.id,
    title,
    summary,
    cover: '',
    platform: 'note',
    tags: w.tags,
    url: '',
    author: '',
    createdAt: w.createdAt,
    completed: w.completed,
    wish: w,
  };
}

/** 两条流合并，按时间倒序（同一毫秒时让剪藏在前，素材比想法「重」一点） */
export function mergeEntries(clips: Clip[], wishes: WishItem[]): Entry[] {
  return [...clips.map(clipToEntry), ...wishes.map(wishToEntry)].sort(
    (a, b) => b.createdAt - a.createdAt || (a.kind === b.kind ? 0 : a.kind === 'clip' ? -1 : 1),
  );
}

export function lookOf(p: EntryPlatform): { label: string; color: string; tint: string } {
  return p === 'note' ? NOTE_LOOK : (PLATFORM[p] ?? PLATFORM.web);
}

/* ------------------------------------------------------------------ */
/* 筛选 / 分组                                                         */
/* ------------------------------------------------------------------ */

export type Filter =
  | { type: 'all' }
  | { type: 'platform'; value: EntryPlatform }
  | { type: 'tag'; value: string }
  | { type: 'untagged' }
  | { type: 'done' };

export function filterEntries(entries: Entry[], f: Filter): Entry[] {
  switch (f.type) {
    case 'all':
      return entries.filter((e) => !e.completed);
    case 'platform':
      return entries.filter((e) => e.platform === f.value);
    case 'tag':
      return entries.filter((e) => e.tags.includes(f.value));
    case 'untagged':
      return entries.filter((e) => e.tags.length === 0);
    case 'done':
      return entries.filter((e) => e.completed);
  }
}

export function sameFilter(a: Filter, b: Filter): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'platform' && b.type === 'platform') return a.value === b.value;
  if (a.type === 'tag' && b.type === 'tag') return a.value === b.value;
  return true;
}

/** 搜标题、摘要、正文、作者、标签 —— 一条灵感里所有能看的字 */
export function searchEntries(entries: Entry[], tokens: string[]): Entry[] {
  if (!tokens.length) return entries;
  return entries.filter((e) => {
    const hay = [
      e.title,
      e.summary,
      e.author,
      e.tags.join(' '),
      e.clip?.content ?? '',
      e.clip?.note ?? '',
      e.wish?.content ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/** 顶部 chips：全部 + 出现过的平台（按条数排）+ 标签（按条数排，最多 8 个） */
export function buildChips(entries: Entry[]): {
  filter: Filter;
  label: string;
  count: number;
  color?: string;
}[] {
  const live = entries.filter((e) => !e.completed);
  const chips: { filter: Filter; label: string; count: number; color?: string }[] = [
    { filter: { type: 'all' }, label: '全部', count: live.length },
  ];

  const byPlatform = new Map<EntryPlatform, number>();
  live.forEach((e) => byPlatform.set(e.platform, (byPlatform.get(e.platform) ?? 0) + 1));
  [...byPlatform.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([p, n]) => {
      chips.push({
        filter: { type: 'platform', value: p },
        label: lookOf(p).label,
        count: n,
        color: lookOf(p).color,
      });
    });

  const byTag = new Map<string, number>();
  live.forEach((e) => e.tags.forEach((t) => byTag.set(t, (byTag.get(t) ?? 0) + 1)));
  const topTags = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  topTags.forEach(([t, n]) => chips.push({ filter: { type: 'tag', value: t }, label: `#${t}`, count: n }));

  const untagged = live.filter((e) => e.tags.length === 0).length;
  if (untagged && live.length > untagged) {
    chips.push({ filter: { type: 'untagged' }, label: '未打标签', count: untagged });
  }
  const done = entries.filter((e) => e.completed).length;
  if (done) chips.push({ filter: { type: 'done' }, label: '已完成', count: done });

  return chips;
}

/* ------------------------------------------------------------------ */
/* 时间分组                                                            */
/* ------------------------------------------------------------------ */

export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

export function monthLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

/** flomoplus 那种「2026年08月01日 09:00」 —— 列表里每行的来源行都用这个格式 */
export function fullTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function groupByMonth(entries: Entry[]): { key: string; label: string; items: Entry[] }[] {
  const out: { key: string; label: string; items: Entry[] }[] = [];
  entries.forEach((e) => {
    const k = monthKey(e.createdAt);
    const last = out[out.length - 1];
    if (last && last.key === k) last.items.push(e);
    else out.push({ key: k, label: monthLabel(e.createdAt), items: [e] });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

export interface Stats {
  total: number;
  thisMonth: number;
  /** 连续记录天数（从今天往回数，今天没记就从昨天开始数） */
  streak: number;
  /** 近 26 周（182 天）每天一条的数量，供热力图用 */
  heat: { day: string; count: number; ts: number }[];
  /** 来源分布，按条数排 */
  sources: { label: string; color: string; count: number }[];
  firstAt: number | null;
}

export function computeStats(entries: Entry[]): Stats {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisMonth = entries.filter((e) => e.createdAt >= startOfMonth).length;

  // 每天计数
  const perDay = new Map<string, number>();
  entries.forEach((e) => {
    const k = dayKey(e.createdAt);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  });

  // 连续天数：今天没记也可能只是还没写，所以允许从昨天起算
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!perDay.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (perDay.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 热力图：以「本周日」为最后一列，往前 26 列，每列 7 天
  const heat: { day: string; count: number; ts: number }[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const total = 26 * 7;
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    heat.push({ day: k, count: perDay.get(k) ?? 0, ts: d.getTime() });
  }

  const byPlatform = new Map<EntryPlatform, number>();
  entries.forEach((e) => byPlatform.set(e.platform, (byPlatform.get(e.platform) ?? 0) + 1));
  const sources = [...byPlatform.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p, count]) => ({ label: lookOf(p).label, color: lookOf(p).color, count }));

  const firstAt = entries.length ? Math.min(...entries.map((e) => e.createdAt)) : null;

  return { total: entries.length, thisMonth, streak, heat, sources, firstAt };
}

/* ------------------------------------------------------------------ */
/* 布局偏好（本地记住，和 flomoplus 一样「上次用哪种就还是哪种」）        */
/* ------------------------------------------------------------------ */

export const LAYOUTS = ['list', 'timeline', 'grid', 'gallery'] as const;
export type Layout = (typeof LAYOUTS)[number];
export const LAYOUT_LABEL: Record<Layout, string> = {
  list: '列表',
  timeline: '时间线',
  grid: '网格',
  gallery: '画廊',
};

const LAYOUT_KEY = 'blueberry.insp.layout';

export function loadLayout(): Layout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (v && (LAYOUTS as readonly string[]).includes(v)) return v as Layout;
  } catch {
    /* 隐私模式下 localStorage 会抛，按住默认值走 */
  }
  return 'list';
}

export function saveLayout(v: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, v);
  } catch {
    /* 存不住就算了，不影响这一屏 */
  }
}

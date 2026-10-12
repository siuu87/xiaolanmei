/**
 * 片单（WATCH）状态与持久化
 *
 * 独立于 bookStore。结构：一级分类（影视 / 动漫 / 演出）× 二级状态（准备看的 / 看完的）。
 *
 * 持久化（阶段 P2 数据单源化）：后端 /api/watchlist（watch_items 表）是单一事实来源，
 * 整体替换语义；localStorage 只留一份双写影子供回退。首次加载把本地已有的条目
 * 合并推上后端（本地优先），之后增删改都写穿后端。
 */
import { create } from 'zustand';
import { getWatchlist, putWatchlist } from '@/lib/api/watchlist';

/** 一级分类 */
export type WatchCategory = 'movie' | 'anime' | 'show';
/**
 * 二级状态：准备看的 / 看完的
 *
 * 2026-10-12 变更：原第二档是「没看的」，改为「看完的」——
 * 用户真正想记的是"想看"和"看过了"两件事。
 * 旧数据里的 'unwatched' 会在 read() 里迁移成 'watched'，不会静默丢失。
 */
export type WatchStatus = 'planned' | 'watched';

export interface WatchItem {
  id: string;
  title: string;
  category: WatchCategory;
  status: WatchStatus;
  /** 海报图：data URL 或图片链接 */
  poster?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  /** 来源：手动录入 / AI 对话整理 */
  source: 'manual' | 'ai';
}

export const CATEGORIES: { key: WatchCategory; label: string; hint: string }[] = [
  { key: 'movie', label: '影视', hint: '电影 · 电视剧' },
  { key: 'anime', label: '动漫', hint: '动画电影 · 番剧' },
  { key: 'show', label: '演出', hint: '音乐剧 · 舞台剧 · 演唱会' },
];

export const STATUSES: { key: WatchStatus; label: string }[] = [
  { key: 'planned', label: '准备看的' },
  { key: 'watched', label: '看完的' },
];

/** 无海报时的色块：电视机和片单页共用同一套，保证风格一致 */
const POSTER_TINTS: [string, string][] = [
  ['#2f5d50', '#14302a'],
  ['#2f3e63', '#161f33'],
  ['#7a2e3a', '#3a151b'],
  ['#6b4a2f', '#33220f'],
  ['#3f6f6b', '#1b3532'],
  ['#5b3a6e', '#2a1834'],
  ['#3e5a7a', '#1b2938'],
  ['#9f3b3b', '#4a1a1a'],
];

/** 按标题稳定取一个色块（中文标题也分布均匀） */
export function tintOf(title: string): [string, string] {
  let h = 0;
  for (let i = 0; i < title.length; i += 1) h = (h + title.charCodeAt(i) * (i + 7)) % 9973;
  return POSTER_TINTS[h % POSTER_TINTS.length];
}

/** AI 归类规则文案（供 prompt 与界面提示复用） */
export const CLASSIFY_RULE =
  '电影、电视剧归为「影视」；动画电影、番剧归为「动漫」；音乐剧、舞台剧、演唱会等现场表演归为「演出」。';

const STORAGE_KEY = 'blueberry.watchlist.v1';

interface WatchState {
  items: WatchItem[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (input: Omit<WatchItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  update: (id: string, patch: Partial<Omit<WatchItem, 'id'>>) => void;
  remove: (id: string) => void;
}

/** 旧状态值 → 新状态值。'unwatched'（没看的）在改版后对应「看完的」这一档 */
const LEGACY_STATUS: Record<string, WatchStatus> = { unwatched: 'watched' };

function read(): WatchItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // 防御式清洗：字段不对的条目直接丢弃；旧状态值先迁移再校验，避免整条被丢掉
    const migrated = data.map((x) =>
      x && typeof x === 'object' && LEGACY_STATUS[x.status] ? { ...x, status: LEGACY_STATUS[x.status] } : x,
    );
    return migrated.filter(
      (x): x is WatchItem =>
        !!x &&
        typeof x.id === 'string' &&
        typeof x.title === 'string' &&
        CATEGORIES.some((c) => c.key === x.category) &&
        STATUSES.some((s) => s.key === x.status),
    );
  } catch {
    return [];
  }
}

/**
 * localStorage 影子写（双写期的回退源）。
 * 后端 /api/watchlist 已是单一事实来源；这份本地副本供后端不可用或回滚时复原。
 */
function persist(items: WatchItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* 忽略隐私模式 / 配额不足 */
  }
}

/** 防抖写穿后端（整体替换），失败不阻塞界面 */
let putTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePut(items: WatchItem[]) {
  if (putTimer) clearTimeout(putTimer);
  putTimer = setTimeout(() => {
    putTimer = undefined;
    void putWatchlist(items).catch(() => {});
  }, 300);
}

function uid(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useWatchListStore = create<WatchState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    // 1) 本地先上屏，界面不等网络
    set({ items: read(), loaded: true });
    // 2) 拉后端全量，按 id 合并：本地（含刚加的）优先，远端补洞
    try {
      const remote = await getWatchlist();
      const cur = get().items;
      const byId = new Map(remote.items.map((i) => [i.id, i]));
      for (const it of cur) byId.set(it.id, it); // 本地优先
      const merged = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
      set({ items: merged });
      // 3) 本地有后端没有的（首次迁移 / 后端曾不可用）→ 自愈推上去
      if (merged.length !== remote.items.length) {
        void putWatchlist(merged).catch(() => {});
      }
    } catch {
      /* 后端不可用：保留本地数据，双写影子即回退源 */
    }
  },

  add: (input) => {
    const now = Date.now();
    const item: WatchItem = { ...input, id: uid(), createdAt: now, updatedAt: now };
    set((s) => {
      const next = [item, ...s.items];
      persist(next);
      schedulePut(next);
      return { items: next };
    });
    return item.id;
  },

  update: (id, patch) => {
    set((s) => {
      const next = s.items.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x));
      persist(next);
      schedulePut(next);
      return { items: next };
    });
  },

  remove: (id) => {
    set((s) => {
      const next = s.items.filter((x) => x.id !== id);
      persist(next);
      schedulePut(next);
      return { items: next };
    });
  },
}));

/** 按分类 + 状态取条目 */
export function selectItems(items: WatchItem[], category: WatchCategory, status: WatchStatus): WatchItem[] {
  return items
    .filter((x) => x.category === category && x.status === status)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 每个分类下的条目数（用于频道按钮角标） */
export function countByCategory(items: WatchItem[]): Record<WatchCategory, number> {
  const base: Record<WatchCategory, number> = { movie: 0, anime: 0, show: 0 };
  for (const x of items) if (x.category in base) base[x.category] += 1;
  return base;
}

/** 把 AI 返回的任意文本归一为合法分类；无法判断时回落到「影视」 */
export function normalizeCategory(v: unknown): WatchCategory {
  const s = String(v ?? '').trim().toLowerCase();
  if (['anime', '动画', '动漫', '番剧', '动画电影'].some((k) => s.includes(k))) return 'anime';
  if (['show', '演出', '音乐剧', '舞台剧', '演唱会', 'live', '现场'].some((k) => s.includes(k))) return 'show';
  return 'movie';
}

/** 否定说法：一律算「准备看的」，且要抢在「看过」这类词前面判断，否则「还没看过」会被误判成看完的 */
const NEGATIVE_RE = /没看|还没|还没看|未看|没刷|没追|没补|不打算|待看|待补/;
/** 「看完的」说法：看了 / 看完 / 刷完 / 二刷 / 重温…… */
const WATCHED_KEYS = [
  'watched',
  '看完',
  '看了',
  '看完了',
  '看过',
  '看过了',
  '已看',
  '刚看',
  '重看',
  '重温',
  '刷完',
  '追完',
  '补完',
  '二刷',
  '三刷',
];

/** 归一为合法状态；无法判断时回落「准备看的」 */
export function normalizeStatus(v: unknown): WatchStatus {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 'planned';
  if (NEGATIVE_RE.test(s)) return 'planned';
  if (WATCHED_KEYS.some((k) => s.includes(k))) return 'watched';
  return 'planned';
}

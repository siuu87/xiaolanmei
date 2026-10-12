/**
 * 心情 · 全站统一的一份定义
 *
 * 之前心情有两套：首页 MOOD 卡片用的是弧线图标（低落/平静/愉悦），
 * 日历里用的是五张 emoji（开心/平静/难过/生气/幸福）——两套互不相通，
 * 首页选了心情，日历上一点反应都没有。
 *
 * 现在收敛成一份：**只有三种心情**，图案统一用首页 MOOD 那套弧线：
 *   高兴 = 上扬的弧线（黄）、平静 = 一条水平线（绿）、难过 = 下弯的弧线（蓝）。
 *
 * 按天存「我」和「AI」两份，首页卡片负责写，日历负责读（只读展示 + 日期格上的颜色点）。
 */
import { create } from 'zustand';

export type MoodKey = 'happy' | 'calm' | 'sad';

export interface MoodDef {
  key: MoodKey;
  label: string;
  color: string;
  /** 弧线路径（viewBox 32×32）：上扬=高兴，水平=平静，下弯=难过 */
  path: string;
}

/**
 * 三种心情的取色刻意避开了日历上「强调日期」用的那几支颜色，免得看混：
 *   纪念日=琥珀 #FBBF24、放假日=薄荷绿 #34D399、节日节气=天蓝 #38BDF8、经期=玫瑰红。
 * 所以高兴用正黄、平静用草绿、难过用深蓝——色相拉开，深浅也拉开。
 */
export const MOODS: MoodDef[] = [
  { key: 'happy', label: '高兴', color: '#FFD60A', path: 'M9 12.5 Q16 20.5 23 12.5' },
  { key: 'calm', label: '平静', color: '#22C55E', path: 'M9 16 H23' },
  { key: 'sad', label: '难过', color: '#1D4ED8', path: 'M9 15.5 Q16 7.5 23 15.5' },
];

export function moodInfo(k?: MoodKey | null): MoodDef | undefined {
  return k ? MOODS.find((m) => m.key === k) : undefined;
}

export function moodColor(k?: MoodKey | null): string | undefined {
  return moodInfo(k)?.color;
}

export function isMoodKey(v: unknown): v is MoodKey {
  return typeof v === 'string' && MOODS.some((m) => m.key === v);
}

/** 一天里两个人的心情 */
export interface DayMood {
  me?: MoodKey;
  ai?: MoodKey;
}

/** 日期 key：非补零 YYYY-M-D（与日历选中日、日记的 key 一致） */
export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function todayKey(): string {
  return dateKeyOf(new Date());
}

/** 补零 ISO（yyyy-mm-dd）→ 非补零 key，日历里那天用得上 */
export function isoToKey(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}-${m}-${d}`;
}

const KEY = 'blueberry.mood.v1';
/** 旧的首页心情（home.mood.v1，只有今天的单条）→ 首次加载时迁过来 */
const LEGACY_KEY = 'home.mood.v1';
const LEGACY_MAP: Record<string, MoodKey> = { up: 'happy', flat: 'calm', down: 'sad' };

function read(): Record<string, DayMood> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Record<string, DayMood>;
      if (d && typeof d === 'object') {
        // 防御式清洗：key 不对、心情值不在三种之内的一律丢掉
        const out: Record<string, DayMood> = {};
        for (const [k, v] of Object.entries(d)) {
          if (!v || typeof v !== 'object') continue;
          const day: DayMood = {};
          if (isMoodKey(v.me)) day.me = v.me;
          if (isMoodKey(v.ai)) day.ai = v.ai;
          if (day.me || day.ai) out[k] = day;
        }
        return out;
      }
    }
  } catch {
    /* 数据坏了就当没有 */
  }
  return migrateLegacy();
}

/** 旧格式只有「今天的我」，迁过来后删掉旧键，避免两套数据打架 */
function migrateLegacy(): Record<string, DayMood> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw) as { date?: string; mood?: string };
    const mapped = d?.mood ? LEGACY_MAP[d.mood] : undefined;
    localStorage.removeItem(LEGACY_KEY);
    if (!mapped || !d.date) return {};
    const out = { [d.date]: { me: mapped } };
    localStorage.setItem(KEY, JSON.stringify(out));
    return out;
  } catch {
    return {};
  }
}

function write(days: Record<string, DayMood>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(days));
  } catch {
    /* 隐私模式 / 配额不足 */
  }
}

interface MoodState {
  days: Record<string, DayMood>;
  loaded: boolean;
  load: () => void;
  /** 设置某天某人（我 / AI）的心情；传 null 表示清空 */
  setMood: (dateKey: string, who: 'me' | 'ai', mood: MoodKey | null) => void;
}

export const useMoodStore = create<MoodState>((set, get) => ({
  days: {},
  loaded: false,

  load: () => {
    if (get().loaded) return;
    set({ days: read(), loaded: true });
  },

  setMood: (dateKey, who, mood) => {
    set((s) => {
      // 后台（如 AI 心情抓取）可能比界面更早写；没 load 过就先读一次盘，避免把别的日期冲掉
      const base = s.loaded ? s.days : read();
      const cur = base[dateKey] ?? {};
      const next: DayMood = { ...cur };
      if (mood) next[who] = mood;
      else delete next[who];
      const days = { ...base };
      if (!next.me && !next.ai) delete days[dateKey];
      else days[dateKey] = next;
      write(days);
      return { days };
    });
  },
}));

/** 非 Hook 场景（如聊天里）直接取一天的心情 */
export function getDayMood(dateKey: string): DayMood {
  return useMoodStore.getState().days[dateKey] ?? {};
}

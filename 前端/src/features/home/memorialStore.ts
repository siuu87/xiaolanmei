import { create } from 'zustand';
import { listMemorials, createMemorial, patchMemorial, deleteMemorial } from '@/lib/api/home';
import { newId } from '@/lib/id';
import { diffDays, todayISODate } from './periodStore';

/** 重复频率：none=不重复，year=每年，month=每月，day=每日 */
export type Repeat = 'none' | 'year' | 'month' | 'day';

export const REPEAT_OPTIONS: { key: Repeat; label: string }[] = [
  { key: 'none', label: '不重复' },
  { key: 'year', label: '每年' },
  { key: 'month', label: '每月' },
  { key: 'day', label: '每日' },
];

/** 一条纪念日/倒数日 */
export interface MemorialDay {
  id: string;
  title: string; // 事件名称
  date: string; // 目标日 ISO YYYY-MM-DD
  repeat: Repeat; // 重复频率
  pinned: boolean; // 置顶
}

export type DayStatusKind = 'future' | 'today' | 'past';

export interface DayStatus {
  kind: DayStatusKind; // future=还有，today=就是今天，past=已经
  count: number; // 天数（非负）
}

/** 距离状态：不重复——未来倒数/过去正数；重复——数到下一次发生 */
export function dayStatus(day: MemorialDay, today: string = todayISODate()): DayStatus {
  const [, m, d] = day.date.split('-').map(Number);
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const td = Number(today.slice(8, 10));
  const todayDate = new Date(ty, tm - 1, td);

  if (day.repeat === 'none') {
    const diff = diffDays(today, day.date);
    if (diff > 0) return { kind: 'future', count: diff };
    if (diff === 0) return { kind: 'today', count: 0 };
    return { kind: 'past', count: -diff };
  }

  if (day.repeat === 'day') return { kind: 'today', count: 0 };

  // year / month：数到下一次发生
  let cand: Date;
  if (day.repeat === 'year') {
    cand = new Date(ty, m - 1, d);
    if (cand < todayDate) cand = new Date(ty + 1, m - 1, d);
  } else {
    cand = new Date(ty, tm - 1, d);
    if (cand < todayDate) cand = new Date(ty, tm, d);
  }
  const diff = Math.round((cand.getTime() - todayDate.getTime()) / 86_400_000);
  if (diff === 0) return { kind: 'today', count: 0 };
  return { kind: 'future', count: diff };
}

/** 一句话文案 */
export function statusLabel(status: DayStatus): string {
  switch (status.kind) {
    case 'future':
      return `还有 ${status.count} 天`;
    case 'today':
      return '就是今天';
    case 'past':
      return `已经 ${status.count} 天`;
  }
}

/** 展示日期（含重复前缀） */
export function formatMemorialDate(day: MemorialDay): string {
  const [y, m, d] = day.date.split('-').map(Number);
  switch (day.repeat) {
    case 'none':
      return `${y}年${m}月${d}日`;
    case 'year':
      return `每年${m}月${d}日`;
    case 'month':
      return `每月${d}日`;
    case 'day':
      return '每天';
  }
}

/** 某年月日（month1 为 1-based）是否落在某条纪念日上 */
export function memorialOnDate(
  days: MemorialDay[],
  year: number,
  month1: number,
  day: number,
): MemorialDay | null {
  for (const d of days) {
    const [y, m, dd] = d.date.split('-').map(Number);
    let hit = false;
    switch (d.repeat) {
      case 'none':
        hit = y === year && m === month1 && dd === day;
        break;
      case 'year':
        hit = m === month1 && dd === day;
        break;
      case 'month':
        hit = dd === day;
        break;
      case 'day':
        hit = true;
        break;
    }
    if (hit) return d;
  }
  return null;
}

interface MemorialState {
  days: MemorialDay[];
  loaded: boolean;
  load: () => Promise<void>;
  addDay: (day: Omit<MemorialDay, 'id'>) => void;
  updateDay: (id: string, patch: Partial<Omit<MemorialDay, 'id'>>) => void;
  removeDay: (id: string) => void;
}

/** 纪念日 store：本地乐观更新 + 写穿后端（memorials 表）。 */
export const useMemorialStore = create<MemorialState>((set) => ({
  days: [],
  loaded: false,

  load: async () => {
    try {
      set({ days: await listMemorials(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addDay: (day) => {
    const m: MemorialDay = { ...day, id: newId() };
    set((s) => ({ days: [...s.days, m] }));
    void createMemorial(m).catch(() => {});
  },

  updateDay: (id, patch) => {
    set((s) => ({ days: s.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
    void patchMemorial(id, patch).catch(() => {});
  },

  removeDay: (id) => {
    set((s) => ({ days: s.days.filter((d) => d.id !== id) }));
    void deleteMemorial(id).catch(() => {});
  },
}));

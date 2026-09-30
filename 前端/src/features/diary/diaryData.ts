export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  author: 'me' | 'partner';
  content: string;
}

// 作者展示：我是主题色，对方是暖粉
export const AUTHOR_LABEL: Record<DiaryEntry['author'], string> = {
  me: '我',
  partner: 'TA',
};

export const AUTHOR_CLASS: Record<DiaryEntry['author'], string> = {
  me: 'text-primary',
  partner: 'text-rose-400',
};

/** 与日历的 dayKey（YYYY-M-D）比较用 */
export function diaryDayKey(e: DiaryEntry): string {
  const [y, m, d] = e.date.split('-').map(Number);
  return `${y}-${m}-${d}`;
}

/** 把日历的 dayKey（YYYY-M-D）转回 YYYY-MM-DD */
export function dayKeyToDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

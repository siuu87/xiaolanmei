export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  author: 'me' | 'partner';
  content: string;
  bookId?: string; // 归属日记本；空 = 我的日记（历史数据）
}

export interface DiaryBook {
  id: string;
  name: string;
  kind: 'me' | 'partner' | 'couple';
  cover: string; // 封面主色
  sortOrder: number;
}

/** 日记本类型：我的日记 / TA 的日记 / 情侣日记 */
export const BOOK_KIND_LABEL: Record<DiaryBook['kind'], string> = {
  me: '我的日记',
  partner: 'TA 的日记',
  couple: '情侣日记',
};

/** 日记本类型 → 默认封面色 */
export const KIND_DEFAULT_COVER: Record<DiaryBook['kind'], string> = {
  me: '#7c5cff',
  partner: '#f472b6',
  couple: '#ffb347',
};

/** 可选封面色板（新建 / 换封面） */
export const COVER_PALETTE = [
  '#7c5cff', '#f472b6', '#ffb347', '#34d399',
  '#38bdf8', '#fb7185', '#a78bfa', '#94a3b8',
];

/** 按 kind 推断默认归属本：me→我的日记，partner→TA 的日记 */
export function defaultBookFor(kind: DiaryBook['kind'], books: DiaryBook[]): string {
  if (kind === 'couple') return books.find((b) => b.kind === 'couple')?.id ?? '';
  return books.find((b) => b.kind === kind)?.id ?? '';
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

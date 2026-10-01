/** 归属方：me 我记 TA / partner TA 记我 */
export type OwnerSide = 'me' | 'partner';

/** 展示用分类定义（6 类，无「其他」；general 仅作为后端兜底） */
export const MEMO_CATEGORIES = [
  { key: 'preference', label: '忌口与喜好', emoji: '🍑', color: '#f97316' },
  { key: 'agreement', label: '约定', emoji: '🤝', color: '#8b5cf6' },
  { key: 'plan', label: '计划', emoji: '📅', color: '#3b82f6' },
  { key: 'experience', label: '经历', emoji: '⭐', color: '#eab308' },
  { key: 'info', label: '信息', emoji: '💡', color: '#06b6d4' },
  { key: 'inspiration', label: '灵感', emoji: '✨', color: '#ec4899' },
] as const;

export type MemoCategory = (typeof MEMO_CATEGORIES)[number];

export const getCategoryMeta = (key: string): MemoCategory =>
  MEMO_CATEGORIES.find((c) => c.key === key) ?? MEMO_CATEGORIES[0];

/** 相对时间：刚刚 / n 分钟前 / n 小时前 / n 天前 / 具体日期 */
export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

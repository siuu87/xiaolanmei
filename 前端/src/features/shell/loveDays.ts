/** 恋爱起点（用户指定：2018.10.13）。抽屉与聊天顶栏共用同一份算法 */
export const LOVE_START = { y: 2018, m: 10, d: 13 };

/** 距恋爱起点的天数（按本地日期算，避免时区把日期算偏一天） */
export function loveDays(from: Date = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(LOVE_START.y, LOVE_START.m - 1, LOVE_START.d).getTime();
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/**
 * 经期周期纯函数库（与 store 解耦）：
 * 日期工具 + 平均周期 / 下次预测 + 「上次经期 X 天前 · 平均周期 Y 天」摘要。
 * 前端（日历 / 设置 / 首页）与后端提示共用同一套规则，避免口径不一致。
 */

export interface CycleRecord {
  days: string[]; // 升序 ISO 日期，第 1 天 = days[0]
}

export interface CycleSettings {
  periodDays: number; // 经期持续天数（默认）
  cycleDays: number; // 月经周期天数
  regular: boolean; // 规律 / 不规律
}

/** 组装 ISO 日期 YYYY-MM-DD（month 为 1-based） */
export function toISODate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** 今天的 ISO 日期 YYYY-MM-DD */
export function todayISODate(): string {
  const n = new Date();
  return toISODate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** ISO 日期 + n 天 */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return toISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** b - a 的天数差 */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000,
  );
}

/** 最近一次经期的第 1 天；无记录返回 null */
export function lastPeriodStart(records: CycleRecord[]): string | null {
  const sorted = [...records].sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));
  return sorted.length ? sorted[sorted.length - 1].days[0] : null;
}

/** 上次经期第 1 天距今多少天；无记录返回 null */
export function daysSinceLastPeriod(
  records: CycleRecord[],
  today: string = todayISODate(),
): number | null {
  const last = lastPeriodStart(records);
  return last ? diffDays(last, today) : null;
}

/** 相邻记录第 1 天差值的均值；不足 2 条返回 null */
export function averageCycle(records: CycleRecord[]): number | null {
  const sorted = [...records].sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));
  if (sorted.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(diffDays(sorted[i - 1].days[0], sorted[i].days[0]));
  }
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

/** 当前生效的平均周期：规律→设置值；不规律→历史均值（回退设置值） */
export function avgCycleDays(
  records: CycleRecord[],
  settings: CycleSettings,
): number | null {
  if (!records.length) return null;
  return settings.regular ? settings.cycleDays : (averageCycle(records) ?? settings.cycleDays);
}

/** 预测下一次经期开始日（ISO）；无记录返回 null */
export function predictNextPeriod(
  records: CycleRecord[],
  settings: CycleSettings,
): string | null {
  const last = lastPeriodStart(records);
  if (!last) return null;
  const cycle = settings.regular ? settings.cycleDays : (averageCycle(records) ?? settings.cycleDays);
  return addDays(last, cycle);
}

/** 某 ISO 日期是否落在预测经期内（含首日，不含首日 + periodDays） */
export function isPredictedDay(
  iso: string,
  nextStart: string | null,
  periodDays: number,
): boolean {
  if (!nextStart) return false;
  return iso >= nextStart && iso < addDays(nextStart, periodDays);
}

/** 「上次经期 X 天前 · 平均周期 Y 天」摘要；无记录返回 null */
export function periodSummary(
  records: CycleRecord[],
  settings: CycleSettings,
  today: string = todayISODate(),
): string | null {
  const ago = daysSinceLastPeriod(records, today);
  if (ago === null) return null;
  const cycle = avgCycleDays(records, settings);
  return cycle != null ? `上次经期 ${ago} 天前 · 平均周期 ${cycle} 天` : `上次经期 ${ago} 天前`;
}

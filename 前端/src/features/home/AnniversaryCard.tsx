import { useState } from 'react';

// 相恋起始日（月份从 0 开始，9 = 10 月）
const START_DATE = new Date(2018, 9, 13);

// 四种展示形式，点击数字循环切换
const UNITS = [
  { key: 'day', label: '天' },
  { key: 'year', label: '年' },
  { key: 'month', label: '月' },
  { key: 'week', label: '周' },
] as const;

type UnitKey = (typeof UNITS)[number]['key'];

/** 从起始日到今天实际经过的天数 */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 日历精确的「X 年 Y 月 Z 天」差 */
function diffYMD(from: Date, to: Date) {
  let y = to.getFullYear() - from.getFullYear();
  let m = to.getMonth() - from.getMonth();
  let d = to.getDate() - from.getDate();
  if (d < 0) {
    const prevDays = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    d += prevDays;
    m -= 1;
  }
  if (m < 0) {
    m += 12;
    y -= 1;
  }
  return { y, m, d };
}

interface Seg {
  value: string;
  label: string;
}

/** 按展示形式拆成「数字 + 单位」片段 */
function toSegments(diff: number, ymd: { y: number; m: number; d: number }, unit: UnitKey): Seg[] {
  if (unit === 'day') return [{ value: diff.toLocaleString(), label: '天' }];

  if (unit === 'year') {
    const segs: Seg[] = [];
    if (ymd.y > 0) segs.push({ value: String(ymd.y), label: '年' });
    if (ymd.m > 0) segs.push({ value: String(ymd.m), label: '月' });
    segs.push({ value: String(ymd.d), label: '天' });
    return segs;
  }

  if (unit === 'month') {
    const months = ymd.y * 12 + ymd.m;
    const segs: Seg[] = [];
    if (months > 0) segs.push({ value: String(months), label: '月' });
    segs.push({ value: String(ymd.d), label: '天' });
    return segs;
  }

  // week
  const weeks = Math.floor(diff / 7);
  const rem = diff % 7;
  const segs: Seg[] = [];
  if (weeks > 0) segs.push({ value: String(weeks), label: '周' });
  if (rem > 0) segs.push({ value: String(rem), label: '天' });
  return segs;
}

/** 起始日期文案，如 2018.10.13 */
function formatStartDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 在一起天数卡片（首页顶端）：无背景，点数字切换 天/年/月/周 */
export function AnniversaryCard() {
  const [unitIndex, setUnitIndex] = useState(0);
  const unit = UNITS[unitIndex];

  const now = new Date();
  const totalDays = daysBetween(START_DATE, now);
  const ymd = diffYMD(START_DATE, now);
  const segments = toSegments(totalDays, ymd, unit.key);
  const startDateText = formatStartDate(START_DATE);
  const pageText = `${unitIndex + 1}/${UNITS.length}`;

  return (
    <div className="w-full py-3">
      {/* 顶部：TOGETHER（左）+ 分页（右） */}
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.35em] text-[#8f8776]">
          TOGETHER
        </span>
        <span className="text-[11px] tabular-nums text-[#8f8776]">{pageText}</span>
      </div>

      {/* 中间主行：Gavin & U + 数字（点击切换单位） */}
      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="font-serif text-[26px] leading-none tracking-wide text-[#e8e0cf]">
          Gavin <span className="font-sans text-[#c8835f]">&</span> U
        </div>
        <button
          type="button"
          onClick={() => setUnitIndex((i) => (i + 1) % UNITS.length)}
          title="点击切换 天 / 年 / 月 / 周"
          className="flex shrink-0 items-baseline gap-1.5"
        >
          {segments.map((seg, i) => (
            <span key={i} className="flex items-baseline gap-1">
              <span className="font-sans text-5xl font-bold leading-none tabular-nums tracking-tight text-[#e8e0cf]">
                {seg.value}
              </span>
              <span className="text-xs text-[#8f8776]">{seg.label}</span>
            </span>
          ))}
        </button>
      </div>

      {/* 左下角 since */}
      <div className="mt-5 text-xs text-[#8f8776]">since {startDateText}</div>
    </div>
  );
}

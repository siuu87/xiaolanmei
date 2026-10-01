import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { MemorialDay } from './memorialStore';

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

/** 解析 ISO 日期 YYYY-MM-DD 为本地 Date（避免 new Date(string) 按 UTC 解析产生时区偏移） */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 名字片段：首字母加粗，其余正常 */
function NamePart({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      <span className="font-bold">{text.charAt(0)}</span>
      <span>{text.slice(1)}</span>
    </>
  );
}

/**
 * 在一起天数卡片（首页顶端）：
 * - 左侧：两人的名字（点击进入编辑，回车保存、Esc 取消）+ since 起始日期；
 * - 右侧：至今多少天（点数字切换 天/年/月/周）。
 * 起始日期来自置顶纪念日 memorial.date；名字为组件内本地状态（未持久化）。
 */
export function AnniversaryCard({ memorial }: { memorial: MemorialDay }) {
  const [unitIndex, setUnitIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('Gavin & U');
  const [draft, setDraft] = useState('');

  const unit = UNITS[unitIndex];
  const startDate = parseISO(memorial.date);

  const now = new Date();
  const totalDays = daysBetween(startDate, now);
  const ymd = diffYMD(startDate, now);
  const segments = toSegments(totalDays, ymd, unit.key);
  const startDateText = formatStartDate(startDate);
  const pageText = `${unitIndex + 1}/${UNITS.length}`;

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };
  const confirmEdit = () => {
    if (draft.trim()) setName(draft.trim());
    setEditing(false);
  };
  const cancelEdit = () => setEditing(false);

  // 按 & 拆分双方名字（兼容全角 ＆），便于首字母加粗、中间 & 用无衬线
  const nameParts = name.split(/&|＆/);
  const leftName = (nameParts[0] ?? '').trim();
  const rightName = nameParts.slice(1).join('&').trim();

  return (
    <div className="flex w-full items-center justify-between gap-4 py-3">
      {/* 左：名字（可编辑）+ since */}
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={confirmEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            autoFocus
            maxLength={30}
            placeholder="xxx & xxx"
            className="w-full border-b-2 border-[#c8835f] bg-transparent font-serif text-[28px] leading-tight tracking-[0.08em] text-[#e8e0cf] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            title="点击编辑名字"
            className="group flex max-w-full items-baseline gap-1.5 text-left"
          >
            <span className="truncate font-serif text-[28px] leading-tight tracking-[0.08em] text-[#e8e0cf] transition group-hover:opacity-80">
              <NamePart text={leftName} />
              {nameParts.length > 1 && <span className="mx-0.5 font-sans text-[#c8835f]">&</span>}
              <NamePart text={rightName} />
            </span>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-[#8f8776] opacity-0 transition group-hover:opacity-100" />
          </button>
        )}
        <span className="text-xs text-[#8f8776]">since {startDateText}</span>
      </div>

      {/* 右：天数（点击切换单位）+ 分页 */}
      <button
        type="button"
        onClick={() => setUnitIndex((i) => (i + 1) % UNITS.length)}
        title="点击切换 天 / 年 / 月 / 周"
        className="flex shrink-0 select-none flex-col items-end"
      >
        <span className="flex items-baseline gap-1.5">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-baseline gap-1">
              <span className="font-sans text-5xl font-bold leading-none tabular-nums tracking-tight text-[#e8e0cf]">
                {seg.value}
              </span>
              <span className="text-xs text-[#8f8776]">{seg.label}</span>
            </span>
          ))}
        </span>
        <span className="mt-2 text-[11px] tabular-nums text-[#8f8776]">{pageText}</span>
      </button>
    </div>
  );
}

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const COLLAPSED_KEY = 'blueberry.calendar.collapsed';

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 某天的周几首字母（周一起始：M/T/W/T/F/S/S） */
function weekdayInitialOf(y: number, m: number, d: number): string {
  return WEEKDAYS[(new Date(y, m - 1, d).getDay() + 6) % 7][0];
}

/** 某天在日历上的标注（心情 / 经期 / 纪念日 / 节假日 / 日程） */
export interface CalendarDayDecoration {
  moodColors?: string[]; // 心情圆点颜色（我、TA）
  period?: 'solid' | 'predicted'; // 经期实心 / 预测虚环
  memorial?: boolean; // 纪念日金线
  holiday?: boolean; // 节假日绿线
  scheduleColors?: string[]; // 当日日程颜色（小方块，最多 3 个）
}

/** 展开态网格里的标注：金/绿线 + 心情圆点 + 日程小方块（固定三行，保证行对齐；经期已挪到数字上） */
function DayMarkers({ dec }: { dec?: CalendarDayDecoration }) {
  const moodColors = dec?.moodColors ?? [];
  const scheduleColors = (dec?.scheduleColors ?? []).slice(0, 3);
  return (
    <>
      <span className="flex h-1 flex-col items-center justify-center gap-px">
        {dec?.memorial && <span className="h-0.5 w-6 rounded-full bg-amber-400" />}
        {dec?.holiday && <span className="h-0.5 w-6 rounded-full bg-emerald-400" />}
      </span>
      <span className="flex h-1.5 items-center gap-0.5">
        {moodColors.map((c, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
        ))}
      </span>
      <span className="flex h-1 items-center gap-px">
        {scheduleColors.map((c, i) => (
          <span key={i} className="h-1 w-1 rounded-[1px]" style={{ backgroundColor: c }} />
        ))}
      </span>
    </>
  );
}

/** 收起态胶囊里的标注：全部缩成小圆点（经期已挪到数字上）；日程用小块区分 */
function CompactDots({ dec }: { dec?: CalendarDayDecoration }) {
  return (
    <span className="flex h-1 items-center gap-0.5">
      {dec?.moodColors?.map((c, i) => (
        <span key={`m${i}`} className="h-1 w-1 rounded-full" style={{ backgroundColor: c }} />
      ))}
      {dec?.memorial && <span className="h-1 w-1 rounded-full bg-amber-400" />}
      {dec?.holiday && <span className="h-1 w-1 rounded-full bg-emerald-400" />}
      {(dec?.scheduleColors ?? []).slice(0, 3).map((c, i) => (
        <span key={`s${i}`} className="h-1 w-1 rounded-[1px]" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

/**
 * 折叠日历（无外壳卡片，由外层提供底色/圆角/阴影，便于与下方详情「相接」）：
 * - 展开态 = 完整月视图网格（周一起始，衬线英文，日期下带标注）；
 * - 收起态 = 连续跨月的横向日期胶囊：当月正常色、上/下月灰色，点灰色跳到那月；
 * - 「back to today」回到今天并选中；
 * - 收起/展开把手在底部；状态记忆上次（localStorage）。
 */
export function CollapsibleCalendar({
  value,
  onChange,
  dayDecoration,
  onCollapsedChange,
}: {
  value: string | null; // yyyy-mm-dd（选中日期）
  onChange: (date: string) => void;
  dayDecoration?: (date: string) => CalendarDayDecoration | undefined;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const today = new Date();
  const todayKey = toKey(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const [view, setView] = useState(() => {
    if (value) return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    onCollapsedChange?.(next);
  };

  // 收起时把今天/选中日期滚到可见处
  useEffect(() => {
    if (!collapsed) return;
    const target = value || todayKey;
    document
      .getElementById(`cal-pill-${target}`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [collapsed, value, todayKey]);

  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay(); // 0=Sun
  const mondayFirst = (firstWeekday + 6) % 7; // 周一起始

  const goPrevMonth = () =>
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  const goNextMonth = () =>
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));

  // 回到今天并选中
  const goToday = () => {
    setView({ year: today.getFullYear(), month: today.getMonth() + 1 });
    onChange(todayKey);
    setTimeout(() => {
      document.getElementById(`cal-pill-${todayKey}`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, 0);
  };

  const monthLabel = `${MONTHS[view.month - 1]} ${view.year}`;

  // 展开态：当月网格
  const cells: (number | null)[] = [];
  for (let i = 0; i < mondayFirst; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // 收起态：连续跨月日期串（上月1号 ~ 下月最后一天）
  const strip: { y: number; m: number; d: number; isMonthStart: boolean }[] = [];
  {
    const start = new Date(view.year, view.month - 2, 1);
    const end = new Date(view.year, view.month + 1, 0);
    const cursor = new Date(start);
    while (cursor <= end) {
      strip.push({
        y: cursor.getFullYear(),
        m: cursor.getMonth() + 1,
        d: cursor.getDate(),
        isMonthStart: cursor.getDate() === 1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return (
    <div>
      {/* 头部：◀ 月份 ▶ 分列最上行两端，back to today 居中在其下 */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="上个月"
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-[#22304a]',
              collapsed && 'invisible',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? '展开整月' : '收起日历'}
            className="min-w-0 flex-1 truncate text-center font-serif text-lg font-medium tracking-wide text-[#e2e8f0] transition hover:text-white"
          >
            {monthLabel}
          </button>
          <button
            type="button"
            onClick={goNextMonth}
            aria-label="下个月"
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-primary transition hover:bg-[#22304a]',
              collapsed && 'invisible',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-0.5 flex justify-center">
          <button
            type="button"
            onClick={goToday}
            className="font-serif text-xs text-primary transition hover:underline"
          >
            back to today
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="px-4 pt-3">
        {collapsed ? (
          <div className="flex items-center gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {strip.map(({ y, m, d, isMonthStart }) => {
              const ds = toKey(y, m, d);
              const selected = value === ds;
              const isCurrent = m === view.month;
              const isToday = ds === todayKey;
              const dec = dayDecoration?.(ds);
              return (
                <Fragment key={ds}>
                  {isMonthStart && (
                    <span className="shrink-0 font-serif text-[9px] uppercase tracking-wider text-[#64748b]">
                      {MONTHS[m - 1].slice(0, 3)}
                    </span>
                  )}
                  <button
                    type="button"
                    id={`cal-pill-${ds}`}
                    onClick={() => {
                      onChange(ds);
                      if (!isCurrent) setView({ year: y, month: m });
                    }}
                    aria-pressed={selected}
                    aria-label={ds}
                    className={cn(
                      'flex h-12 min-w-9 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-2 font-serif text-sm transition',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-[0_4px_10px_rgba(0,0,0,0.25)]'
                        : isCurrent
                          ? 'bg-[#1e293b] text-[#e2e8f0] shadow-[0_2px_6px_rgba(0,0,0,0.3)]'
                          : 'bg-[#151f33] text-[#5b6b85]',
                      isToday && !selected && 'ring-2 ring-primary/60',
                    )}
                  >
                    <span className="text-[8px] uppercase leading-none opacity-60">
                      {weekdayInitialOf(y, m, d)}
                    </span>
                    <span
                      className={cn(
                        'leading-none',
                        isToday && !selected && 'text-primary',
                        dec?.period === 'solid' && 'text-rose-400',
                        dec?.period === 'predicted' &&
                          'flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-rose-400',
                      )}
                    >
                      {d}
                    </span>
                    <CompactDots dec={dec} />
                  </button>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="py-1 text-center font-serif text-[10px] uppercase tracking-wide text-[#64748b]"
              >
                {w}
              </div>
            ))}
            {cells.map((d, i) => {
              if (d == null) return <div key={`e-${i}`} />;
              const ds = toKey(view.year, view.month, d);
              const selected = value === ds;
              const isToday = ds === todayKey;
              const dec = dayDecoration?.(ds);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange(ds)}
                  aria-pressed={selected}
                  aria-label={ds}
                  className="flex flex-col items-center gap-0.5 py-1"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full font-serif text-sm transition',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,0.25)]'
                        : dec?.period === 'solid'
                          ? 'text-rose-400'
                          : isToday
                            ? 'bg-primary/20 text-primary ring-2 ring-primary'
                            : 'text-[#e2e8f0] hover:bg-[#22304a]',
                      dec?.period === 'predicted' && 'ring-2 ring-rose-400',
                    )}
                  >
                    {d}
                  </span>
                  <DayMarkers dec={dec} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部收起/展开把手 */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? '展开日历' : '收起日历'}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-center py-2 text-primary transition hover:text-primary/80"
      >
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
    </div>
  );
}

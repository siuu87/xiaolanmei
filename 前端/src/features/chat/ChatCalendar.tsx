import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchActivity } from '@/lib/api/conversations';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 热力图配色（GitHub 绿系）：消息越多越深，0 条为灰。 */
function heatClass(count: number): string {
  if (count <= 0) return 'bg-muted/70 text-foreground/40';
  if (count === 1) return 'bg-[#9be9a8] text-foreground/80';
  if (count <= 3) return 'bg-[#40c463] text-white';
  if (count <= 6) return 'bg-[#30a14e] text-white';
  return 'bg-[#216e39] text-white';
}

/**
 * 聊天活跃度日历（热力图）：
 * - 某天有聊天则按条数着色，点某天选中并回调；
 * - 可收起（只留月份标题）再展开；
 * - 支持横向滑动（触屏）切换月份。
 */
export function ChatCalendar({
  value,
  onChange,
}: {
  value: string | null; // yyyy-mm-dd
  onChange: (date: string | null) => void;
}) {
  const today = new Date();
  const [view, setView] = useState(() => {
    if (value) return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [activity, setActivity] = useState<Map<number, number>>(new Map());
  const [collapsed, setCollapsed] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    searchActivity(view.year, view.month)
      .then((res) => {
        if (!alive) return;
        const m = new Map<number, number>();
        for (const d of res.days) m.set(d.day, d.count);
        setActivity(m);
      })
      .catch((err) => console.error('加载活跃度失败', err));
    return () => {
      alive = false;
    };
  }, [view]);

  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const daysInMonth = new Date(view.year, view.month, 0).getDate();

  const prevMonth = () =>
    setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { year: v.year, month: v.month - 1 }));
  const nextMonth = () =>
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: v.month + 1 }));

  // 横向滑动切月：左滑 → 下月，右滑 → 上月
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return; // 阈值过滤误触/纵向滚动
    if (dx < 0) nextMonth();
    else prevMonth();
  };

  const selectedDay = value ? Number(value.slice(8, 10)) : null;
  const selectedInView =
    value != null &&
    Number(value.slice(0, 4)) === view.year &&
    Number(value.slice(5, 7)) === view.month;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const toggle = (day: number) => {
    const ds = `${view.year}-${String(view.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(value === ds ? null : ds);
  };

  return (
    <div
      className="rounded-xl bg-muted/40 p-3"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 月份切换 + 收起/展开 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="上个月"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开日历' : '收起日历'}
          className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-1"
        >
          <span className="truncate text-sm font-medium">
            {view.year}年{view.month}月
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="下个月"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <>
          {/* 星期 */}
          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-[10px] text-muted-foreground">
                {w}
              </div>
            ))}

            {/* 日期格子 */}
            {cells.map((d, i) => {
              if (d == null) return <div key={`e-${i}`} />;
              const isToday =
                d === today.getDate() && view.year === today.getFullYear() && view.month === today.getMonth() + 1;
              const isSelected = selectedInView && selectedDay === d;
              const count = activity.get(d) ?? 0;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
                  aria-label={`${view.year}-${view.month}-${d}`}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-md text-xs transition',
                    heatClass(count),
                    isSelected && 'ring-2 ring-primary ring-offset-1',
                    !isSelected && isToday && 'ring-1 ring-primary/40',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* 图例 */}
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span>少</span>
            <span className="h-3 w-3 rounded bg-muted/70" />
            <span className="h-3 w-3 rounded bg-[#9be9a8]" />
            <span className="h-3 w-3 rounded bg-[#40c463]" />
            <span className="h-3 w-3 rounded bg-[#30a14e]" />
            <span className="h-3 w-3 rounded bg-[#216e39]" />
            <span>多</span>
          </div>
        </>
      )}
    </div>
  );
}

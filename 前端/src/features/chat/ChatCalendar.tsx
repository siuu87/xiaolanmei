import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchActivity } from '@/lib/api/conversations';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 活跃度热力档位（暖调灰阶，不再用 GitHub 绿）。
 *
 * 特意做成「灰阶」而不是玫瑰色阶：参考图里被选中的那天是一颗实心玫瑰圆点，
 * 如果热力也用玫瑰色，选中态就会淹在深浅不一的粉里分不出来。
 * 四档全部走 chat token，深浅两套主题自动各调一版。
 */
function heatClass(count: number): string {
  if (count <= 0) return 'bg-chat-line/60 text-chat-meta';
  if (count === 1) return 'bg-chat-quote-line text-chat-ai-fg';
  if (count <= 3) return 'bg-chat-meta/60 text-white';
  if (count <= 6) return 'bg-chat-meta/80 text-white';
  return 'bg-chat-meta text-white';
}

/** 热力图色块（图例复用同一套 class） */
const HEAT_STEPS = ['bg-chat-line/60', 'bg-chat-quote-line', 'bg-chat-meta/60', 'bg-chat-meta/80', 'bg-chat-meta'];

/**
 * 聊天活跃度日历（热力图）：
 * - 某天有聊天则按条数着色，点某天选中并回调；
 * - 可收起（只留月份标题）再展开；
 * - 支持横向滑动（触屏）切换月份；
 * - 底部 Reset（清空日期）+ 玫瑰圆形 ✓（收起日历，保留已选日期）。
 */
export function ChatCalendar({
  value,
  onChange,
  onConfirm,
}: {
  value: string | null; // yyyy-mm-dd
  onChange: (date: string | null) => void;
  /** 点右下角 ✓ 时回调（一般是收起日历）。不传就不渲染那颗 ✓。 */
  onConfirm?: () => void;
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
      data-testid="chat-calendar"
      className="rounded-2xl bg-chat-pill p-3 shadow-sm"
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-chat-pill-fg transition hover:bg-chat-quote"
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
          <span className="truncate font-serif text-[15px] font-semibold text-foreground">
            {view.year}年{view.month}月
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-chat-meta" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-chat-meta" />
          )}
        </button>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="下个月"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-chat-pill-fg transition hover:bg-chat-quote"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <>
          {/* 星期 */}
          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-[10px] tracking-wide text-chat-meta">
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
                  data-selected={isSelected ? '1' : '0'}
                  aria-label={`${view.year}-${view.month}-${d}`}
                  className={cn(
                    'flex h-8 items-center justify-center text-xs transition',
                    // 选中 = 实心玫瑰圆点（参考图那天的样子），其余走热力灰阶
                    isSelected
                      ? 'rounded-full bg-chat-accent font-medium text-chat-accent-fg shadow-sm'
                      : cn('rounded-lg', heatClass(count)),
                    !isSelected && isToday && 'ring-1 ring-chat-accent/40',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* 图例 */}
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-chat-meta">
            <span>少</span>
            {HEAT_STEPS.map((c) => (
              <span key={c} className={cn('h-3 w-3 rounded', c)} />
            ))}
            <span>多</span>
          </div>

          {/* Reset + ✓（参考图底部那颗玫瑰圆钮） */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-full px-2 py-1 text-[13px] text-chat-ai-fg transition hover:bg-chat-quote"
            >
              Reset
            </button>
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                aria-label="确定"
                data-testid="calendar-confirm"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-chat-accent text-chat-accent-fg shadow-sm transition active:scale-95"
              >
                <Check className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

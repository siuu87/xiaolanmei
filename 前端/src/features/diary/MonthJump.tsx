import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DiaryEntry } from './diaryData';
import { daysInMonth, weekdayOf, ymKey } from './diaryData';

interface Props {
  entries: DiaryEntry[];
  today: string;
  /** 当前翻到的那天（月历上标一下） */
  current: string;
  onPick: (date: string) => void;
  onClose: () => void;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 月历跳页（2026-11-15 单页翻页本）：
 * 书是一天天往下翻的，翻几十页找旧日记太慢，所以顶栏放一个日历 ——
 * 点哪天就直接翻到那一页。整屏不透明，没有遮罩。
 */
export function MonthJump({ entries, today, current, onPick, onClose }: Props) {
  const [ym, setYm] = useState(() => current.slice(0, 7));

  const [y, m] = ym.split('-').map(Number);
  const lead = weekdayOf(`${ym}-01`);
  const total = daysInMonth(y, m);

  /** 这个月哪几天有记录 */
  const marked = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.date.startsWith(ym)) set.add(e.date);
    return set;
  }, [entries, ym]);

  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setYm(ymKey(d.getFullYear(), d.getMonth() + 1));
  };

  const toToday = () => {
    setYm(today.slice(0, 7));
  };

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex flex-col bg-page-bg" data-testid="diary-month-jump">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onClose} aria-label="关闭" className="icon-btn h-8 w-8">
          <X className="h-5 w-5" />
        </button>
        <span className="flex-1 text-center text-[13px] font-medium text-foreground">翻到哪一天</span>
        <button
          type="button"
          onClick={toToday}
          data-testid="diary-month-today"
          className="rounded-full bg-secondary px-3 py-1 text-[12px] font-medium text-foreground"
        >
          今天
        </button>
      </header>

      <div className="flex items-center justify-center gap-4 py-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="上个月"
          className="icon-btn h-8 w-8"
          data-testid="diary-month-prev"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[92px] text-center text-[15px] font-semibold tabular-nums text-foreground">
          {y}.{String(m).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="下个月"
          className="icon-btn h-8 w-8"
          data-testid="diary-month-next"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-3 pb-1">
        {WEEK.map((w) => (
          <span key={w} className="text-center text-[10px] text-muted-foreground">
            {w}
          </span>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 content-start gap-1 px-3">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const isToday = d === today;
          const isCurrent = d === current;
          const has = marked.has(d);
          const future = d > today;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              disabled={future}
              data-testid={`diary-month-day-${d}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-[13px] tabular-nums transition-colors ${
                future
                  ? 'text-foreground/20'
                  : isCurrent
                    ? 'bg-foreground font-semibold text-page-bg'
                    : 'text-foreground'
              }`}
            >
              {Number(d.slice(-2))}
              <span
                className={`mt-0.5 h-1 w-1 rounded-full ${
                  has ? (isCurrent ? 'bg-page-bg' : 'bg-foreground/55') : 'bg-transparent'
                }`}
              />
              {isToday && !isCurrent && (
                <span className="pointer-events-none absolute inset-0 rounded-lg ring-[1.5px] ring-inset ring-foreground/45" />
              )}
            </button>
          );
        })}
      </div>

      <p className="shrink-0 pb-6 pt-2 text-center text-[11px] text-muted-foreground">
        有记录的日子底下有一个小圆点
      </p>
    </div>,
    document.body,
  );
}

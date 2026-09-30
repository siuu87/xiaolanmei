import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useTimetableStore,
  coursesForDayWeek,
  WEEKDAY_LABELS,
  PERIODS,
  todayDay,
  type Course,
  type PeriodTime,
} from './timetableStore';

const PERIOD_H = 48; // 每节像素高度

/** 课程表（周次网格）：周一~周日 × 节次，顶部切周，点空白添加、点课程编辑 */
export function TimetableView({
  onCreate,
  onEdit,
}: {
  onCreate: (day: number, startPeriod: number) => void;
  onEdit: (c: Course) => void;
}) {
  const courses = useTimetableStore((s) => s.courses);
  const totalWeeks = useTimetableStore((s) => s.totalWeeks);
  const periodTimes = useTimetableStore((s) => s.periodTimes);
  const week = useTimetableStore((s) => s.currentWeek);
  const setWeek = useTimetableStore((s) => s.setCurrentWeek);
  const [timesOpen, setTimesOpen] = useState(false);
  const today = todayDay();

  const colClick = (day: number) => (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const period = Math.floor((e.clientY - rect.top) / PERIOD_H) + 1;
    onCreate(day, Math.max(1, Math.min(PERIODS, period)));
  };

  return (
    <div className="glass rounded-2xl p-3">
      {/* 周选择器 */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeek(Math.max(1, week - 1))}
          aria-label="上一周"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          第 {week} 周 <span className="text-xs text-muted-foreground">/ 共 {totalWeeks} 周</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTimesOpen(true)}
            aria-label="上下课时间"
            title="设置上下课时间"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Clock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeek(Math.min(totalWeeks, week + 1))}
            aria-label="下一周"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 表头：周一~周日 */}
      <div className="grid grid-cols-7 pl-14">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn('py-1 text-center text-xs', i + 1 === today ? 'font-medium text-primary' : 'text-muted-foreground')}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 节次 × 7 天网格 */}
      <div className="flex">
        {/* 节次栏（节次号 + 上课时间） */}
        <div className="w-14 shrink-0">
          {Array.from({ length: PERIODS }, (_, i) => {
            const start = periodTimes[i]?.start;
            return (
              <div
                key={i}
                className="flex flex-col items-end justify-center pr-1.5 text-muted-foreground"
                style={{ height: PERIOD_H }}
              >
                <span className="text-[10px] leading-none">{i + 1}</span>
                {start && <span className="text-[8px] leading-tight text-muted-foreground/70">{start}</span>}
              </div>
            );
          })}
        </div>

        <div className="grid flex-1 grid-cols-7">
          {WEEKDAY_LABELS.map((_, i) => {
            const day = i + 1;
            const items = coursesForDayWeek(courses, day, week);
            return (
              <div
                key={day}
                className={cn('relative cursor-pointer border-l border-muted/20', day === today && 'bg-primary/5')}
                style={{ height: PERIODS * PERIOD_H }}
                onClick={colClick(day)}
              >
                {Array.from({ length: PERIODS }, (_, pi) => (
                  <div
                    key={pi}
                    className="pointer-events-none absolute inset-x-0 border-t border-muted/30"
                    style={{ top: pi * PERIOD_H }}
                  />
                ))}
                {items.map((c) => (
                  <CourseBlock key={c.id} c={c} onEdit={onEdit} times={periodTimes} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {timesOpen && <PeriodTimesModal onClose={() => setTimesOpen(false)} />}
    </div>
  );
}

/** 上下课时间编辑器：12 节课各设起止时间，留空则不显示 */
function PeriodTimesModal({ onClose }: { onClose: () => void }) {
  const periodTimes = useTimetableStore((s) => s.periodTimes);
  const setPeriodTime = useTimetableStore((s) => s.setPeriodTime);
  const inputCls =
    'h-9 flex-1 rounded-lg border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">上下课时间</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">设置每节课的起止时间（留空则不显示），用于课程表的时间标注。</p>

        <div className="mt-3 space-y-1.5">
          {Array.from({ length: PERIODS }, (_, i) => {
            const t = periodTimes[i] ?? { start: '', end: '' };
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">第{i + 1}节</span>
                <input
                  type="time"
                  value={t.start}
                  onChange={(e) => setPeriodTime(i, { ...t, start: e.target.value })}
                  className={inputCls}
                />
                <span className="text-xs text-muted-foreground">—</span>
                <input
                  type="time"
                  value={t.end}
                  onChange={(e) => setPeriodTime(i, { ...t, end: e.target.value })}
                  className={inputCls}
                />
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          完成
        </button>
      </div>
    </div>
  );
}

/** 单门课程块：点击编辑 */
function CourseBlock({ c, onEdit, times }: { c: Course; onEdit: (c: Course) => void; times: PeriodTime[] }) {
  const top = (c.startPeriod - 1) * PERIOD_H;
  const height = Math.max(PERIOD_H, (c.endPeriod - c.startPeriod + 1) * PERIOD_H);
  const start = times[c.startPeriod - 1]?.start;
  const end = times[c.endPeriod - 1]?.end;
  const timeText = start && end ? `${start}–${end}` : '';
  const subtitle = [c.location, timeText].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit(c);
      }}
      className="absolute inset-x-0.5 z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-white shadow-sm"
      style={{ top, height, backgroundColor: c.color }}
    >
      <div className="truncate text-[11px] font-medium leading-tight">{c.name}</div>
      {subtitle && <div className="truncate text-[10px] leading-tight opacity-85">{subtitle}</div>}
    </button>
  );
}

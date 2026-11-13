import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Settings2,
} from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import {
  daysInMonth,
  hmNow,
  prettyTime,
  sortByTime,
  weekdayOf,
  ymKey,
} from './diaryData';

interface Props {
  book: DiaryBook;
  /** 这本的全部日记（已按 book 过滤） */
  entries: DiaryEntry[];
  today: string;
  onOpenDay: (date: string) => void;
  onCompose: (date: string) => void;
  onSwitchBook: () => void;
  onSettings: () => void;
  onBack: () => void;
  /** TA 的本只能夹纸条 */
  canWrite: boolean;
  onSlip: (date: string) => void;
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const MINT = '#3EC49A';

/**
 * 日记首页（2026-11-14 按 D·LOG 重做）：
 * 月历里每个格子直接是当天的照片，下面一行是「今天已记 / 本月记录」，
 * 再下面是当日卡（大字日期 + 三张缩略 + 最后记录时间），点哪都进当天页。
 *
 * 原来那套「书架 → 本子 → 翻页」的纸感界面留给情侣本，个人这两本走照片流水账。
 */
export function DlogHome({
  book,
  entries,
  today,
  onOpenDay,
  onCompose,
  onSwitchBook,
  onSettings,
  onBack,
  canWrite,
  onSlip,
}: Props) {
  const [ty, tm] = today.split('-').map(Number);
  const [cursor, setCursor] = useState({ y: ty, m: tm });
  const [selected, setSelected] = useState<string>(today);

  /** 按天归拢：一天可能有好几个「时刻」 */
  const byDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    return map;
  }, [entries]);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.date.startsWith(ymKey(cursor.y, cursor.m))),
    [entries, cursor],
  );
  const monthDays = new Set(monthEntries.map((e) => e.date)).size;
  const todayCount = (byDate.get(today) ?? []).length;

  const dayList = byDate.get(selected) ?? [];
  const lastTime = dayList.length ? dayList[dayList.length - 1].time : '';
  const thumbs = dayList.flatMap((e) => e.images ?? []).slice(0, 3);

  const firstWeekday = weekdayOf(`${ymKey(cursor.y, cursor.m)}-01`);
  const total = daysInMonth(cursor.y, cursor.m);
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: total },
      (_, i) => `${ymKey(cursor.y, cursor.m)}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const moveMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };

  const goToday = () => {
    setCursor({ y: ty, m: tm });
    setSelected(today);
    onOpenDay(today);
  };

  return (
    <div className="relative min-h-full bg-page-bg pb-24" data-testid="diary-dlog-home">
      <header className="sticky top-0 z-20 bg-page-bg/95 px-4 pb-2 pt-3 backdrop-blur-[2px]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} aria-label="返回" className="icon-btn h-8 w-8 shrink-0">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={onSwitchBook}
            data-testid="diary-book-switch"
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[13px] font-bold text-white"
              style={{ background: '#17181A' }}
            >
              D
            </span>
            <span className="truncate text-[15px] font-semibold text-foreground">{book.name}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
          <button type="button" aria-label="搜索" className="icon-btn h-8 w-8">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="日记设置"
            data-testid="diary-settings"
            className="icon-btn h-8 w-8"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* 月份 + Today */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="上个月"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground active:bg-black/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              data-testid="diary-month"
              className="text-[22px] font-bold tabular-nums tracking-tight text-foreground"
            >
              {cursor.y}.{String(cursor.m).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="下个月"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground active:bg-black/5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            data-testid="diary-today"
            className="rounded-full px-3 py-1 text-[12px] font-semibold text-white"
            style={{ background: MINT }}
          >
            Today
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 pb-1 text-center text-[11px] text-muted-foreground/70">
          {WEEK_CN.map((w, i) => (
            <span key={w} className={i === 0 ? 'text-rose-400/80' : i === 6 ? 'text-sky-400/80' : ''}>
              {w}
            </span>
          ))}
        </div>
      </header>

      <div className="px-4">
        {/* 月历：格子里就是照片 */}
        <div className="grid grid-cols-7 gap-1.5" data-testid="diary-calendar">
          {cells.map((iso, i) => {
            if (!iso) return <span key={`x-${i}`} className="aspect-square" />;
            const list = byDate.get(iso) ?? [];
            const cover = list.flatMap((e) => e.images ?? [])[0];
            const mood = list.find((e) => e.mood)?.mood;
            const isToday = iso === today;
            const isSel = iso === selected;
            const d = Number(iso.slice(-2));
            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  setSelected(iso);
                  onOpenDay(iso);
                }}
                data-testid={`diary-day-${iso}`}
                className="relative aspect-square overflow-hidden rounded-[9px]"
                style={{
                  background: cover ? undefined : 'hsl(var(--secondary))',
                  boxShadow: isSel
                    ? `0 0 0 2px ${MINT}`
                    : isToday
                      ? `inset 0 0 0 1.5px ${MINT}`
                      : undefined,
                }}
              >
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span
                    className={`absolute inset-0 flex items-center justify-center text-[12px] tabular-nums ${
                      list.length ? 'font-semibold text-foreground' : 'text-muted-foreground/70'
                    }`}
                  >
                    {d}
                  </span>
                )}
                {cover && (
                  <span className="absolute left-1 top-1 rounded-[4px] bg-black/32 px-1 text-[9px] font-semibold leading-[13px] tabular-nums text-white">
                    {d}
                  </span>
                )}
                {mood && (
                  <span className="absolute bottom-0.5 right-0.5 text-[10px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                    {mood}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 统计：今天 / 本月 */}
        <div className="mt-4 grid grid-cols-2 divide-x divide-page-line rounded-2xl bg-secondary/60 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] text-muted-foreground">今天已记</span>
            <span className="text-[15px] font-bold" style={{ color: MINT }}>
              {todayCount > 0 ? `${todayCount} 条` : '还没写'}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] text-muted-foreground">本月记录</span>
            <span className="text-[15px] font-bold text-rose-400">{monthDays} 天</span>
          </div>
        </div>

        {/* 当日卡 */}
        <div className="mt-3 rounded-2xl bg-secondary/60 px-4 py-3" data-testid="diary-day-card">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenDay(selected)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenDay(selected);
            }}
            className="flex w-full cursor-pointer items-center gap-3 text-left"
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="前一天"
                onClick={(e) => {
                  e.stopPropagation();
                  const [y, m, d] = selected.split('-').map(Number);
                  const t = new Date(y, m - 1, d - 1);
                  const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
                    t.getDate(),
                  ).padStart(2, '0')}`;
                  setSelected(iso);
                  onOpenDay(iso);
                }}
                className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground active:bg-black/5"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div>
                <div className="text-[11px] leading-none text-muted-foreground">
                  星期{WEEK_CN[weekdayOf(selected)]}
                </div>
                <div className="mt-1 text-[34px] font-bold leading-none tabular-nums text-foreground">
                  {Number(selected.slice(-2))}
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
              {thumbs.length > 0 ? (
                <div className="flex gap-1">
                  {thumbs.map((src) => (
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="h-11 w-11 rounded-md object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              ) : (
                <span className="text-[12px] text-muted-foreground">这天还没有照片</span>
              )}
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                {lastTime ? `最后记录 ${prettyTime(lastTime)}` : '点开写点什么'}
                <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>

        {/* 提示行：现在几点就在这儿记一笔 */}
        <button
          type="button"
          onClick={() => (canWrite ? onCompose(today) : onSlip(today))}
          data-testid="diary-quick-add"
          className="mt-3 flex w-full items-center justify-between rounded-2xl px-1 py-3 text-left"
        >
          <span className="text-[13px] text-foreground/80">
            {canWrite ? '趁还记得，把这一刻记下来' : '今天想对他说点什么'}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {prettyTime(hmNow())}
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-page-line bg-card">
              <Plus className="h-4 w-4" />
            </span>
          </span>
        </button>
      </div>

      {/* 悬浮记录键 */}
      <button
        type="button"
        onClick={() => (canWrite ? onCompose(today) : onSlip(today))}
        aria-label={canWrite ? '记录今天' : '夹张纸条'}
        data-testid="diary-fab"
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] active:scale-95"
        style={{ background: '#17181A' }}
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}

/** 给外面算「这本有哪些天」用 */
export function datesOf(entries: DiaryEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.date))).sort().reverse();
}

export { sortByTime };

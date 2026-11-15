import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  StickyNote,
} from 'lucide-react';
import type { DiaryBook, DiaryEntry, DiarySlip } from './diaryData';
import { shiftDate, sortByTime } from './diaryData';
import { DlogLeaf } from './DlogLeaf';
import { PAGE_EDGES, useViewport } from './pageLayout';

interface Props {
  book: DiaryBook;
  /** 这本书的全部日记（不分日期） */
  entries: DiaryEntry[];
  slips: DiarySlip[];
  today: string;
  canWrite: boolean;
  /** 打开时翻到哪一天（null = 今天） */
  focusDate?: string | null;
  /** 翻页翻到别的日期时，回给上层（深链 / 月历要用） */
  onDateChange?: (date: string) => void;
  onCompose: (date: string) => void;
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
  onSlip: (date: string) => void;
  onJump: () => void;
  onSwitchBook: () => void;
  onSettings: () => void;
  onBack: () => void;
}

/** 翻到最左边时纸停的角度（不是 -180，留一点厚度，像真的掀过去） */
const TURN_DEG = -172;
/** 翻一页多久 */
const TURN_MS = 460;
/** 横划多少像素算翻页 */
const SWIPE = 56;

/**
 * 单页翻页本（2026-11-15）：
 *
 * 一屏就是一页纸（一天），纸绕左边书脊掀走，露出下面那一页 —— 不用翻页库，
 * 就是「两层纸 + 一个 transform」：下面永远压着目标页，上面那层从 0 转到 -172°。
 *
 * - 往后翻：上层 = 当前页，转走，露出下面提前摆好的下一页
 * - 往前翻：上层 = 上一页，从 -172° 转回来盖住当前页（所以这期间下层必须还是旧页）
 * - 左右横划 / 点底部「前一天 / 后一天」都能翻；点中间的页码开月历跳页
 */
export function DlogBook({
  book,
  entries,
  slips,
  today,
  canWrite,
  focusDate,
  onDateChange,
  onCompose,
  onEdit,
  onDelete,
  onSlip,
  onJump,
  onSwitchBook,
  onSettings,
  onBack,
}: Props) {
  const vp = useViewport();
  /**
   * 纸页尺寸：单页本不用 bookPageBox（那套是给双开本算的，左右各扣十几像素书脊），
   * 这里直接按视口留白算 —— 430×900 上大约 374×534，左右各留 28。
   */
  const box = useMemo(() => {
    const w = Math.max(240, Math.min(vp.w - 56, 380, Math.round((vp.h - 200) * 0.7)));
    return { w, h: Math.round(w / 0.7) };
  }, [vp]);

  /** 这本书的页序列：最早那天 → 今天，每天都有一页（空白日也算） */
  const days = useMemo(() => {
    let from = shiftDate(today, -6);
    for (const e of entries) {
      if (e.date && e.date < from) from = e.date;
    }
    const out: string[] = [];
    let d = from;
    let guard = 0;
    while (d <= today && guard++ < 1200) {
      out.push(d);
      d = shiftDate(d, 1);
    }
    return out;
  }, [entries, today]);

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [anim, setAnim] = useState<{ dir: 1 | -1; from: number } | null>(null);
  const flipRef = useRef<HTMLDivElement | null>(null);

  // 第一次定位：有深链日期就翻到那天，否则停在今天
  useEffect(() => {
    if (ready || days.length === 0) return;
    const want = focusDate && days.includes(focusDate) ? days.indexOf(focusDate) : days.length - 1;
    setIndex(want);
    setReady(true);
  }, [days, focusDate, ready]);

  // 之后 focusDate 变了（月历选了一天）→ 直接翻过去，不做动画
  const lastFocus = useRef<string | null>(focusDate ?? null);
  useEffect(() => {
    if (!ready || !focusDate) return;
    if (lastFocus.current === focusDate) return;
    lastFocus.current = focusDate;
    const at = days.indexOf(focusDate);
    if (at >= 0 && at !== index) setIndex(at);
  }, [focusDate, days, ready, index]);

  /**
   * 翻页动画：用 Web Animations API 显式跑一段，不靠 CSS transition。
   * （React 挂载那一帧就把 transform 写死成终值，transition 会被吞掉 —— 踩过。）
   */
  useEffect(() => {
    if (!anim) return;
    const el = flipRef.current;
    if (!el) return;
    const from = anim.dir === 1 ? 0 : TURN_DEG;
    const to = anim.dir === 1 ? TURN_DEG : 0;
    let wa: Animation | null = null;
    const raf = requestAnimationFrame(() => {
      wa = el.animate(
        [
          { transform: `rotateY(${from}deg)`, opacity: 1, filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' },
          {
            transform: `rotateY(${from + (to - from) * 0.55}deg)`,
            opacity: 1,
            offset: 0.55,
            filter: 'drop-shadow(-14px 4px 20px rgba(0,0,0,0.4))',
          },
          { transform: `rotateY(${to}deg)`, opacity: 0, filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' },
        ],
        { duration: TURN_MS, easing: 'cubic-bezier(0.3,0.6,0.35,1)', fill: 'forwards' },
      );
      wa.onfinish = () => setAnim(null);
    });
    return () => {
      cancelAnimationFrame(raf);
      wa?.cancel();
    };
  }, [anim]);

  /**
   * 底下的新页：纸被掀走的瞬间它从 98.5% 轻轻弹回来一点，
   * 不然「下面那张」像是凭空就在那儿，缺一口气。
   */
  const baseRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!anim) return;
    const el = baseRef.current;
    if (!el) return;
    const wa = el.animate(
      [
        { transform: 'scale(0.985)', opacity: 0.75 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: TURN_MS * 0.7, easing: 'cubic-bezier(0.3,0.6,0.35,1)' },
    );
    return () => wa.cancel();
  }, [anim]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (anim) return;
      const target = index + dir;
      if (target < 0 || target >= days.length) return;
      setAnim({ dir, from: index });
      setIndex(target);
      onDateChange?.(days[target]);
    },
    [anim, index, days, onDateChange],
  );

  const date = days[index] ?? today;
  const baseDate = anim && anim.dir === -1 ? days[anim.from] : date;

  const entriesOf = (d: string) => sortByTime(entries.filter((e) => e.date === d));

  // 横划翻页（纵向滚动留给纸内正文）
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    go(dx < 0 ? 1 : -1);
  };

  const atFirst = index <= 0;
  const atLast = index >= days.length - 1;

  return (
    <div className="flex h-full flex-col bg-page-bg" data-testid="diary-dlog-book">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        <button type="button" onClick={onBack} aria-label="返回" className="icon-btn h-8 w-8">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onSwitchBook}
          data-testid="diary-book-switch"
          className="flex min-w-0 items-center gap-1.5"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-foreground text-[10px] font-bold text-page-bg">
            D
          </span>
          <span className="max-w-[132px] truncate text-[13px] font-medium text-foreground">{book.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onJump}
          aria-label="跳到某一天"
          data-testid="diary-book-calendar"
          className="icon-btn h-8 w-8"
        >
          <CalendarDays className="h-[17px] w-[17px]" />
        </button>
        <button
          type="button"
          onClick={onSettings}
          aria-label="本子设置"
          data-testid="diary-book-settings"
          className="icon-btn h-8 w-8"
        >
          <Settings className="h-[17px] w-[17px]" />
        </button>
      </header>

      {/* 书 */}
      <div
        className="flex flex-1 items-center justify-center overflow-hidden px-3"
        style={{ perspective: '2000px' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative" style={{ width: box.w + PAGE_EDGES[0], height: box.h + PAGE_EDGES[0] }}>
          {/* 页块厚度：露在右边和下边 */}
          {PAGE_EDGES.map((off, k) => (
            <div
              key={off}
              aria-hidden
              className="absolute rounded-[7px] bg-[#efe7d8] dark:bg-[#1b1917]"
              style={{ width: box.w, height: box.h, left: off, top: off, zIndex: k - PAGE_EDGES.length }}
            />
          ))}

          {/* 下面这一层：目标页 */}
          <div
            ref={baseRef}
            className="absolute left-0 top-0 rounded-[7px] shadow-[0_18px_34px_-18px_rgba(0,0,0,0.55)]"
            style={{ zIndex: 1 }}
          >
            <DlogLeaf
              book={book}
              date={baseDate}
              entries={entriesOf(baseDate)}
              slips={slips.filter((s) => s.date === baseDate)}
              box={box}
              pageNo={days.indexOf(baseDate) + 1}
              total={days.length}
              canWrite={canWrite}
              onEdit={onEdit}
              onDelete={onDelete}
              onCompose={() => onCompose(baseDate)}
            />
          </div>

          {/* 上面这一层：正在翻的那一张纸 */}
          {anim && (
            <div
              ref={flipRef}
              className="absolute left-0 top-0"
              data-testid="diary-flip-layer"
              style={{
                zIndex: 2,
                transformOrigin: 'left center',
                transform: `rotateY(${anim.dir === 1 ? 0 : TURN_DEG}deg)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div style={{ backfaceVisibility: 'hidden' }}>
                <DlogLeaf
                  book={book}
                  date={days[anim.from]}
                  entries={entriesOf(days[anim.from])}
                  slips={slips.filter((s) => s.date === days[anim.from])}
                  box={box}
                  pageNo={anim.from + 1}
                  total={days.length}
                  canWrite={canWrite}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onCompose={() => onCompose(days[anim.from])}
                />
              </div>
              {/* 纸背：转过 90° 之后看到的就是这张空白的背面，不然纸会凭空消失 */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-[7px] bg-[#f7f2e8] shadow-[inset_-14px_0_26px_-16px_rgba(0,0,0,0.35)] dark:bg-[#1d1a18]"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 底部：前一天 / 页码（点开月历） / 后一天 */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={atFirst}
          data-testid="diary-book-prev"
          className="flex items-center gap-0.5 py-2 pr-2 text-[12px] text-muted-foreground disabled:opacity-25"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {atFirst ? '最早' : days[index - 1]?.slice(5).replace('-', '.')}
        </button>
        <button
          type="button"
          onClick={onJump}
          data-testid="diary-book-pager"
          className="px-2 py-1 text-[11px] tabular-nums tracking-[0.1em] text-muted-foreground"
        >
          {Math.min(index, Math.max(0, days.length - 1)) + 1} / {days.length}
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={atLast}
          data-testid="diary-book-next"
          className="flex items-center gap-0.5 py-2 pl-2 text-[12px] text-muted-foreground disabled:opacity-25"
        >
          {atLast ? '今天' : days[index + 1]?.slice(5).replace('-', '.')}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 在这页上写 / 夹纸条 */}
      <button
        type="button"
        onClick={() => (canWrite ? onCompose(date) : onSlip(date))}
        aria-label={canWrite ? '记这一刻' : '夹张纸条'}
        data-testid={canWrite ? 'diary-book-add' : 'diary-book-add-slip'}
        className="fixed bottom-[94px] right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-page-bg shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)] active:scale-95"
      >
        {canWrite ? <Plus className="h-5 w-5" /> : <StickyNote className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}

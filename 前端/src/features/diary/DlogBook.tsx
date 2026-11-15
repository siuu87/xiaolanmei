import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
  Plus,
  Settings,
  SmilePlus,
  StickyNote,
} from 'lucide-react';
import type { DiaryBook, DiaryEntry, DiaryPageLock, DiarySlip, DiarySticker } from './diaryData';
import { shiftDate, sortByTime } from './diaryData';
import { BookCover } from './BookCover';
import { DlogLeaf } from './DlogLeaf';
import { LockedLeaf } from './LockedLeaf';
import { PageLockSheet } from './PageLockSheet';
import { StickerPicker } from './StickerPicker';
import { checkDiaryPageCode } from '@/lib/api/home';
import { useDiaryStore } from './diaryStore';
import { useViewport } from './pageLayout';

interface Props {
  book: DiaryBook;
  /** 这本书的全部日记（不分日期） */
  entries: DiaryEntry[];
  slips: DiarySlip[];
  /** 这本书里贴过的全部贴纸（不分日期） */
  stickers: DiarySticker[];
  /** 这本书里锁着的页（只锁某一天，不锁整本） */
  pageLocks: DiaryPageLock[];
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
  /** 纸条贴到别处（拖完松手才写库，0~1 比例） */
  onMoveSlip: (id: string, pos: { x: number; y: number }) => void;
  /** 点开一张纸条：我的去改，他的去读 */
  onOpenSlip: (slip: DiarySlip) => void;
  onAddSticker: (s: Omit<DiarySticker, 'id'>) => void;
  onMoveSticker: (id: string, pos: { x: number; y: number }) => void;
  onChangeSticker: (id: string, patch: { scale?: number; rot?: number }) => void;
  onRemoveSticker: (id: string) => void;
  /** 锁 / 解某一页 */
  onLockPage: (date: string, code: string) => Promise<void>;
  onUnlockPage: (date: string) => void;
  /** 撬锁（错够 2 次才给）：这一页会被记下「闯过」，TA 会发现 */
  onSneakPage: (date: string, tries: number) => Promise<{ ok: boolean; line: string }>;
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
/** 封面掀开停的角度 / 时长 */
const COVER_DEG = -176;
const COVER_MS = 620;
/** 左侧书脊宽：封底从纸页左边露出来的那道深色 */
const SPINE = 7;

/**
 * 单页翻页本（2026-11-15）：
 *
 * 一屏就是一页纸（一天），纸绕左边书脊掀走，露出下面那一页 —— 不用翻页库，
 * 就是「两层纸 + 一个 transform」：下面永远压着目标页，上面那层从 0 转到 -172°。
 *
 * - 进来是一本**合着的本子**（硬壳封面），轻点封面掀开，落在今天那页
 * - 翻到第一页再往前翻 = 把封面合上，回到「合着」的样子
 * - 往后翻：上层 = 当前页，转走，露出下面提前摆好的下一页
 * - 往前翻：上层 = 上一页，从 -172° 转回来盖住当前页（所以这期间下层必须还是旧页）
 * - 左右横划 / 点底部「前一天 / 后一天」都能翻；点中间的页码开月历跳页
 *
 * 厚度：右边和下边露出一叠纸的断面（横纹，页数越多越厚），左边一条书脊，
 * 下面垫一层压暗的封底 —— 不用真 3D，靠这几层「假的侧面」撑出体积。
 */
export function DlogBook({
  book,
  entries,
  slips,
  stickers,
  pageLocks,
  today,
  canWrite,
  focusDate,
  onDateChange,
  onCompose,
  onEdit,
  onDelete,
  onSlip,
  onMoveSlip,
  onOpenSlip,
  onAddSticker,
  onMoveSticker,
  onChangeSticker,
  onRemoveSticker,
  onLockPage,
  onUnlockPage,
  onSneakPage,
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

  /** 书有多厚：页数越多，右边那叠纸越宽（7 ~ 22px） */
  const thick = useMemo(
    () => Math.max(8, Math.min(26, Math.round(5 + days.length * 0.22))),
    [days.length],
  );

  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [anim, setAnim] = useState<{ dir: 1 | -1; from: number } | null>(null);
  const flipRef = useRef<HTMLDivElement | null>(null);

  /** 合着 / 翻开（进来默认合着，有「翻开一本本子」的动作） */
  const [closed, setClosed] = useState(true);
  const [coverAnim, setCoverAnim] = useState<'open' | 'shut' | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);

  /** 贴纸面板（手账贴纸：选一张贴到当前这页） */
  const [stickerOpen, setStickerOpen] = useState(false);

  /** 单页锁（2026-11-15）：密码面板 / 本次已翻开的页 */
  const [lockSheet, setLockSheet] = useState<{ mode: 'set' | 'open'; date: string } | null>(null);
  const [unlockedPages, setUnlockedPages] = useState<string[]>([]);
  /** TA 替你开门后浮出来的一句话 */
  const [openedTip, setOpenedTip] = useState<string | null>(null);

  useEffect(() => {
    if (!openedTip) return;
    const t = window.setTimeout(() => setOpenedTip(null), 3200);
    return () => window.clearTimeout(t);
  }, [openedTip]);

  /** 纸条轻提示（他发现了 / 这页多了一张他留的纸条）→ 复用页面顶部那条胶囊 */
  const slipNotice = useDiaryStore((s) => s.slipNotice);
  const clearSlipNotice = useDiaryStore((s) => s.clearSlipNotice);
  useEffect(() => {
    if (!slipNotice) return;
    setOpenedTip(slipNotice.text);
    clearSlipNotice();
  }, [slipNotice, clearSlipNotice]);

  // pageLocks 传进来前已经按本筛过，这里只按日期找
  const lockOf = (d: string) => pageLocks.find((l) => l.date === d);
  /** 这一页现在看不了：有锁，而且这次还没翻开过 */
  const isLocked = (d: string) => !!lockOf(d) && !unlockedPages.includes(d);

  const dayLabelOf = (d: string) => {
    const [, m, dd] = d.split('-');
    return m && dd ? `${Number(m)} 月 ${Number(dd)} 日` : d;
  };

  /** 撬锁：不是「正大光明地开」，这一页从此带着「被闯过」的记号 */
  const handleSneak = async (d: string, tries: number) => {
    const r = await onSneakPage(d, tries);
    if (!r.ok) return;
    setUnlockedPages((prev) => (prev.includes(d) ? prev : [...prev, d]));
    setLockSheet(null);
    setOpenedTip(r.line || '你撬开了这一页');
  };

  /** 顶栏那把锁：没锁 → 设密码；已锁且这次开过 → 直接解开；已锁没开 → 输密码 */
  const tapLock = (d: string) => {
    const l = lockOf(d);
    if (!l) {
      setLockSheet({ mode: 'set', date: d });
      return;
    }
    if (unlockedPages.includes(d)) {
      onUnlockPage(d);
      setUnlockedPages((prev) => prev.filter((x) => x !== d));
      return;
    }
    setLockSheet({ mode: 'open', date: d });
  };

  /** 密码面板提交：set = 落锁；open = 验码后这次翻开（锁还在） */
  const submitCode = async (code: string): Promise<string | null> => {
    if (!lockSheet) return null;
    const d = lockSheet.date;
    if (lockSheet.mode === 'set') {
      try {
        await onLockPage(d, code);
      } catch {
        return '锁没落上，再试一次';
      }
      setLockSheet(null);
      return null;
    }
    try {
      await checkDiaryPageCode({ bookId: book.id, date: d, code });
    } catch {
      return '密码不对，再想想';
    }
    setUnlockedPages((prev) => (prev.includes(d) ? prev : [...prev, d]));
    setLockSheet(null);
    return null;
  };

  // 第一次定位：有深链日期就翻到那天，否则停在今天；深链（?date= / ?new=1）直接翻开
  useEffect(() => {
    if (ready || days.length === 0) return;
    const want = focusDate && days.includes(focusDate) ? days.indexOf(focusDate) : days.length - 1;
    setIndex(want);
    if (focusDate && days.includes(focusDate)) setClosed(false);
    setReady(true);
  }, [days, focusDate, ready]);

  // 之后 focusDate 变了（月历选了一天）→ 直接翻过去，不做动画，顺手把本子打开
  const lastFocus = useRef<string | null>(focusDate ?? null);
  useEffect(() => {
    if (!ready || !focusDate) return;
    if (lastFocus.current === focusDate) return;
    lastFocus.current = focusDate;
    const at = days.indexOf(focusDate);
    if (at >= 0 && at !== index) setIndex(at);
    setClosed(false);
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
   * 封面掀开 / 合上：同一套动画，方向相反。
   * 掀开时封面绕左侧书脊转 -176°，转到一半就出画（外面的舞台 overflow-hidden 裁掉），
   * 结束时把封面卸掉，露出的就是内页。
   */
  useEffect(() => {
    if (!coverAnim) return;
    const el = coverRef.current;
    if (!el) return;
    const opening = coverAnim === 'open';
    const from = opening ? 0 : COVER_DEG;
    const to = opening ? COVER_DEG : 0;
    let wa: Animation | null = null;
    const raf = requestAnimationFrame(() => {
      wa = el.animate(
        [
          { transform: `rotateY(${from}deg)`, filter: 'drop-shadow(0 18px 26px rgba(0,0,0,0.34))' },
          {
            transform: `rotateY(${from + (to - from) * 0.62}deg)`,
            offset: 0.62,
            filter: 'drop-shadow(-22px 10px 30px rgba(0,0,0,0.42))',
          },
          { transform: `rotateY(${to}deg)`, filter: 'drop-shadow(0 18px 26px rgba(0,0,0,0.34))' },
        ],
        { duration: COVER_MS, easing: 'cubic-bezier(0.32,0.64,0.28,1)', fill: 'forwards' },
      );
      wa.onfinish = () => {
        setCoverAnim(null);
        setClosed(!opening);
      };
    });
    return () => {
      cancelAnimationFrame(raf);
      wa?.cancel();
    };
  }, [coverAnim]);

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

  /** 封面掀开时，里面的纸「亮一下」，像真有光从缝里进来 */
  useEffect(() => {
    if (coverAnim !== 'open') return;
    const el = baseRef.current;
    if (!el) return;
    const wa = el.animate(
      [
        { transform: 'scale(0.975)', filter: 'brightness(1.10)' },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: COVER_MS * 0.85, easing: 'cubic-bezier(0.3,0.6,0.35,1)' },
    );
    return () => wa.cancel();
  }, [coverAnim]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (anim || coverAnim) return;
      const target = index + dir;
      if (target < 0 || target >= days.length) return;
      setAnim({ dir, from: index });
      setIndex(target);
      onDateChange?.(days[target]);
    },
    [anim, coverAnim, index, days, onDateChange],
  );

  const openCover = useCallback(() => {
    if (coverAnim || !closed) return;
    setCoverAnim('open');
  }, [coverAnim, closed]);

  const shutCover = useCallback(() => {
    if (coverAnim || closed) return;
    setCoverAnim('shut');
  }, [coverAnim, closed]);

  const date = days[index] ?? today;
  const baseDate = anim && anim.dir === -1 ? days[anim.from] : date;

  const entriesOf = (d: string) => sortByTime(entries.filter((e) => e.date === d));
  const stickersOf = (d: string) => stickers.filter((s) => s.date === d);

  /**
   * 这一页画成什么：锁着就是一张灰纸 + 一把锁（`LockedLeaf`，尺寸/圆角与纸页一致），
   * 否则是正常纸页。翻页的两层都走这里，免得翻到一半漏出锁页里的字。
   */
  const renderLeaf = (d: string, pageNo: number) =>
    isLocked(d) ? (
      <LockedLeaf
        date={d}
        box={box}
        slip={slips.filter((s) => s.date === d && s.author === 'ta').slice(-1)[0]}
        sneaked={!!lockOf(d)?.sneakedAt}
        onAskCode={() => setLockSheet({ mode: 'open', date: d })}
      />
    ) : (
      <DlogLeaf
        book={book}
        date={d}
        entries={entriesOf(d)}
        slips={slips.filter((s) => s.date === d)}
        stickers={stickersOf(d)}
        box={box}
        pageNo={pageNo}
        total={days.length}
        canWrite={canWrite}
        onEdit={onEdit}
        onDelete={onDelete}
        onCompose={() => onCompose(d)}
        onMoveSticker={onMoveSticker}
        onChangeSticker={onChangeSticker}
        onRemoveSticker={onRemoveSticker}
        onMoveSlip={onMoveSlip}
        onOpenSlip={onOpenSlip}
      />
    );

  /** 挑中一张表情 → 贴到当前这页（位置错开一点，连贴几张不会全叠在中间） */
  const dropSticker = (src: string) => {
    const n = stickersOf(date).length;
    onAddSticker({
      bookId: book.id,
      date,
      src,
      // 左右三档、上下五档轮着走 —— 连贴四五张也是一小片散落，不是一摞
      x: 0.5 + ((n % 3) - 1) * 0.15,
      y: 0.28 + (n % 5) * 0.11,
      scale: 1,
      rot: (n % 5) * 5 - 10,
    });
    setStickerOpen(false);
  };

  // 横划翻页（纵向滚动留给纸内正文）；合着的时候横划一下就是翻开
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
    if (closed) {
      openCover();
      return;
    }
    go(dx < 0 ? 1 : -1);
  };

  const atFirst = index <= 0;
  const atLast = index >= days.length - 1;

  /** 纸叠断面的横纹：一条暗线 + 一条亮线交替，深浅主题都立得住 */
  const threadV = {
    backgroundImage:
      'repeating-linear-gradient(180deg, rgba(0,0,0,0.12) 0 0.5px, rgba(255,255,255,0.13) 0.5px 1px)',
  };
  const threadH = {
    backgroundImage:
      'repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0 0.5px, rgba(255,255,255,0.13) 0.5px 1px)',
  };

  /** 合着时，最后一条记在什么时候（封面上的小字） */
  const lastEntry = useMemo(() => {
    const dated = entries.filter((e) => e.date).sort((a, b) => (a.date < b.date ? 1 : -1));
    const last = dated[0];
    if (!last) return '还没有写过字';
    return `${last.date.slice(5).replace('-', '.')} 记过`;
  }, [entries]);

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
          <span className="max-w-[132px] truncate text-[13px] font-medium text-foreground">
            {book.name}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        <span className="flex-1" />
        {canWrite && !closed && !isLocked(date) && (
          <button
            type="button"
            onClick={() => setStickerOpen(true)}
            aria-label="贴一张表情"
            data-testid="diary-sticker-open"
            className="icon-btn h-8 w-8"
          >
            <SmilePlus className="h-[17px] w-[17px]" />
          </button>
        )}
        {canWrite && !closed && !isLocked(date) && (
          <button
            type="button"
            onClick={() => onSlip(date)}
            aria-label="给这页夹一张纸条"
            data-testid="diary-page-slip"
            className="icon-btn h-8 w-8"
          >
            <StickyNote className="h-[17px] w-[17px]" />
          </button>
        )}
        {canWrite && !closed && (
          <button
            type="button"
            onClick={() => tapLock(date)}
            aria-label={lockOf(date) ? '这一页锁着（点开输密码 / 解开）' : '锁住这一页'}
            data-testid="diary-page-lock-toggle"
            data-locked={lockOf(date) ? '1' : '0'}
            className={`icon-btn h-8 w-8 ${lockOf(date) ? 'text-primary' : ''}`}
          >
            {lockOf(date) ? <Lock className="h-[17px] w-[17px]" /> : <LockOpen className="h-[17px] w-[17px]" />}
          </button>
        )}
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
        <div
          className="relative"
          style={{ width: SPINE + box.w + thick, height: box.h + thick }}
          data-testid="diary-book-stage"
          data-closed={closed ? '1' : '0'}
          onClick={closed ? openCover : undefined}
        >
          {/* 封底硬壳：压暗的封皮色，只在左边露出一道书脊 */}
          <div
            aria-hidden
            className="absolute overflow-hidden rounded-[6px_7px_7px_6px]"
            style={{
              left: 0,
              top: 0,
              width: SPINE + box.w,
              height: box.h,
              background: book.coverImage ? '#2c2a28' : book.cover,
            }}
          >
            <div className="absolute inset-0 bg-black/28 dark:bg-black/55" />
            {/* 书脊压槽：一道亮线 + 一道暗线，边上还有装订的圆弧 */}
            <div className="absolute inset-y-4 left-[3px] w-px bg-white/12" />
            <div
              className="absolute inset-y-0 left-0 w-2"
              style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.35), transparent)' }}
            />
          </div>

          {/* 右侧断面：一叠纸的侧边，页数越多越厚 */}
          <div
            aria-hidden
            className="absolute overflow-hidden rounded-r-[7px] bg-[#ece2ce] dark:bg-[#463c31]"
            style={{
              left: SPINE + box.w,
              top: 4,
              width: thick,
              height: box.h - 8,
              boxShadow: '3px 6px 16px -8px rgba(0,0,0,0.55)',
            }}
          >
            <div className="absolute inset-0" style={threadV} />
            {/* 靠外一道暗边：断面不是平的，边缘会卷进去一点 */}
            <div
              className="absolute inset-y-0 right-0 w-[4px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.24))' }}
            />
            {/* 贴书页那一侧留一点亮，纸叠才有厚度 */}
            <div
              className="absolute inset-y-0 left-0 w-[2px]"
              style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.22), transparent)' }}
            />
          </div>

          {/* 底部断面 */}
          <div
            aria-hidden
            className="absolute overflow-hidden rounded-bl-[7px] bg-[#ece2ce] dark:bg-[#463c31]"
            style={{
              left: SPINE + 3,
              top: box.h,
              width: box.w - 3,
              height: thick,
              boxShadow: '5px 6px 16px -8px rgba(0,0,0,0.55)',
            }}
          >
            <div className="absolute inset-0" style={threadH} />
            <div
              className="absolute inset-x-0 bottom-0 h-[4px]"
              style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.24), transparent)' }}
            />
            <div
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent)' }}
            />
          </div>

          {/* 右下角：两叠纸交汇的那块圆角 */}
          <div
            aria-hidden
            className="absolute overflow-hidden rounded-br-[7px] bg-[#e0d5be] dark:bg-[#332c23]"
            style={{ left: SPINE + box.w, top: box.h - 4, width: thick, height: thick + 4 }}
          >
            <div className="absolute inset-0" style={threadV} />
            <div className="absolute inset-0" style={threadH} />
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(circle at 70% 70%, rgba(0,0,0,0.18), transparent 70%)' }}
            />
          </div>

          {/* 下面这一层：目标页 */}
          <div
            ref={baseRef}
            className="absolute rounded-[7px] shadow-[0_18px_34px_-18px_rgba(0,0,0,0.55)]"
            style={{ left: SPINE, top: 0, zIndex: 2 }}
          >
            {renderLeaf(baseDate, days.indexOf(baseDate) + 1)}
            <GutterShade />
          </div>

          {/* 上面这一层：正在翻的那一张纸 */}
          {anim && (
            <div
              ref={flipRef}
              className="absolute"
              data-testid="diary-flip-layer"
              style={{
                left: SPINE,
                top: 0,
                zIndex: 3,
                transformOrigin: 'left center',
                transform: `rotateY(${anim.dir === 1 ? 0 : TURN_DEG}deg)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="relative" style={{ backfaceVisibility: 'hidden' }}>
                {renderLeaf(days[anim.from], anim.from + 1)}
                <GutterShade />
              </div>
              {/* 纸背：转过 90° 之后看到的就是这张空白的背面，不然纸会凭空消失 */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-[7px] bg-[#f7f2e8] shadow-[inset_-14px_0_26px_-16px_rgba(0,0,0,0.35)] dark:bg-[#1d1a18]"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              />
            </div>
          )}

          {/* 封面：进来盖着，点一下掀开 */}
          {(closed || coverAnim) && (
            <div
              ref={coverRef}
              className="absolute left-0 top-0"
              data-testid="diary-book-cover-wrap"
              style={{
                width: SPINE + box.w,
                height: box.h,
                zIndex: 4,
                transformOrigin: 'left center',
                transform: `rotateY(${closed ? 0 : COVER_DEG}deg)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <button
                type="button"
                onClick={openCover}
                aria-label="翻开这本日记"
                data-testid="diary-book-open"
                className="block h-full w-full text-left"
              >
                <BookCover
                  book={book}
                  meta={closed ? `${days.length} 页 · ${lastEntry}` : undefined}
                  hideEdge
                  className="h-full w-full"
                />
              </button>
              {/* 封皮内侧（转过 90° 之后看到的那一面） */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-[6px_9px_9px_6px] bg-[#efe8d8] shadow-[inset_16px_0_30px_-18px_rgba(0,0,0,0.4)] dark:bg-[#211d19]"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              />
            </div>
          )}

          {/* TA 替她打开那一页之后，浮一句就走 */}
          {openedTip && (
            <div
              className="pointer-events-none absolute inset-x-0 top-3 z-[5] flex justify-center"
              data-testid="diary-opened-tip"
            >
              <span className="rounded-full bg-ink/85 px-3 py-1 text-[11px] text-page-bg shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]">
                {openedTip}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 底部：合着时是「轻点翻开」，翻开后是 前一天 / 页码 / 后一天 */}
      {closed ? (
        <div className="flex shrink-0 items-center justify-center px-5 pb-3 pt-1">
          <button
            type="button"
            onClick={openCover}
            data-testid="diary-book-hint"
            className="animate-pulse py-2 text-[11px] tracking-[0.2em] text-muted-foreground"
          >
            轻点封面，翻开本子
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
          <button
            type="button"
            onClick={() => (atFirst ? shutCover() : go(-1))}
            data-testid="diary-book-prev"
            className="flex items-center gap-0.5 py-2 pr-2 text-[12px] text-muted-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {atFirst ? '合上' : days[index - 1]?.slice(5).replace('-', '.')}
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
      )}

      {/* 贴纸面板：选一张表情贴到当前这页 */}
      {stickerOpen && <StickerPicker onPick={dropSticker} onClose={() => setStickerOpen(false)} />}

      {/* 单页锁的密码面板 */}
      {lockSheet && (
        <PageLockSheet
          mode={lockSheet.mode}
          dayLabel={dayLabelOf(lockSheet.date)}
          onClose={() => setLockSheet(null)}
          onSubmit={submitCode}
          onSneak={
            lockSheet.mode === 'open'
              ? (fails) => handleSneak(lockSheet.date, fails)
              : undefined
          }
        />
      )}

      {/* 在这页上写 / 夹纸条（锁着的页不写） */}
      {!closed && !isLocked(date) && (
        <button
          type="button"
          onClick={() => (canWrite ? onCompose(date) : onSlip(date))}
          aria-label={canWrite ? '记这一刻' : '夹张纸条'}
          data-testid={canWrite ? 'diary-book-add' : 'diary-book-add-slip'}
          className="fixed bottom-[94px] right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-page-bg shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)] active:scale-95"
        >
          {canWrite ? <Plus className="h-5 w-5" /> : <StickyNote className="h-[18px] w-[18px]" />}
        </button>
      )}
    </div>
  );
}

/**
 * 纸页靠书脊那一侧的装订阴影：
 * 真实的本子，纸贴近装订处会陷下去一点，靠近书脊的地方有一道暗。
 * 只是一层渐变，压在纸上面（不碰排版）。
 */
function GutterShade() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-[22px] rounded-l-[7px]"
      style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.11), rgba(0,0,0,0.03) 55%, transparent)' }}
    />
  );
}

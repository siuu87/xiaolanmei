import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  PenLine,
  StickyNote,
  Trash2,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import type { CoupleDay, DeckPage, DiaryBook, DiaryEntry, DiarySlip } from './diaryData';
import { HAND_FONT, canWriteDiary, isCoupleBook } from './diaryData';
import { DiaryPageFace, PAPER_CLASS } from './DiaryPageFace';
import { CouplePageFace } from './CouplePageFace';
import { BookCover } from './BookCover';
import { SlipEditor } from './SlipEditor';
import { useDiaryStore } from './diaryStore';
import { BookLock } from './BookLock';
import { BOOK_PAD, PAGE_EDGES, bookPageBox, useViewport } from './pageLayout';
import { InkBorder, InkRect, InkRing, PaperTexture } from './InkShapes';
import { inkLine } from './ink';
import { uploadImage } from '@/lib/api/attachments';

interface Props {
  book: DiaryBook;
  entries: DiaryEntry[];
  /** 日历深链：打开本子后定位到这一天 */
  focusDate?: string | null;
  /** 一打开就进编写页（右上角「去记录」/ 日历「去记日记」深链），默认翻页阅读 */
  startEditing?: boolean;
  onClose: () => void;
  onOpenReader: (page: DeckPage) => void;
}

/** 今天的 YYYY-MM-DD */
function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function splitDate(date: string): { md: string; y: string } {
  const [y, m, d] = date.split('-').map(Number);
  return { md: `${m}月${d}日`, y: String(y) };
}

/** 一页最多放几张图 */
const MAX_IMAGES = 9;

/**
 * 本子详情（2026-11-13 三态）：
 *   锁屏（仅上锁本）→ 翻页阅读 → 编写页
 *
 * - 本子是一本「固定大小」的书：书壳 + 页块厚度 + 一页纸，纸页比例接近 A5。
 *   页面大小永远不变，长文自动排到下一面（页数会变，页大小不变）。
 * - 只有右上角按钮能进编写页；保存或返回都回到这页的翻页阅读
 * - 上锁的本子先过锁屏：一整面灰纸 + 一把锁；4 位密码正常解锁，
 *   长按锁 2.6 秒是「撬锁」，偷偷看完仍保持上锁
 */
export function BookDeck({ book, entries, focusDate, startEditing = false, onClose, onOpenReader }: Props) {
  const patchEntry = useDiaryStore((s) => s.patchEntry);
  const addEntry = useDiaryStore((s) => s.addEntry);
  const removeEntry = useDiaryStore((s) => s.removeEntry);
  const slips = useDiaryStore((s) => s.slips);
  const addSlip = useDiaryStore((s) => s.addSlip);
  const patchSlip = useDiaryStore((s) => s.patchSlip);
  const removeSlip = useDiaryStore((s) => s.removeSlip);

  // TA 的日记写不了，只能夹小纸条
  const canWrite = canWriteDiary(book);

  // 锁门：本次会话有效，退出本子再进要重新开
  const [gate, setGate] = useState<'locked' | 'open'>(book.locked ? 'locked' : 'open');
  const [sneak, setSneak] = useState(false);
  const [view, setView] = useState<'read' | 'write'>(startEditing && canWrite ? 'write' : 'read');
  // 小纸条编辑器：null = 关着；{} = 新夹一张；{slip} = 改那张
  const [slipEdit, setSlipEdit] = useState<{ slip?: DiarySlip } | null>(null);

  // 这本里的小纸条（按日期挂到页上）
  const bookSlips = slips.filter((s) => (s.bookId || 'book-me') === book.id);

  // 本子内的页：按日期升序（从过去翻到现在）
  const pages = useMemo(() => {
    const base = entries
      .filter((e) => (e.bookId ?? 'book-me') === book.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (canWrite) return base;
    // TA 的本子：有纸条但没日记的日期也要留一页，否则纸条过了这天就翻不到了
    const seen = new Set(base.map((p) => p.date));
    const extra: DiaryEntry[] = [];
    bookSlips.forEach((s) => {
      if (seen.has(s.date)) return;
      seen.add(s.date);
      extra.push({
        id: `__slip__${s.date}`,
        date: s.date,
        author: 'partner',
        content: '',
        bookId: book.id,
      });
    });
    return [...base, ...extra].sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, book.id, canWrite, bookSlips]);

  const today = todayISO();
  const couple = isCoupleBook(book);
  const lastPage = pages[pages.length - 1];
  const todayIsBlank = !lastPage || lastPage.date !== today;

  // 页栈：情侣本「一天一页（他半 + 我半）」，其它本「一页一篇 + 末尾今天页」
  const stack: DeckPage[] = useMemo(() => {
    if (couple) {
      const slots = new Map<string, CoupleDay>();
      pages.forEach((e) => {
        const cur = slots.get(e.date) ?? { date: e.date };
        if (e.author === 'partner') cur.theirs = e;
        else cur.mine = e;
        slots.set(e.date, cur);
      });
      // 今天一定有一页，哪怕两个人都还没写
      if (!slots.has(today)) slots.set(today, { date: today });
      return [...slots.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ key: `couple:${d.date}`, date: d.date, pair: d }));
    }
    const base: DeckPage[] = pages.map((p) => ({ key: p.id, date: p.date, entry: p }));
    if (todayIsBlank) {
      base.push({
        key: '__today__',
        date: today,
        entry: {
          id: '__today__',
          date: today,
          author: book.kind === 'partner' ? 'partner' : 'me',
          content: '',
          bookId: book.id,
        },
      });
    }
    return base;
  }, [pages, couple, today, todayIsBlank, book.id, book.kind]);

  // 每篇（每天）量出来占几面 → 展开成真正可翻的页面栈
  const [slices, setSlices] = useState<Record<string, number>>({});
  const flat = useMemo(() => {
    const out: DeckPage[] = [];
    stack.forEach((p) => {
      const n = Math.max(1, Math.min(20, slices[p.key] ?? 1));
      for (let k = 0; k < n; k++) out.push({ ...p, slice: k, slices: n });
    });
    return out;
  }, [stack, slices]);

  const focusAt = focusDate ? flat.findIndex((p) => p.date === focusDate) : -1;
  const firstPage = flat[focusAt >= 0 ? focusAt : flat.length - 1];
  // 打开时停在哪一页：有深链就定位那天，否则「一直停在最后一面」——
  // 用 Infinity 表示“贴住末尾”，因为日记是异步加载、长文还会分面，数字会漂
  const [index, setIndex] = useState<number>(focusAt >= 0 ? focusAt : Number.MAX_SAFE_INTEGER);
  const [draft, setDraft] = useState(
    firstPage?.pair?.mine?.content ?? firstPage?.entry?.content ?? '',
  );
  const [draftImages, setDraftImages] = useState<string[]>(
    firstPage?.pair?.mine?.images ?? firstPage?.entry?.images ?? [],
  );
  const [syncedId, setSyncedId] = useState<string | undefined>(undefined);
  const [confirmDel, setConfirmDel] = useState(false);

  // 加图
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  // 翻页动画
  const [flipping, setFlipping] = useState<null | 'next' | 'prev'>(null);
  const drag = useRef<{ startX: number; dx: number } | null>(null);
  const [dragAngle, setDragAngle] = useState(0);

  // 纸页几何：按视口算，比例固定 —— 翻页、编写、放大阅读都是同一张纸
  const vp = useViewport();
  const box = bookPageBox(vp);
  const coverW = box.w + BOOK_PAD.left + BOOK_PAD.right;
  const coverH = box.h + BOOK_PAD.top + BOOK_PAD.bottom;
  /**
   * 写日记时书区已经被卸载 —— 记住阅读时那张纸的大小，
   * 写的时候原样用同一张纸，页大小才不会变。
   */
  const readBox = useRef(box);
  if (view === 'read') readBox.current = box;

  // ---- 开本动画（照 Ardot 8:178 三帧分镜）----
  const [opening, setOpening] = useState<'closed' | 'opening' | 'open'>('closed');
  useEffect(() => {
    if (gate !== 'open') return;
    setOpening('closed');
    const t1 = setTimeout(() => setOpening('opening'), 40);
    const t2 = setTimeout(() => setOpening('open'), 640);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [gate]);

  // 当前实际页（index 可能是 Infinity = 贴住末尾）
  const ci = Math.min(Math.max(index, 0), Math.max(flat.length - 1, 0));
  const page = flat[ci];
  /** 这页里属于我的那半：情侣本是下半，其它本是整页 */
  const myEntry = page?.pair ? page.pair.mine : page?.entry;
  const pageContent = myEntry?.content ?? '';
  const pageImages = myEntry?.images ?? [];

  // 翻到新页时把草稿同步成那页内容（同一篇的下一面不再重同步，草稿跟着走）
  if (syncedId !== page?.key) {
    setSyncedId(page?.key);
    setDraft(pageContent);
    setDraftImages(pageImages);
  }

  const canNext = ci < flat.length - 1;
  const canPrev = ci > 0;
  const isTodayPage = page?.date === today;
  /** 我的这半页已经有字 → 可以改 / 可以删 */
  const canDeletePage = !!myEntry && myEntry.id !== '__today__';
  const deckBtnLabel = couple
    ? myEntry
      ? '改这半页'
      : '写我这半'
    : isTodayPage
      ? '写日记'
      : '改这页';

  // 这本里的小纸条，按日期挂到页上
  const slipsOf = (date: string) => bookSlips.filter((s) => s.date === date);

  const startFlip = (dir: 'next' | 'prev') => {
    if (flipping || view !== 'read' || gate !== 'open') return;
    setFlipping(dir);
    setTimeout(() => {
      const target = dir === 'next' ? ci + 1 : ci - 1;
      setIndex(Math.max(0, Math.min(flat.length - 1, target)));
      setFlipping(null);
    }, 480);
  };

  // ---- 拖拽翻页 ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (flipping || view !== 'read') return;
    drag.current = { startX: e.clientX, dx: 0 };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dx = e.clientX - drag.current.startX;
    const w = coverW / 2;
    let angle = 0;
    if (drag.current.dx < 0 && canNext) {
      angle = Math.max(-180, (drag.current.dx / w) * -180);
    } else if (drag.current.dx > 0 && canPrev) {
      angle = Math.min(180, (drag.current.dx / w) * 180);
    }
    setDragAngle(angle);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const dx = drag.current.dx;
    drag.current = null;
    setDragAngle(0);
    const w = coverW / 2;
    if (dx < -w * 0.4 && canNext) startFlip('next');
    else if (dx > w * 0.4 && canPrev) startFlip('prev');
  };

  // ---- 编写 ----
  const startWrite = () => {
    setConfirmDel(false);
    setUploadErr('');
    setView('write');
  };

  const cancelWrite = () => {
    setDraft(pageContent);
    setDraftImages(pageImages);
    setConfirmDel(false);
    setUploadErr('');
    setView('read');
  };

  const pickImage = () => fileRef.current?.click();

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同一张图重选也要能触发
    if (!file) return;
    setUploading(true);
    setUploadErr('');
    try {
      const up = await uploadImage(file);
      setDraftImages((arr) => [...arr, up.url].slice(0, MAX_IMAGES));
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    const text = draft.trim();
    const images = draftImages;
    if (!page) return;
    if (!text && images.length === 0) return;
    if (page.pair) {
      // 情侣本：只写「我这半」，他的那半不动
      if (page.pair.mine) patchEntry(page.pair.mine.id, { content: text, images });
      else addEntry({ date: page.date, author: 'me', content: text, images, bookId: book.id });
    } else if (page.entry?.id === '__today__') {
      addEntry({ date: today, author: 'me', content: text, images, bookId: book.id });
      setIndex(flat.length - 1);
    } else if (page.entry) {
      patchEntry(page.entry.id, { content: text, images });
    }
    setView('read');
    setConfirmDel(false);
  };

  const delPage = () => {
    if (!canDeletePage || !myEntry) return;
    if (!confirmDel) {
      setConfirmDel(true);
      window.setTimeout(() => setConfirmDel(false), 3000);
      return;
    }
    removeEntry(myEntry.id);
    setConfirmDel(false);
    setView('read');
    setIndex(Math.max(0, ci - 1));
  };

  // 锁屏优先：解锁 / 撬锁后才给看本子
  if (gate === 'locked') {
    return createPortal(
      <BookLock
        book={book}
        onUnlock={() => setGate('open')}
        onSneak={() => {
          setSneak(true);
          setGate('open');
        }}
        onClose={onClose}
      />,
      document.body,
    );
  }

  // ---- 编写页（独立一层，退出即回翻页阅读）----
  if (view === 'write') {
    const { md, y } = splitDate(page?.date ?? today);
    const canSave = draft.trim().length > 0 || draftImages.length > 0;
    return createPortal(
      <div className="fixed inset-0 z-[1300] flex flex-col bg-page-bg" data-testid="diary-write">
        <header className="flex items-center gap-2 px-3 pb-1 pt-3">
          <button type="button" onClick={cancelWrite} aria-label="返回翻页" className="icon-btn">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="eyebrow leading-none">{canDeletePage ? 'EDIT' : 'WRITE'}</div>
            <div className="mt-0.5 truncate text-sm font-medium text-foreground">
              {book.name} · {md}
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            data-testid="diary-write-save"
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition enabled:hover:opacity-90 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            保存
          </button>
        </header>

        {/* 纸页大小固定，写多了在纸里往下滚，纸本身不会被撑长 */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-2">
          <div
            className={`relative flex flex-col overflow-hidden rounded-lg shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)] ${PAPER_CLASS}`}
            style={{ width: readBox.current.w, height: readBox.current.h }}
            data-testid="diary-write-paper"
          >
            <PaperTexture
              w={readBox.current.w}
              h={readBox.current.h}
              r={8}
              seed="write-page"
              rules
              ruleTop={88}
              ruleGap={31}
              margin={15}
            />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-baseline gap-2 px-5 pb-1 pt-4">
              <span className="text-xl leading-none text-ink" style={{ fontFamily: HAND_FONT }}>
                {md}
              </span>
              <span className="text-xs text-ink/40">{y}</span>
              <span className="ml-auto text-[11px] text-ink/40" style={{ fontFamily: HAND_FONT }}>
                {couple ? '我' : '我'}
              </span>
            </div>

            {/* 这一面的图片：先加图再写字，或者只放图也行 */}
            <div className="flex shrink-0 flex-wrap gap-2 px-5 pb-2 pt-1" data-testid="diary-write-images">
              {draftImages.map((url) => (
                <div key={url} className="relative h-14 w-14 overflow-hidden rounded-md bg-ink/[0.06]">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setDraftImages((arr) => arr.filter((u) => u !== url))}
                    aria-label="移除这张图"
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-[2px]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {draftImages.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={pickImage}
                  disabled={uploading}
                  data-testid="diary-write-add-image"
                  aria-label="添加图片"
                  className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-ink/25 text-ink/45 transition enabled:hover:border-ink/45 enabled:hover:text-ink/70 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-4 w-4" />
                      <span className="text-[10px]">加图片</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickImage}
              data-testid="diary-write-file"
            />
            {uploadErr && <p className="shrink-0 px-5 pb-1 text-[11px] text-rose-500">{uploadErr}</p>}

            <div className="relative min-h-0 flex-1 px-5 pb-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="今天……写点什么吧"
                data-testid="diary-write-textarea"
                className="h-full w-full resize-none bg-transparent text-[17px] text-ink outline-none placeholder:text-ink/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ fontFamily: HAND_FONT, lineHeight: '31px', paddingTop: 2 }}
              />
              {/* 纸就这么大：写多了在纸里往下滚，末尾给个淡出 */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 bottom-4 h-8 bg-gradient-to-t from-[#fdfbf6] to-transparent dark:from-[#221f1c]"
              />
            </div>
            </div>
          </div>
        </div>

        {canDeletePage && (
          <footer className="flex shrink-0 items-center justify-center pb-3">
            <button
              type="button"
              onClick={delPage}
              data-testid="diary-write-delete"
              className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDel ? '再点一次，确认删掉这页' : '删除这页'}
            </button>
          </footer>
        )}
      </div>,
      document.body,
    );
  }

  // ---- 翻页阅读 ----
  const flipTransform = (offset: number) => {
    if (flipping === 'next' && offset === 0) return 'rotateY(-180deg)';
    if (flipping === 'prev' && offset === -1) return 'rotateY(0deg)';
    if (flipping === 'next' && offset === 1) return 'rotateY(0deg)';
    if (flipping === 'prev' && offset === 0) return 'rotateY(-180deg)';
    if (drag.current && offset === 0) return `rotateY(${dragAngle}deg)`;
    return 'rotateY(0deg)';
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex flex-col items-center justify-center bg-page-bg px-3"
      onClick={onClose}
      data-sneak={sneak ? '1' : '0'}
      data-testid="diary-deck"
    >
      <div className="flex h-full w-full max-w-[440px] flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 顶栏（开本动画期间淡出） */}
        <div
          className={`flex shrink-0 items-center justify-between gap-2 px-1 pb-1 pt-2 transition-opacity duration-300 ${
            opening === 'open' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="合上本子"
            className="icon-btn shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
          <span
            className="max-w-[45%] truncate text-sm font-medium text-foreground"
            style={{ fontFamily: HAND_FONT }}
          >
            {book.name}
          </span>
          {canWrite ? (
            <button type="button" onClick={startWrite} data-testid="diary-deck-write" className="shrink-0">
              <InkBorder
                className="text-ink/25 dark:text-ink/30"
                seed="deck-write"
                amp={1.1}
                strokeWidth={1.2}
              >
                <span className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-foreground transition hover:bg-surface-2">
                  <PenLine className="h-3.5 w-3.5" />
                  {deckBtnLabel}
                </span>
              </InkBorder>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSlipEdit({})}
              data-testid="diary-deck-slip"
              className="shrink-0"
            >
              <InkBorder
                className="text-ink/25 dark:text-ink/30"
                seed="deck-slip"
                amp={1.1}
                strokeWidth={1.2}
              >
                <span className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-foreground transition hover:bg-surface-2">
                  <StickyNote className="h-3.5 w-3.5" />
                  夹张小纸条
                </span>
              </InkBorder>
            </button>
          )}
        </div>

        {/* 页码：像参考图那样浮在书页正上方居中，外面套一圈手画的框 */}
        <div className="flex shrink-0 items-center justify-center pb-1">
          <InkBorder
            className={`text-ink/20 transition-opacity duration-300 dark:text-ink/25 ${
              opening === 'open' ? 'opacity-100' : 'opacity-0'
            }`}
            seed="pager"
            amp={0.85}
            strokeWidth={1.1}
            laps={1}
            r={14}
          >
            <span
              className="block px-3 py-1 text-[11px] tabular-nums tracking-[0.18em] text-muted-foreground"
              data-testid="diary-deck-pager"
            >
              {ci + 1} / {flat.length}
            </span>
          </InkBorder>
        </div>

        {/* 书区（带开本动画）：书壳 + 页块厚度 + 一页纸，翻页按钮贴在书下面 */}
        <div
          className={`relative flex min-h-0 flex-1 select-none flex-col items-center justify-center gap-4 ${
            opening === 'open' ? '' : 'pointer-events-none'
          }`}
        >
          <div
            className="relative"
            style={{
              width: coverW,
              height: coverH,
              perspective: '1600px',
              touchAction: 'pan-y',
              transform: `scale(${opening === 'closed' ? 0.62 : opening === 'opening' ? 0.82 : 1}) rotateY(${
                opening === 'closed' ? -28 : opening === 'opening' ? -8 : 0
              }deg)`,
              opacity: opening === 'closed' ? 0.2 : opening === 'opening' ? 0.6 : 1,
              transition: 'transform 600ms cubic-bezier(0.34, 1.2, 0.64, 1), opacity 300ms ease',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* 书壳：封皮色（也支持换成图片） */}
            <div
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-[18px]"
              data-testid="diary-deck-cover"
              style={{
                background: book.cover,
                backgroundImage: book.coverImage ? `url(${book.coverImage})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxShadow: '0 26px 50px -26px rgba(0,0,0,0.62), inset 0 0 0 1px rgba(255,255,255,0.16)',
              }}
            >
              {/* 书脊 + 封面压出的暗边 */}
              <div
                className="absolute inset-y-0 left-0 w-[16px]"
                style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.34), rgba(0,0,0,0))' }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.06) 62%, rgba(0,0,0,0.16))',
                }}
              />
              {/* 书脊压槽：手画的两道竖线，一眼看出是装订过的一本书 */}
              <svg
                className="absolute inset-0"
                width={coverW}
                height={coverH}
                viewBox={`0 0 ${coverW} ${coverH}`}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              >
                <path
                  d={inkLine(19, 14, 19, coverH - 16, { seed: 'spine-a', amp: 1 })}
                  stroke="rgba(0,0,0,0.38)"
                  strokeWidth={1.3}
                />
                <path
                  d={inkLine(22.5, 18, 22.5, coverH - 20, { seed: 'spine-b', amp: 0.9 })}
                  stroke="rgba(255,255,255,0.32)"
                  strokeWidth={0.9}
                />
              </svg>
              {/* 封皮压边：手画的内框，像真的压过一道印 */}
              <InkRect
                w={coverW}
                h={coverH}
                r={16}
                seed="cover-edge"
                amp={1.3}
                strokeWidth={1.4}
                className="text-black/30"
              />
            </div>

            {/* 页块厚度：三层纸边露在纸页右侧、下方（每层歪一点点，像一沓没码齐的纸） */}
            {PAGE_EDGES.map((off, i) => (
              <div
                key={off}
                aria-hidden
                className="absolute rounded-[7px] bg-[#f7f0e2] dark:bg-[#302b26]"
                style={{
                  left: BOOK_PAD.left + off,
                  top: BOOK_PAD.top + off,
                  width: box.w,
                  height: box.h,
                  boxShadow: 'inset -1px -1px 0 rgba(120,110,95,0.22)',
                  transform: `rotate(${(i + 1) * 0.06}deg)`,
                }}
              />
            ))}

            {/* 纸页：大小固定，内容再长也不变 */}
            <div
              className="absolute"
              style={{ left: BOOK_PAD.left, top: BOOK_PAD.top, width: box.w, height: box.h }}
            >
              {flat.map((p, i) => {
                const offset = i - ci;
                if (Math.abs(offset) > 1) return null;
                const isCurrent = offset === 0;
                const clickable = isCurrent && opening === 'open' && !flipping;
                return (
                  <div
                    key={`${p.key}-${p.slice ?? 0}`}
                    data-current={isCurrent ? '1' : '0'}
                    className={`absolute inset-0 overflow-hidden ${PAPER_CLASS} ${
                      clickable ? 'cursor-pointer' : ''
                    }`}
                    style={{
                      transform: flipTransform(offset),
                      transformOrigin: 'left center',
                      transformStyle: 'preserve-3d',
                      backfaceVisibility: 'hidden',
                      boxShadow: isCurrent
                        ? '0 18px 34px -22px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(120,110,95,0.10)'
                        : '0 10px 24px -20px rgba(0,0,0,0.4)',
                      zIndex: isCurrent ? 10 : 5,
                      borderRadius: 6,
                    }}
                    onClick={() => clickable && onOpenReader(p)}
                  >
                    {p.pair ? (
                      <CouplePageFace
                        day={p.pair}
                        box={box}
                        slice={p.slice ?? 0}
                        onPages={(n) =>
                          setSlices((s) => (s[p.key] === n ? s : { ...s, [p.key]: n }))
                        }
                      />
                    ) : p.entry ? (
                      <DiaryPageFace
                        entry={p.entry}
                        box={box}
                        slice={p.slice ?? 0}
                        onPages={(n) =>
                          setSlices((s) => (s[p.key] === n ? s : { ...s, [p.key]: n }))
                        }
                        slips={slipsOf(p.date)}
                        onSlipClick={(s) => setSlipEdit({ slip: s })}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 翻页按钮：就在书下面，不压纸页；圈是手画的 */}
          <div className="flex shrink-0 items-center justify-center gap-6">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => startFlip('prev')}
              aria-label="上一页"
              className="relative flex h-9 w-9 items-center justify-center text-ink/30 transition enabled:hover:text-ink/60 disabled:opacity-25"
            >
              <InkRing size={36} seed="prev-btn" amp={1} strokeWidth={1.2} className="text-current" />
              <ChevronLeft className="relative h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => startFlip('next')}
              aria-label="下一页"
              className="relative flex h-9 w-9 items-center justify-center text-ink/30 transition enabled:hover:text-ink/60 disabled:opacity-25"
            >
              <InkRing size={36} seed="next-btn" amp={1} strokeWidth={1.2} className="text-current" />
              <ChevronRight className="relative h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* 底部提示 */}
        <div
          className={`shrink-0 pb-1 text-center text-[11px] text-muted-foreground/70 transition-opacity duration-300 ${
            opening === 'open' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {!canWrite
            ? '左右滑动翻页 · 点纸条看全文 · 右上角「夹张小纸条」'
            : couple
              ? '左右滑动翻页 · 一天一页 · 点这一页放大'
              : '左右滑动翻页 · 点这一页放大 · 右上角「写日记」'}
        </div>

        {/* 开本动画期间的小本封面 */}
        {opening !== 'open' && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center" aria-hidden>
            <div style={{ width: 120, height: 150, transform: 'rotateY(-8deg)' }}>
              <BookCover book={book} compact className="h-full w-full" />
            </div>
          </div>
        )}

        {/* 小纸条编辑器（TA 的日记专用；放在 stopPropagation 里面，点它不会把本子关掉） */}
        {slipEdit && (
          <SlipEditor
            slip={slipEdit.slip}
            date={slipEdit.slip?.date ?? page?.date ?? today}
            onSave={(content, color) => {
              const existing = slipEdit.slip;
              if (existing) {
                patchSlip(existing.id, { content, color });
              } else {
                addSlip({
                  bookId: book.id,
                  date: page?.date ?? today,
                  content,
                  color,
                });
              }
              setSlipEdit(null);
            }}
            onDelete={
              slipEdit.slip
                ? () => {
                    removeSlip(slipEdit.slip!.id);
                    setSlipEdit(null);
                  }
                : undefined
            }
            onClose={() => setSlipEdit(null)}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Check, RotateCcw, PenLine } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { DiaryPageFace, PAPER_CLASS } from './DiaryPageFace';
import { useDiaryStore } from './diaryStore';

interface Props {
  book: DiaryBook;
  entries: DiaryEntry[];
  /** 日历深链：打开本子后定位到这一天 */
  focusDate?: string | null;
  /** 一打开就进编写态（右上角「去记录」/ 日历「去记日记」深链），默认只翻开阅读 */
  startEditing?: boolean;
  onClose: () => void;
  onOpenReader: (entry: DiaryEntry) => void;
}

/** 今天的 YYYY-MM-DD */
function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/**
 * Paper 式翻页日记本：
 * - 打开本子 → 落在今天那页的「阅读态」，不自动进入编写
 * - 左右拖拽 / 按钮翻页，3D rotateY 翻页动画；阅读态点页 → 全屏阅读器（onOpenReader）
 * - 右上角「去记录」→ 翻到今天那页并进入编写态（startEditing=true 时一打开就编写）
 */
export function BookDeck({ book, entries, focusDate, startEditing = false, onClose, onOpenReader }: Props) {
  const patchEntry = useDiaryStore((s) => s.patchEntry);
  const addEntry = useDiaryStore((s) => s.addEntry);

  // 本子内的页：按日期升序（从过去翻到现在）
  const pages = useMemo(
    () => entries.filter((e) => (e.bookId ?? 'book-me') === book.id).sort((a, b) => a.date.localeCompare(b.date)),
    [entries, book.id],
  );

  const today = todayISO();
  const lastPage = pages[pages.length - 1];
  const todayIsBlank = !lastPage || lastPage.date !== today;

  // 页栈：真实日记页 + 末尾的「今天」页（空白则暂存）
  const stack: DiaryEntry[] = useMemo(() => {
    const base = pages;
    if (todayIsBlank) {
      return [...base, { id: '__today__', date: today, author: 'me', content: '', bookId: book.id }];
    }
    return base;
  }, [pages, todayIsBlank, today, book.id]);

  // 打开时落到最后一页（今天）；有 focusDate 则定位那天。默认一律阅读态，只有显式「去记录」才编写
  const focusAt = focusDate ? stack.findIndex((p) => p.date === focusDate) : -1;
  const [index, setIndex] = useState(focusAt >= 0 ? focusAt : stack.length - 1);
  const [editing, setEditing] = useState(startEditing && focusAt < 0);
  const [draft, setDraft] = useState(stack[focusAt >= 0 ? focusAt : stack.length - 1]?.content ?? '');

  // 翻页动画
  const [flipping, setFlipping] = useState<null | 'next' | 'prev'>(null);
  const drag = useRef<{ startX: number; dx: number } | null>(null);
  const [dragAngle, setDragAngle] = useState(0);

  // ---- 开本动画（照 Ardot 8:178 三帧分镜：合着的小本 → 整页翻 → 推近到一页）----
  // 'closed' 合着 → 'opening' 翻开中 → 'open' 已打开（0.65s 一口气播完）
  const [opening, setOpening] = useState<'closed' | 'opening' | 'open'>('closed');
  useEffect(() => {
    // 合着停留片刻 → 整页翻 → 推近
    const t1 = setTimeout(() => setOpening('opening'), 60);
    const t2 = setTimeout(() => setOpening('open'), 650);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // 三帧插值：closed(缩0.62/旋-28°/透明0.2) → opening(0.82/-8°/0.6) → open(1/0°/1)
  const OPEN_KEYS: Record<'closed' | 'opening' | 'open', [number, number, number]> = {
    closed: [0.62, -28, 0.2],
    opening: [0.82, -8, 0.6],
    open: [1, 0, 1],
  };
  const [openScale, openRotateY, openOpacity] = OPEN_KEYS[opening];

  const page = stack[index];
  const canNext = index < stack.length - 1;
  const canPrev = index > 0;

  // 当前页内容变化时同步草稿（翻到新页）
  const pageId = page?.id;
  const pageContent = page?.content ?? '';
  const [syncedId, setSyncedId] = useState<string | undefined>(undefined);
  if (syncedId !== pageId) {
    setSyncedId(pageId);
    setDraft(pageContent);
  }

  const startFlip = (dir: 'next' | 'prev') => {
    if (flipping) return;
    setFlipping(dir);
    // 动画结束后真正翻页
    setTimeout(() => {
      setIndex((i) => (dir === 'next' ? i + 1 : i - 1));
      setFlipping(null);
    }, 480);
  };

  // ---- 拖拽翻页 ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (flipping) return;
    drag.current = { startX: e.clientX, dx: 0 };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dx = e.clientX - drag.current.startX;
    // 翻下一页：向左拖（负值）→ 当前页从 0 → -180
    // 翻上一页：向右拖（正值）→ 新页从 180 → 0（等价当前页 -180 → 0 再翻）
    const w = Math.min(window.innerWidth - 48, 420) / 2;
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
    const w = Math.min(window.innerWidth - 48, 420) / 2;
    if (dx < -w * 0.4 && canNext) startFlip('next');
    else if (dx > w * 0.4 && canPrev) startFlip('prev');
  };

  // 右上角「去记录」：直接翻到今天那页并进入编写态
  const goWrite = () => {
    if (flipping) return;
    setIndex(stack.length - 1);
    setEditing(true);
  };

  // 保存今天这页
  const saveToday = () => {
    const text = draft.trim();
    if (page.id === '__today__') {
      if (!text) {
        setEditing(false);
        return;
      }
      addEntry({ date: today, author: 'me', content: text, bookId: book.id });
    } else {
      if (text !== page.content) patchEntry(page.id, { content: text });
    }
    setEditing(false);
  };

  // ---- 渲染 ----
  const flipTransform = (offset: number) => {
    // offset: 页相对当前的位置（当前=0，下一页=+1，上一页=-1）
    if (flipping === 'next' && offset === 0) return 'rotateY(-180deg)';
    if (flipping === 'prev' && offset === -1) return 'rotateY(0deg)';
    if (flipping === 'next' && offset === 1) return 'rotateY(0deg)';
    if (flipping === 'prev' && offset === 0) return 'rotateY(-180deg)';
    if (drag.current) {
      // 拖拽时给当前页一个过渡角度（翻下一页时）
      if (offset === 0) return `rotateY(${dragAngle}deg)`;
    }
    return 'rotateY(0deg)';
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex flex-col items-center justify-center bg-page-bg px-3"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-sm flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏（开本动画期间淡出） */}
        <div
          className={`flex items-center justify-between px-1 pb-2 transition-opacity duration-300 ${
            opening === 'open' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="合上本子"
            className="icon-btn"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-serif text-sm font-medium text-foreground">{book.name}</span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-white"
              style={{ background: book.cover }}
            >
              {index + 1} / {stack.length}
            </span>
          </div>
          {editing ? (
            <div className="w-[76px] shrink-0" />
          ) : (
            <button
              type="button"
              onClick={goWrite}
              aria-label="去记录"
              data-testid="diary-deck-go-write"
              className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-page-line bg-page-bg px-2.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
            >
              <PenLine className="h-3.5 w-3.5" />
              去记录
            </button>
          )}
        </div>

        {/* 翻页区（带开本动画） */}
        <div
          className={`relative flex-1 select-none overflow-hidden ${
            opening === 'open' ? '' : 'pointer-events-none'
          }`}
          style={{
            perspective: '1400px',
            transform: `scale(${openScale}) rotateY(${openRotateY}deg)`,
            opacity: openOpacity,
            transition: 'transform 600ms cubic-bezier(0.34, 1.2, 0.64, 1), opacity 300ms ease',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* 开本动画期间的小本封面（分镜① 合着的小本） */}
          {opening !== 'open' && (
            <div
              className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
              aria-hidden
            >
              <div
                className="rounded-md shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
                style={{
                  width: 120,
                  height: 150,
                  background: book.cover,
                  transform: 'rotateY(-8deg)',
                }}
              />
            </div>
          )}
          {/* 页栈：后面的页先画，当前页在最上 */}
          {stack.map((p, i) => {
            const offset = i - index;
            // 只渲染相邻几页，避免堆积
            if (Math.abs(offset) > 1) return null;
            const isCurrent = offset === 0;
            const clickable = !editing && isCurrent && opening === 'open';
            return (
              <div
                key={`${p.id}-${i}`}
                className={`absolute inset-0 transition-transform duration-[480ms] ease-[cubic-bezier(0.4,0.2,0.2,1)] ${
                  PAPER_CLASS
                } ${clickable ? 'cursor-pointer' : ''}`}
                style={{
                  transform: flipTransform(offset),
                  transformStyle: 'preserve-3d',
                  boxShadow: isCurrent
                    ? '0 20px 40px -24px rgba(0,0,0,0.5)'
                    : '0 12px 28px -22px rgba(0,0,0,0.45)',
                  zIndex: isCurrent ? 10 : 5,
                  borderRadius: 6,
                }}
                onClick={() => clickable && onOpenReader(p)}
              >
                <DiaryPageFace
                  entry={p}
                  editing={isCurrent && editing}
                  draftContent={isCurrent ? draft : undefined}
                  onDraftChange={setDraft}
                  footer={
                    isCurrent && editing ? (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditing(false)}
                          className="flex h-9 items-center gap-1 rounded-lg bg-muted/60 px-3 text-sm text-muted-foreground transition hover:bg-muted"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          翻回去
                        </button>
                        <button
                          type="button"
                          onClick={saveToday}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
                        >
                          <Check className="h-4 w-4" />
                          {page.id === '__today__' ? '记下今天' : '保存'}
                        </button>
                      </div>
                    ) : undefined
                  }
                />
              </div>
            );
          })}

          {/* 翻页按钮（移动端兜底）：z-20 压在纸页之上，否则被 z-10 的纸盖住看不见也点不到；
              编辑态隐藏，免得盖住「记下今天」 */}
          {!editing && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center gap-4">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => startFlip('prev')}
                aria-label="上一页"
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-page-bg text-muted-foreground transition enabled:hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => startFlip('next')}
                aria-label="下一页"
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-page-bg text-muted-foreground transition enabled:hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* 底部提示（开本动画期间隐藏） */}
        <div
          className={`py-2 text-center text-[11px] text-muted-foreground/70 transition-opacity duration-300 ${
            opening === 'open' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {editing ? '写下今天，然后翻回去看看从前' : '左右滑动翻页 · 点这一页阅读 · 右上角「去记录」开写'}
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Check, PenLine, Trash2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { HAND_FONT, HAND_RULE_BG } from './diaryData';
import { DiaryPageFace, PAPER_CLASS } from './DiaryPageFace';
import { useDiaryStore } from './diaryStore';
import { BookLock } from './BookLock';

interface Props {
  book: DiaryBook;
  entries: DiaryEntry[];
  /** 日历深链：打开本子后定位到这一天 */
  focusDate?: string | null;
  /** 一打开就进编写页（右上角「去记录」/ 日历「去记日记」深链），默认翻页阅读 */
  startEditing?: boolean;
  onClose: () => void;
  onOpenReader: (entry: DiaryEntry) => void;
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

/**
 * 本子详情（2026-11-13 三态）：
 *   锁屏（仅上锁本）→ 翻页阅读 → 编写页
 *
 * - 打开默认是「翻页阅读」：Paper 式横向翻页，可拖拽/按钮翻，点当前页放大（只读）
 * - 只有右上角按钮能进编写页；保存或返回都回到这页的翻页阅读
 * - 上锁的本子先过锁屏：4 位密码正常解锁；长按锁孔 2.6 秒是「撬锁」，偷偷看完仍保持上锁
 */
export function BookDeck({ book, entries, focusDate, startEditing = false, onClose, onOpenReader }: Props) {
  const patchEntry = useDiaryStore((s) => s.patchEntry);
  const addEntry = useDiaryStore((s) => s.addEntry);
  const removeEntry = useDiaryStore((s) => s.removeEntry);

  // 锁门：本次会话有效，退出本子再进要重新开
  const [gate, setGate] = useState<'locked' | 'open'>(book.locked ? 'locked' : 'open');
  const [sneak, setSneak] = useState(false);
  const [view, setView] = useState<'read' | 'write'>(startEditing ? 'write' : 'read');

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

  const focusAt = focusDate ? stack.findIndex((p) => p.date === focusDate) : -1;
  const [index, setIndex] = useState(focusAt >= 0 ? focusAt : stack.length - 1);
  const [draft, setDraft] = useState(stack[focusAt >= 0 ? focusAt : stack.length - 1]?.content ?? '');
  const [syncedId, setSyncedId] = useState<string | undefined>(undefined);
  const [confirmDel, setConfirmDel] = useState(false);

  // 翻页动画
  const [flipping, setFlipping] = useState<null | 'next' | 'prev'>(null);
  const drag = useRef<{ startX: number; dx: number } | null>(null);
  const [dragAngle, setDragAngle] = useState(0);

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

  // 页被删 / 今天页转正后，index 别越界
  useEffect(() => {
    if (index > stack.length - 1) setIndex(Math.max(0, stack.length - 1));
  }, [stack.length, index]);

  const page = stack[Math.min(index, Math.max(stack.length - 1, 0))];
  const pageId = page?.id;
  const pageContent = page?.content ?? '';

  // 翻到新页时把草稿同步成那页内容
  if (syncedId !== pageId) {
    setSyncedId(pageId);
    setDraft(pageContent);
  }

  const canNext = index < stack.length - 1;
  const canPrev = index > 0;
  const isTodayPage = page?.id === '__today__' || page?.date === today;

  const startFlip = (dir: 'next' | 'prev') => {
    if (flipping || view !== 'read' || gate !== 'open') return;
    setFlipping(dir);
    setTimeout(() => {
      setIndex((i) => (dir === 'next' ? i + 1 : i - 1));
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

  // ---- 编写 ----
  const startWrite = () => {
    setConfirmDel(false);
    setView('write');
  };

  const cancelWrite = () => {
    setDraft(page?.content ?? '');
    setConfirmDel(false);
    setView('read');
  };

  const save = () => {
    const text = draft.trim();
    if (!text || !page) return;
    if (page.id === '__today__') {
      addEntry({ date: today, author: 'me', content: text, bookId: book.id });
      setIndex(stack.length - 1);
    } else {
      patchEntry(page.id, { content: text });
    }
    setView('read');
    setConfirmDel(false);
  };

  const delPage = () => {
    if (!page || page.id === '__today__') return;
    if (!confirmDel) {
      setConfirmDel(true);
      window.setTimeout(() => setConfirmDel(false), 3000);
      return;
    }
    removeEntry(page.id);
    setConfirmDel(false);
    setView('read');
    setIndex((i) => Math.max(0, i - 1));
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
    return createPortal(
      <div className="fixed inset-0 z-[1300] flex flex-col bg-page-bg" data-testid="diary-write">
        <header className="flex items-center gap-2 px-3 pb-2 pt-3">
          <button type="button" onClick={cancelWrite} aria-label="返回翻页" className="icon-btn">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="eyebrow leading-none">{isTodayPage ? 'WRITE' : 'EDIT'}</div>
            <div className="mt-0.5 truncate text-sm font-medium text-foreground">
              {book.name} · {md}
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim()}
            data-testid="diary-write-save"
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition enabled:hover:opacity-90 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            保存
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-3">
          <div
            className={`mx-auto flex min-h-[calc(100dvh-190px)] max-w-sm flex-col rounded-lg shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)] ${PAPER_CLASS}`}
            data-testid="diary-write-paper"
          >
            <div className="flex flex-1 flex-col px-5 pb-4 pt-5">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-2xl leading-none text-ink" style={{ fontFamily: HAND_FONT }}>
                  {md}
                </span>
                <span className="text-xs text-ink/40">{y}</span>
              </div>
              <div className="mb-3 text-sm text-ink/50" style={{ fontFamily: HAND_FONT }}>
                我
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="今天……写点什么吧"
                data-testid="diary-write-textarea"
                className="min-h-[46vh] w-full flex-1 resize-none bg-transparent text-[17px] text-ink outline-none placeholder:text-ink/30"
                style={{
                  fontFamily: HAND_FONT,
                  lineHeight: '31px',
                  backgroundImage: HAND_RULE_BG,
                  backgroundAttachment: 'local',
                  paddingTop: 5,
                }}
              />
            </div>
          </div>
        </div>

        {!isTodayPage && (
          <footer className="flex items-center justify-center pb-4">
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
      <div className="flex h-full w-full max-w-sm flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 顶栏（开本动画期间淡出） */}
        <div
          className={`flex items-center justify-between gap-2 px-1 pb-2 transition-opacity duration-300 ${
            opening === 'open' ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button type="button" onClick={onClose} aria-label="合上本子" className="icon-btn shrink-0">
            <X className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground" style={{ fontFamily: HAND_FONT }}>
              {book.name}
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-white"
              style={{ background: book.cover }}
            >
              {index + 1} / {stack.length}
            </span>
          </div>
          <button
            type="button"
            onClick={startWrite}
            data-testid="diary-deck-write"
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-page-line bg-page-bg px-2.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
          >
            <PenLine className="h-3.5 w-3.5" />
            {isTodayPage ? '写日记' : '改这页'}
          </button>
        </div>

        {/* 翻页区（带开本动画） */}
        <div
          className={`relative flex-1 select-none overflow-hidden ${
            opening === 'open' ? '' : 'pointer-events-none'
          }`}
          style={{
            perspective: '1600px',
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
          {/* 开本动画期间的小本封面 */}
          {opening !== 'open' && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center" aria-hidden>
              <div
                className="rounded-md shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
                style={{ width: 120, height: 150, background: book.cover, transform: 'rotateY(-8deg)' }}
              />
            </div>
          )}

          {/* 页栈：后面的页先画，当前页在最上 */}
          {stack.map((p, i) => {
            const offset = i - index;
            if (Math.abs(offset) > 1) return null;
            const isCurrent = offset === 0;
            const clickable = isCurrent && opening === 'open' && !flipping;
            return (
              <div
                key={`${p.id}-${i}`}
                data-current={isCurrent ? '1' : '0'}
                className={`absolute inset-0 transition-transform duration-[480ms] ease-[cubic-bezier(0.4,0.2,0.2,1)] ${
                  PAPER_CLASS
                } ${clickable ? 'cursor-pointer' : ''}`}
                style={{
                  transform: flipTransform(offset),
                  transformOrigin: 'left center',
                  transformStyle: 'preserve-3d',
                  backfaceVisibility: 'hidden',
                  boxShadow: isCurrent
                    ? '0 20px 40px -24px rgba(0,0,0,0.5)'
                    : '0 12px 28px -22px rgba(0,0,0,0.45)',
                  zIndex: isCurrent ? 10 : 5,
                  borderRadius: 6,
                }}
                onClick={() => clickable && onOpenReader(p)}
              >
                <DiaryPageFace entry={p} />
              </div>
            );
          })}

          {/* 翻页按钮：z-20 压在纸页之上；只有阅读态才出现 */}
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
        </div>

        {/* 底部提示 */}
        <div
          className={`py-2 text-center text-[11px] text-muted-foreground/70 transition-opacity duration-300 ${
            opening === 'open' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          左右滑动翻页 · 点这一页放大 · 右上角「写日记」
        </div>
      </div>
    </div>,
    document.body,
  );
}

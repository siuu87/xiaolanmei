import { useEffect, useRef, useState } from 'react';
import { Plus, Lock, Settings2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { BOOK_KIND_LABEL, HAND_FONT } from './diaryData';
import { BookSheet, kindIcon, type BookDraft } from './BookSheet';

interface Props {
  books: DiaryBook[];
  entries: DiaryEntry[];
  onOpen: (book: DiaryBook) => void;
  onAdd: (b: BookDraft) => void;
  onPatch: (id: string, patch: Partial<BookDraft>) => void;
  onRemove: (id: string) => void;
}

/** 一本书的日记页数 */
function countOf(entries: DiaryEntry[], bookId: string): number {
  return entries.filter((e) => (e.bookId ?? 'book-me') === bookId).length;
}

/**
 * 本子选择页（2026-11-13）：横向滑动的书架。
 * - 一屏一本，scroll-snap 居中，左右滑动切换；桌面可点指示点
 * - 点封面进详情（上锁的先进锁屏）；封面下方「设置」改名字/封面/上锁
 * - 最后一格是新建
 */
export function BookShelf({ books, entries, onOpen, onAdd, onPatch, onRemove }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<DiaryBook | 'new' | null>(null);
  const inited = useRef(false);

  // 卡片 248 宽 → 容器左右各留 (50% - 124px)，scrollLeft=0 时第一张就居中
  useEffect(() => {
    if (inited.current || books.length === 0) return;
    inited.current = true;
    scrollerRef.current?.scrollTo({ left: 0 });
    setActive(0);
  }, [books.length]);

  // 用 getBoundingClientRect 算可视中心：offsetLeft 会受外层定位祖先影响，不能直接用
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const center = box.left + box.width / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    el.querySelectorAll<HTMLElement>('[data-shelf-card]').forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive(Math.min(best, Math.max(books.length - 1, 0)));
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    const card = el?.querySelectorAll<HTMLElement>('[data-shelf-card]')[i];
    if (!el || !card) return;
    const box = el.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    el.scrollTo({
      left: el.scrollLeft + (r.left + r.width / 2) - (box.left + box.width / 2),
      behavior: 'smooth',
    });
  };

  const activeSafe = Math.min(active, Math.max(books.length - 1, 0));

  return (
    <div className="space-y-4">
      {/* 小标题 */}
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground">SHELF</span>
        <span className="text-[11px] text-muted-foreground">
          {books.length > 0 ? `${activeSafe + 1} / ${books.length} · 左右滑动` : '还没有本子'}
        </span>
      </div>

      {/* 横向书架 */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-testid="diary-shelf"
        className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-[calc(50%-124px)] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {books.map((b) => {
          const Icon = kindIcon(b.kind);
          return (
            <div key={b.id} data-shelf-card className="w-[248px] shrink-0 snap-center">
              {/* 封面 */}
              <button
                type="button"
                onClick={() => onOpen(b)}
                aria-label={`打开 ${b.name}`}
                data-testid="diary-shelf-book"
                className="group relative block h-[330px] w-full overflow-hidden rounded-lg text-left shadow-[0_18px_40px_-22px_rgba(0,0,0,0.55)] transition-transform duration-300 hover:-translate-y-1"
                style={{ background: b.cover }}
              >
                {/* 封面纸纹 */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0 2px, transparent 2px 9px)',
                  }}
                />
                {/* 书脊暗边 */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-3"
                  style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.32), transparent)' }}
                />
                {/* 书顶高光 */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-4"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.3), transparent)' }}
                />

                {/* 上锁徽标 */}
                {b.locked && (
                  <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 text-white">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                )}

                {/* 封面内容 */}
                <div className="relative flex h-full flex-col justify-between p-5">
                  <Icon className="h-7 w-7 text-white/75" />
                  <div>
                    <div
                      className="text-[26px] font-semibold leading-tight text-white drop-shadow"
                      style={{ fontFamily: HAND_FONT }}
                    >
                      {b.name}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/70">
                      <span>{BOOK_KIND_LABEL[b.kind]}</span>
                      <span className="h-0.5 w-0.5 rounded-full bg-white/50" />
                      <span>{countOf(entries, b.id)} 页</span>
                      {b.locked && (
                        <>
                          <span className="h-0.5 w-0.5 rounded-full bg-white/50" />
                          <span>已上锁</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>

              {/* 设置（移动端没有 hover，常显） */}
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  aria-label={`设置 ${b.name}`}
                  className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  设置
                </button>
              </div>
            </div>
          );
        })}

        {/* 新建 */}
        <div data-shelf-card className="w-[248px] shrink-0 snap-center">
          <button
            type="button"
            onClick={() => setEditing('new')}
            aria-label="新建日记本"
            data-testid="diary-shelf-new"
            className="flex h-[330px] w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-page-line text-muted-foreground transition hover:border-primary/50 hover:text-primary"
          >
            <Plus className="h-8 w-8" />
            <span className="text-sm">新建一本</span>
          </button>
        </div>
      </div>

      {/* 指示点 */}
      {books.length > 1 && (
        <div className="flex justify-center gap-1.5 pt-1">
          {books.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`第 ${i + 1} 本`}
              className={`h-1.5 rounded-full transition-all ${
                i === activeSafe ? 'w-5 bg-foreground' : 'w-1.5 bg-foreground/25'
              }`}
            />
          ))}
        </div>
      )}

      <p className="pt-1 text-center text-[11px] text-muted-foreground/70">
        点封面翻开 · 上锁的本子要先开锁
      </p>

      {editing && (
        <BookSheet
          book={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            if (editing === 'new') onAdd(draft);
            else onPatch(editing.id, draft);
            setEditing(null);
          }}
          onDelete={
            editing !== 'new'
              ? () => {
                  onRemove(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

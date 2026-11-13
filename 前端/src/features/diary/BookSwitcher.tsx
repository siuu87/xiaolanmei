import { createPortal } from 'react-dom';
import { Check, ChevronLeft, Lock, Plus } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { BOOK_KIND_LABEL } from './diaryData';

interface Props {
  books: DiaryBook[];
  currentId: string;
  entries: DiaryEntry[];
  onPick: (book: DiaryBook) => void;
  onAdd: () => void;
  onClose: () => void;
}

/**
 * 换本子（D·LOG 顶部「名字 ⌄」点开）。
 * 整屏不透明：项目规则不许用半透明遮罩，所以这里就是一页纯色列表。
 */
export function BookSwitcher({ books, currentId, entries, onPick, onAdd, onClose }: Props) {
  const countOf = (book: DiaryBook) => {
    const mine = entries.filter((e) => (e.bookId || 'book-me') === book.id);
    if (book.kind === 'couple') return `${new Set(mine.map((e) => e.date)).size} 天`;
    return `${mine.length} 条`;
  };

  return createPortal(
    <div className="fixed inset-0 z-[1400] flex flex-col bg-page-bg" data-testid="diary-book-switcher">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onClose} aria-label="返回" className="icon-btn h-8 w-8">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] tracking-[0.14em] text-muted-foreground">NOTEBOOKS</span>
          <span className="text-[16px] font-semibold text-foreground">换一本</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <div className="flex flex-col gap-2">
          {books.map((b) => {
            const active = b.id === currentId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onPick(b)}
                data-testid={`diary-switch-${b.kind}`}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                  active ? 'bg-secondary' : 'bg-secondary/50'
                }`}
              >
                <span
                  className="h-11 w-9 shrink-0 rounded-[5px] shadow-sm"
                  style={{
                    background: b.coverImage ? `url(${b.coverImage}) center/cover` : b.cover,
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1 truncate text-[14px] font-semibold text-foreground">
                    {b.name}
                    {b.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {b.name.trim() === BOOK_KIND_LABEL[b.kind] ? countOf(b) : `${BOOK_KIND_LABEL[b.kind]} · ${countOf(b)}`}
                  </span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-foreground" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onAdd}
            data-testid="diary-switch-new"
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-page-line py-3 text-[13px] text-muted-foreground"
          >
            <Plus className="h-4 w-4" />
            新建一本
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

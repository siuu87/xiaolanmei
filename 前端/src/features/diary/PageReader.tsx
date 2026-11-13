import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookText, User2, Users2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { BOOK_KIND_LABEL } from './diaryData';
import { DiaryPageFace, PAPER_CLASS } from './DiaryPageFace';

interface Props {
  entry: DiaryEntry;
  book: DiaryBook;
  onClose: () => void;
}

const kindIcon = { me: BookText, partner: User2, couple: Users2 } as const;

/**
 * 点某一页进入的全屏阅读器（2026-11-13 起只读）：
 * 整页手写纸面、上下滑动看长文。编写统一走本子右上角按钮，这里不再提供编辑/删除。
 */
export function PageReader({ entry, book, onClose }: Props) {
  const Icon = kindIcon[book.kind];

  // Esc 关闭（capture 阶段拦截，别让抽屉 Esc 抢）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1350] flex flex-col bg-page-bg" onClick={onClose} data-testid="diary-page-reader">
      <div className="flex h-full w-full max-w-md flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 顶栏：右侧只放日期，编辑入口不在这里 */}
        <header className="sticky top-0 z-10 border-b border-page-line bg-page-bg px-4 py-3">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onClose} aria-label="返回本子" className="icon-btn">
              <X className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-serif text-sm font-medium text-foreground">{book.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">· {BOOK_KIND_LABEL[book.kind]}</span>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{entry.date}</span>
          </div>
        </header>

        {/* 纸面正文 */}
        <div
          className={`mx-3 mb-3 flex-1 overflow-y-auto rounded-xl shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)] ${PAPER_CLASS}`}
        >
          <DiaryPageFace entry={entry} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

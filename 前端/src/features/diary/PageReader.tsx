import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookText, User2, Users2 } from 'lucide-react';
import type { DeckPage, DiaryBook, DiarySlip } from './diaryData';
import { BOOK_KIND_LABEL } from './diaryData';
import { DiaryPageFace, PAPER_CLASS } from './DiaryPageFace';
import { CouplePageFace } from './CouplePageFace';
import { bookPageBox, useViewport } from './pageLayout';

interface Props {
  /** 翻页栈里的一页（情侣本 = 一天，上下两半） */
  page: DeckPage;
  book: DiaryBook;
  /** 这一页上夹着的小纸条 */
  slips?: DiarySlip[];
  onClose: () => void;
}

const kindIcon = { me: BookText, partner: User2, couple: Users2 } as const;

/**
 * 点某一页进入的全屏阅读器（2026-11-13 起只读）：
 * 纸页和本子里一模一样（固定大小、同样比例），长文在纸里上下滚，纸不会被撑长。
 * 编写统一走本子右上角按钮，这里不再提供编辑/删除。
 * 情侣本传进来的是「一天」，这里照样上半他、下半我。
 */
export function PageReader({ page, book, slips = [], onClose }: Props) {
  const Icon = kindIcon[book.kind];
  // 放大阅读也用本子里那张纸的大小，别自己另算一套
  const box = bookPageBox(useViewport());

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
      <div className="flex h-full w-full flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 顶栏：右侧只放日期，编辑入口不在这里 */}
        <header className="shrink-0 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onClose} aria-label="返回本子" className="icon-btn">
              <X className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-serif text-sm font-medium text-foreground">{book.name}</span>
              {BOOK_KIND_LABEL[book.kind] !== book.name && (
                <span className="shrink-0 text-[10px] text-muted-foreground">· {BOOK_KIND_LABEL[book.kind]}</span>
              )}
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{page.date}</span>
          </div>
        </header>

        {/* 纸面：和本子里同样大小的一张纸，上下滚看全文 */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
          <div
            className={`overflow-hidden rounded-lg shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)] ${PAPER_CLASS}`}
            style={{ width: box.w, height: box.h }}
          >
            {page.pair ? (
              <CouplePageFace day={page.pair} box={box} flow="scroll" />
            ) : page.entry ? (
              <DiaryPageFace entry={page.entry} box={box} slips={slips} flow="scroll" />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

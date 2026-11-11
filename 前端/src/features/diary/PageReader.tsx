import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Trash2, CalendarDays, User2, Users2, BookText } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { AUTHOR_LABEL, BOOK_KIND_LABEL } from './diaryData';
import { DiaryPageFace, PAPER_CLASS } from './DiaryPageFace';
import { useDiaryStore } from './diaryStore';

interface Props {
  entry: DiaryEntry;
  book: DiaryBook;
  onClose: () => void;
}

const kindIcon = { me: BookText, partner: User2, couple: Users2 } as const;

/**
 * 点某一页进入的全屏阅读器：
 * - 整页 Paper 纸面，上下滑动看长文
 * - 右上角编辑：改日期 / 改正文 / 删除这页
 */
export function PageReader({ entry, book, onClose }: Props) {
  const patchEntry = useDiaryStore((s) => s.patchEntry);
  const removeEntry = useDiaryStore((s) => s.removeEntry);

  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(entry.date);
  const [content, setContent] = useState(entry.content);
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

  const save = () => {
    const c = content.trim();
    if (!c) return;
    patchEntry(entry.id, { date, content: c });
    setEditing(false);
  };

  const del = () => {
    removeEntry(entry.id);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1350] flex flex-col bg-page-bg"
      onClick={onClose}
    >
      <div className="flex h-full w-full max-w-md flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 顶栏 */}
        <header className="sticky top-0 z-10 border-b border-page-line bg-page-bg/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onClose} aria-label="返回" className="icon-btn">
              <X className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-serif text-sm font-medium text-foreground">
                  {book.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">· {BOOK_KIND_LABEL[book.kind]}</span>
              </div>
            </div>
            {editing ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={del}
                  aria-label="删除这页"
                  className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="h-9 rounded-lg bg-muted/60 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                >
                  <Check className="h-3.5 w-3.5" />
                  保存
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
              >
                编辑
              </button>
            )}
          </div>
        </header>

        {/* 纸面正文 */}
        <div className={`flex-1 overflow-y-auto ${PAPER_CLASS} mx-3 mb-3 rounded-xl shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)]`}>
          {editing ? (
            <div className="px-6 py-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs text-ink/50">
                <CalendarDays className="h-3.5 w-3.5" />
                日期
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 w-full rounded-lg bg-white/70 px-3 text-sm text-ink outline-none ring-1 ring-ink/10 dark:bg-black/30"
              />
              <label className="mb-1.5 mt-4 block text-xs text-ink/50">正文</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="这页写点什么……"
                className="min-h-60 w-full resize-y rounded-lg bg-white/70 px-3 py-2 text-[15px] leading-7 text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/30 dark:bg-black/30"
              />
            </div>
          ) : (
            <DiaryPageFace entry={{ ...entry, date, content }} />
          )}
        </div>

        {/* 底部元信息 */}
        <footer className="px-4 pb-4 text-center text-[11px] text-muted-foreground/60">
          {entry.date} · {AUTHOR_LABEL[entry.author]}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AUTHOR_LABEL, AUTHOR_CLASS, type DiaryEntry } from './diaryData';

interface Props {
  entry: DiaryEntry;
  onClose: () => void;
}

/** 日记详情：几乎占满屏幕的弹窗 */
export function DiaryModal({ entry, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-background/90 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <span className="font-serif text-xs text-muted-foreground">DIARY</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* 日期左上角 → 谁写的 → 正文 */}
          <div className="text-xs text-muted-foreground">{entry.date}</div>
          <div className={cn('mt-1 text-sm font-medium', AUTHOR_CLASS[entry.author])}>
            {AUTHOR_LABEL[entry.author]}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/90">
            {entry.content}
          </p>
        </div>
      </div>
    </div>
  );
}

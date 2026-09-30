import { useState } from 'react';
import { X } from 'lucide-react';
import { useDiaryStore } from './diaryStore';

interface Props {
  initialDate: string; // YYYY-MM-DD
  onClose: () => void;
}

/** 写日记：手动写的一律记为「我」；AI 代写走聊天里的「记日记」直接落库。 */
export function DiaryEditorModal({ initialDate, onClose }: Props) {
  const addEntry = useDiaryStore((s) => s.addEntry);
  const [date, setDate] = useState(initialDate);
  const [content, setContent] = useState('');

  const save = () => {
    const text = content.trim();
    if (!text) return;
    addEntry({ date, author: 'me', content: text });
    onClose();
  };

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
          <span className="font-serif text-xs text-muted-foreground">写日记</span>
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
          {/* 日期 */}
          <label className="mb-1 block text-xs text-muted-foreground">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none focus:bg-muted/80"
          />

          {/* 正文 */}
          <div className="mt-3">
            <label className="mb-1 block text-xs text-muted-foreground">正文</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下今天……"
              className="min-h-40 w-full resize-none rounded-xl bg-muted/60 px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-muted/80"
            />
          </div>
        </div>

        {/* 取消 + 保存 */}
        <div className="flex gap-2 border-t border-border/60 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

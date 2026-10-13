import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { LetterSwiper } from './LetterCard';

/**
 * 全部来信（独立页）：同一套「深夜来信 Live」Daily Card 横向卡片流。
 * 滑动翻阅，点任意一张进沉浸式全屏阅读器 `/letter/:id`。
 */
export function NotesPage() {
  const navigate = useNavigate();
  const notes = useNotesStore((s) => s.notes);
  const readIds = useNotesStore((s) => s.readIds);
  const load = useNotesStore((s) => s.load);

  // 信由后端不定时抓取，这里只保证进来时是最新的
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          aria-label="返回"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-xs text-muted-foreground">MAILBOX · 深夜来信</h1>
      </div>

      <div className="mt-4">
        <LetterSwiper
          notes={notes}
          readIds={readIds}
          onOpen={(id) => navigate(`/letter/${id}`)}
          maxLetters={30}
        />
      </div>
    </div>
  );
}

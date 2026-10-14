import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
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
    <PageShell title="深夜来信" eyebrow="MAILBOX">
      <LetterSwiper
        notes={notes}
        readIds={readIds}
        onOpen={(id) => navigate(`/letter/${id}`)}
        maxLetters={30}
      />
    </PageShell>
  );
}

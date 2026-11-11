import { useEffect } from 'react';
import { PageShell } from '@/components/PageShell';
import { useNotesStore } from './notesStore';
import { LetterGrid } from './LetterCard';

/**
 * 全部来信（独立页）：**一封信 = 一枚信封卡**的两列网格（参考恋与制作人的心动邀约）。
 * 已读的信封盖是翻开的、未读的还是封着，扫一眼就知道哪封没拆。
 *
 * 点信封 → 由 AppLayout 统一挂出 `LetterSheetModal`（固定尺寸信纸弹窗），
 * 不再跳整页路由；`/letter/:id` 直达链接弹的是同一层，刷新或分享链接照样能直达。
 */
export function NotesPage() {
  const notes = useNotesStore((s) => s.notes);
  const readIds = useNotesStore((s) => s.readIds);
  const load = useNotesStore((s) => s.load);
  const openLetter = useNotesStore((s) => s.openLetter);

  // 信由后端不定时抓取，这里只保证进来时是最新的
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell title="深夜来信" eyebrow="MAILBOX">
      <LetterGrid
        notes={notes}
        readIds={readIds}
        onOpen={openLetter}
        maxLetters={30}
      />
    </PageShell>
  );
}

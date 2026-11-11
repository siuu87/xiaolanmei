import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { useNotesStore } from './notesStore';
import { LetterGrid } from './LetterCard';
import { LetterReaderLayer } from './LetterReaderLayer';

/**
 * 全部来信（独立页）：**一封信 = 一枚信封卡**的两列网格（参考恋与制作人的心动邀约）。
 * 已读的信封盖是翻开的、未读的还是封着，扫一眼就知道哪封没拆。
 *
 * 点信封 → **原地弹拆信窗**（`LetterReaderLayer`），不再跳整页路由；
 * 但 `/letter/:id` 仍然保留（AppLayout 会按它弹同一层），刷新或分享链接照样能直达。
 */
export function NotesPage() {
  const navigate = useNavigate();
  const notes = useNotesStore((s) => s.notes);
  const readIds = useNotesStore((s) => s.readIds);
  const load = useNotesStore((s) => s.load);
  const [openId, setOpenId] = useState<string | null>(null);

  // 信由后端不定时抓取，这里只保证进来时是最新的
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageShell title="深夜来信" eyebrow="MAILBOX">
        <LetterGrid
          notes={notes}
          readIds={readIds}
          onOpen={(id) => setOpenId(id)}
          maxLetters={30}
        />
      </PageShell>

      {openId && (
        <LetterReaderLayer
          key={openId}
          id={openId}
          onClose={() => {
            setOpenId(null);
            // 地址栏停在 /notes，刷新不会莫名回到某封信里
            if (window.location.pathname.startsWith('/letter/')) navigate('/notes', { replace: true });
          }}
        />
      )}
    </>
  );
}

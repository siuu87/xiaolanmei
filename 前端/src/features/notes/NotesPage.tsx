import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { useNotesStore } from './notesStore';
import { LetterGrid } from './LetterCard';
import { LetterReaderLayer } from './LetterReaderLayer';
import { MEE, MeeGrain, StarSprinkles } from './MeeSkin';

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
      <PageShell title="深夜来信" eyebrow="MAILBOX" className="mee-mailbox">
        <div className="relative">
          {/* 奶油纸纹 + 淡蓝手绘星星，铺在整页底上（不吃点击、不遮内容） */}
          <MeeGrain />
          <StarSprinkles preset="page" />

          <div className="relative z-10">
            {/* 手写引导语：Mee 那张「收到了 Mee 给我写的一封信 / 拆开看看→」的同款开页 */}
            <div className="mb-6 pt-2 text-center">
              <p
                className="font-hand-title text-[30px] leading-[1.3] tracking-[0.02em]"
                style={{ color: MEE.ink }}
              >
                收到了小蓝莓
                <br />
                写给你的一封信
              </p>
              <p className="mt-2 font-hand text-[12px] tracking-wide" style={{ color: MEE.blue }}>
                拆开看看 →
              </p>
            </div>

            <LetterGrid
              notes={notes}
              readIds={readIds}
              onOpen={(id) => setOpenId(id)}
              maxLetters={30}
            />
          </div>
        </div>
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

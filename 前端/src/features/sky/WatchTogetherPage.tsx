/**
 * WATCH · 一起看（设计稿 6:8）
 *
 * 主视图 = 沉浸式播放器：一块银幕 + 同步进度 + 邀 TA。
 * 原「电视机 + 片单管理」没有删，收进底部「放映厅片单」整屏浮层里，
 * 对应设计稿说明⑤：不邀 TA 时播放逻辑不变，「一起看」是同界面的同步增强。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { WatchPlayer } from './WatchPlayer';
import { WatchlistTV } from './WatchlistTV';
import { WatchlistPage } from './WatchlistPage';

export function WatchTogetherPage() {
  const navigate = useNavigate();
  const [listOpen, setListOpen] = useState(false);

  // Esc 在 window capture 阶段截住，避免冒泡到常驻聊天底座的全局监听
  useEffect(() => {
    if (!listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      setListOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listOpen]);

  return (
    <>
      <WatchPlayer onBack={() => navigate('/chat')} onOpenList={() => setListOpen(true)} />

      {/* 片单：整屏纯色不透明浮层（不用半透明遮罩 / backdrop-blur） */}
      {listOpen &&
        createPortal(
          <div className="fixed inset-0 z-[1250] overflow-y-auto bg-page-bg text-foreground" role="dialog" aria-modal="true" aria-label="放映厅片单">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-chat-line bg-page-bg px-4 py-3">
              <span className="text-[12px] tracking-[0.2em]">放映厅片单</span>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-[6px] text-[12px] text-foreground"
              >
                <X className="h-[13px] w-[13px]" /> 退出片单
              </button>
            </div>
            <div className="mx-auto w-full max-w-md px-4 py-6">
              <WatchlistTV hidePageButton />
              <div className="mt-8">
                <p className="mb-3 text-center text-[10px] tracking-[0.35em] text-muted-foreground">片单</p>
                <WatchlistPage inline />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default WatchTogetherPage;

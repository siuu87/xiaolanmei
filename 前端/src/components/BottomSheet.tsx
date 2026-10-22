import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * 底部弹层（下弹窗）：背板淡入 + 面板从下往上滑，`createPortal` 到 body。
 *
 * 和 `components/ui/sheet.tsx` 的区别：那个是右侧整高抽屉（通知/筛选这类「翻页」场景）；
 * 这个只占屏幕下半部分，用来放「一眼看完、随手关掉」的内容（思考链、说话风格选择）。
 *
 * 两条约定：
 * 1. **背板是纯色不透明 token（--scrim）**：全站禁止半透明黑遮罩与 backdrop-blur；
 * 2. Esc 在 window **capture** 阶段关掉并 `stopPropagation()` —— 否则一次 Esc 会连底下的抽屉一起关。
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  testid,
  maxHeight = 'max-h-[78vh]',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: ReactNode;
  children: ReactNode;
  testid?: string;
  maxHeight?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1400] flex flex-col justify-end" data-testid={testid}>
      {/* 背板：纯色不透明，底下的页面不穿透 */}
      <div
        className="animate-bb-fade-in absolute inset-0 bg-scrim"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'animate-bb-sheet-up relative flex w-full flex-col overflow-hidden rounded-t-[28px]',
          'border-t border-border bg-surface shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]',
          maxHeight,
        )}
      >
        {/* 顶部抓手：暗示可以下滑关掉（暂未实现拖拽，只做视觉语汇） */}
        <div className="flex justify-center pb-0.5 pt-2.5">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        {title ? (
          <div className="flex flex-col items-center gap-0.5 px-4 pb-2.5 pt-1">
            <span className="eyebrow leading-none">SHEET</span>
            <h2 className="display text-[17px] font-semibold text-foreground">{title}</h2>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">{children}</div>
        {/* iPhone 底部安全区 */}
        <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
      </div>
    </div>,
    document.body,
  );
}

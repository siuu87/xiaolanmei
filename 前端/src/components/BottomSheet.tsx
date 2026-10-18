import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * 底部弹层（下弹窗）：遮罩淡入 + 面板从下往上滑，`createPortal` 到 body。
 *
 * 和 `components/ui/sheet.tsx` 的区别：那个是右侧整高抽屉（通知/筛选这类「翻页」场景）；
 * 这个只占屏幕下半部分，用来放「一眼看完、随手关掉」的内容（思考链、说话风格选择）。
 *
 * 两条约定：
 * 1. **不加 `backdrop-blur`**（全站禁模糊遮罩），遮罩只用半透明黑。
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
      <div
        className="animate-bb-fade-in absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'animate-bb-sheet-up relative flex w-full flex-col overflow-hidden rounded-t-[22px]',
          'border-t border-chat-line bg-chat-bar shadow-[0_-8px_40px_rgba(0,0,0,0.18)]',
          maxHeight,
        )}
      >
        {/* 顶部抓手：暗示可以下滑关掉（暂未实现拖拽，只做视觉语汇） */}
        <div className="flex justify-center pb-0.5 pt-2">
          <span className="h-1 w-9 rounded-full bg-chat-line" aria-hidden />
        </div>
        {title ? (
          <div className="flex items-center justify-center px-4 pb-2 pt-1">
            <h2 className="text-[15px] font-semibold text-chat-ai-fg">{title}</h2>
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

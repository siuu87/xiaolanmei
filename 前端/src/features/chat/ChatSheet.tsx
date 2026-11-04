import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 聊天页专用底部弹层（对齐「小蓝莓-聊天界面」设计稿）。
 *
 * 和通用 `BottomSheet` 的差别：
 * - 纯白纸面（`--chat-sheet`），不是全站灰卡；
 * - 标题**左对齐**，右上角一颗圆形 ✕（设计稿里没有居中的 SHEET 小标）；
 * - 原稿里弹层浮在聊天上方、背后不压暗，所以这里只留一层透明点击区负责「点空白关掉」；
 * - 顶部抓手 + 从下往上滑的动效沿用。
 *
 * Esc 在 capture 阶段关掉并 `stopPropagation()`，避免一次 Esc 连底下抽屉一起关。
 */
export function ChatSheet({
  open,
  onOpenChange,
  title,
  children,
  testid,
  maxHeight = 'max-h-[78vh]',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
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
      {/* 透明点击区：点聊天背景就收起，不做半透明黑遮罩 */}
      <div className="absolute inset-0" onClick={() => onOpenChange(false)} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'animate-bb-sheet-up relative flex w-full flex-col overflow-hidden rounded-t-[28px] bg-chat-sheet',
          'shadow-[0_-8px_30px_-24px_hsl(var(--shadow-color)/0.5)]',
          maxHeight,
        )}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <span className="h-1 w-10 rounded-full bg-chat-line" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-1.5">
          <h2 className="text-[19px] font-semibold tracking-tight text-foreground">{title}</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg transition active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-5 pb-6">
          {children}
        </div>
        <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
      </div>
    </div>,
    document.body,
  );
}

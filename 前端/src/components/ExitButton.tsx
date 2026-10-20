/**
 * 「退出」键（2026-10-20）
 *
 * 为什么单独做一个：整页 iframe（小食谱 / 记忆相册）和整屏通话（PaiVoice）里，
 * 用户的目光全被外部页面占住，**没有返回键可找**——以前只能靠 Esc 或者自己发现顶栏，
 * 用户明确说「也要可退出按键」。所以凡是「满屏托管的别人的页面」，
 * 右上角都必须钉一个高对比、带文字的退出键，而不是一个不起眼的小图标。
 *
 * 两种外观：
 * - `solid`（默认）：药丸底 + 文字，压在深色/浅色都能看清，用于浮在 iframe/通话之上的场景；
 * - `ghost`：透明底圆形图标，用于已经有不透明深色顶栏、风格统一的页面（如通话窗口标题栏）。
 *
 * 行为只做一件事：调 `onExit`。去哪由调用方决定（回聊天 / 回上一页 / 只关掉通话）。
 */
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ExitButtonProps {
  onExit: () => void;
  /** 按钮文字，默认「退出」 */
  label?: string;
  /** 无障碍标签，默认同 label */
  ariaLabel?: string;
  /** 外观：solid 药丸 / ghost 圆形图标 */
  variant?: 'solid' | 'ghost';
  /** 固定位置（只对 solid 生效）：右上角 / 左上角 */
  corner?: 'top-right' | 'top-left';
  testId?: string;
  className?: string;
}

export function ExitButton({
  onExit,
  label = '退出',
  ariaLabel,
  variant = 'solid',
  corner = 'top-right',
  testId,
  className,
}: ExitButtonProps) {
  if (variant === 'ghost') {
    return (
      <button
        type="button"
        onClick={onExit}
        aria-label={ariaLabel ?? label}
        data-testid={testId}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition',
          'text-amber-200/60 hover:bg-white/10 hover:text-amber-100 active:scale-95',
          className,
        )}
      >
        <X size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onExit}
      aria-label={ariaLabel ?? label}
      data-testid={testId}
      className={cn(
        'pointer-events-auto fixed z-[1300] inline-flex items-center gap-1 rounded-full',
        'border border-white/15 bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white/90',
        'backdrop-blur-sm transition hover:bg-black/70 active:scale-95',
        'dark:border-white/15 dark:bg-black/55 dark:text-white/90',
        // 浅色主题下也要能看清：黑底白字在两种主题里都成立，所以不跟主题反色
        corner === 'top-right' ? 'right-3 top-3' : 'left-3 top-3',
        className,
      )}
    >
      <X size={13} /> {label}
    </button>
  );
}

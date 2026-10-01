import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IOSSettingItemProps {
  icon?: ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
}

/**
 * iOS 设置条目：左侧彩色圆角图标 + 主标题（可带副标题）+ 右侧 value / trailing / chevron。
 * 点击态用 active:bg 表现；destructive 让标题变红。
 */
export function IOSSettingItem({
  icon,
  iconBg,
  title,
  subtitle,
  value,
  trailing,
  onClick,
  destructive,
  showChevron,
}: IOSSettingItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition',
        onClick ? 'cursor-pointer active:bg-gray-100 dark:active:bg-zinc-800' : 'cursor-default',
      )}
    >
      {icon && (
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-white',
            iconBg ?? 'bg-gray-400',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[16px] leading-tight',
            destructive ? 'text-red-500' : 'text-gray-900 dark:text-gray-100',
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block text-[13px] text-gray-500 dark:text-zinc-400">
            {subtitle}
          </span>
        )}
      </span>
      {value && <span className="shrink-0 text-[16px] text-gray-400 dark:text-zinc-500">{value}</span>}
      {trailing}
      {showChevron && !trailing && (
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-zinc-600" />
      )}
    </button>
  );
}

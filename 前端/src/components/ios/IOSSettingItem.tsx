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
  /**
   * 外层用 div，点击区只在「图标 + 文字」这个 button 上：
   * trailing 里常放 IOSSwitch（它自己就是 button），套在 button 里就是 <button> 套 <button>，
   * 属于非法 DOM 嵌套，部分浏览器里内层点击根本不触发。
   */
  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition',
        onClick ? 'cursor-pointer active:bg-muted' : 'cursor-default',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {icon && (
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-primary-foreground',
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
              destructive ? 'text-red-500' : 'text-foreground',
            )}
          >
            {title}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[13px] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
      </button>
      {value && <span className="shrink-0 text-[16px] text-muted-foreground">{value}</span>}
      {trailing}
      {showChevron && !trailing && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}

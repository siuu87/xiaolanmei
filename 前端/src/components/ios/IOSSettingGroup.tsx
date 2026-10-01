import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IOSSettingGroupProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/** iOS 设置分组：上灰标题 + 圆角白卡（深色 zinc-900），内部用 divide-y 分隔条目 */
export function IOSSettingGroup({ title, children, className }: IOSSettingGroupProps) {
  return (
    <div className={cn('mx-4', className)}>
      {title && (
        <p className="mb-2 px-4 text-[13px] uppercase tracking-wide text-gray-500 dark:text-zinc-400">
          {title}
        </p>
      )}
      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm dark:divide-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  );
}

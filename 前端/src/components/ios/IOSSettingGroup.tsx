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
        <p className="mb-2 px-4 text-[13px] uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm">
        {children}
      </div>
    </div>
  );
}

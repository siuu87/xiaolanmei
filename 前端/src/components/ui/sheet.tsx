import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** 轻量抽屉：遮罩 + 右侧滑入面板，createPortal 到 body，open=false 时不渲染。 */
export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="relative h-full max-h-full">{children}</div>
    </div>,
    document.body,
  );
}

export function SheetContent({
  side = 'right',
  className,
  children,
}: {
  side?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-side={side}
      className={cn('h-full w-full bg-background shadow-xl', className)}
    >
      {children}
    </div>
  );
}

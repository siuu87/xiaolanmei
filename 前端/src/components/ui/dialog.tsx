import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialog(): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('Dialog 组件必须在 <Dialog> 内使用');
  return ctx;
}

/** 轻量对话框：遮罩 + 居中面板，createPortal 到 body，open=false 时不渲染。 */
export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md">{children}</div>
        </div>,
        document.body,
      )}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { onOpenChange } = useDialog();
  return (
    <div className={cn('relative rounded-2xl bg-background p-5 shadow-xl', className)}>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        aria-label="关闭"
        className="absolute right-3 top-3 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mb-4 pr-6', className)}>{children}</div>;
}

export function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h2 className={cn('text-base font-semibold', className)}>{children}</h2>;
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mt-4 flex justify-end gap-2', className)}>{children}</div>;
}

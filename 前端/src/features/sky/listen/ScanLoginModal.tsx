import { QrCode, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 扫码登录弹窗（占位）：展示二维码占位图，点击蒙版或 × 关闭 */
export function ScanLoginModal({ open, onClose, onSuccess }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div className="paper-card relative z-10 w-full max-w-xs p-5 text-center text-foreground shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-sm font-semibold text-foreground">扫码登录</p>

        {/* MCP 接入点：此处替换为真实二维码图片（loginWithQrCode） */}
        <div className="mx-auto mt-4 flex h-44 w-44 items-center justify-center rounded-2xl bg-white p-3">
          <QrCode className="h-full w-full text-neutral-900" strokeWidth={1.2} />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">打开网易云音乐 App 扫码登录</p>

        {/* 占位：模拟登录成功，接入真实 MCP 后删除 */}
        <button
          type="button"
          onClick={onSuccess}
          className="mt-4 w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          模拟登录成功
        </button>
      </div>
    </div>
  );
}

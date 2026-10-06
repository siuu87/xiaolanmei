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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs rounded-2xl border border-white/10 bg-[#0d1226]/95 p-5 text-center shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-sm font-semibold text-slate-100">扫码登录</p>

        {/* MCP 接入点：此处替换为真实二维码图片（loginWithQrCode） */}
        <div className="mx-auto mt-4 flex h-44 w-44 items-center justify-center rounded-2xl bg-white p-3">
          <QrCode className="h-full w-full text-slate-900" strokeWidth={1.2} />
        </div>

        <p className="mt-3 text-xs text-slate-400">打开网易云音乐 App 扫码登录</p>

        {/* 占位：模拟登录成功，接入真实 MCP 后删除 */}
        <button
          type="button"
          onClick={onSuccess}
          className="mt-4 w-full rounded-full bg-rose-400 py-2 text-sm font-medium text-white transition hover:bg-rose-500"
        >
          模拟登录成功
        </button>
      </div>
    </div>
  );
}

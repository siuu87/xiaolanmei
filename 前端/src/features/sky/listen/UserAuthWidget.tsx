import { useState } from 'react';
import { getUserProfile, type NeteaseUser } from './neteaseMcpConnector';
import { ScanLoginModal } from './ScanLoginModal';

/**
 * 右上角用户状态组件。
 * 未登录：显示「连接网易云账号」按钮，点击弹出扫码登录弹窗；
 * 已登录：显示头像、昵称与 MCP 已连接状态。
 */
export function UserAuthWidget() {
  const [user, setUser] = useState<NeteaseUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // MCP 接入点：扫码登录成功后拉取用户资料
  const handleSuccess = async () => {
    setModalOpen(false);
    const profile = await getUserProfile();
    setUser(profile);
  };

  return (
    <>
      {user ? (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#E6C45A] to-[#B8860B] text-base ring-1 ring-white/20">
            {user.avatarUrl}
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="max-w-24 truncate text-sm text-slate-100">{user.nickname}</span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              MCP 已连接
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs text-slate-100 transition hover:bg-white/20"
        >
          连接网易云账号
        </button>
      )}

      <ScanLoginModal open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={() => void handleSuccess()} />
    </>
  );
}

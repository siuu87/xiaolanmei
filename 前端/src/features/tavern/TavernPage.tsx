/**
 * 酒馆 = SillyTavern 本体（2026-11-22 起）。
 *
 * 进入 /tavern 直接全屏嵌入 ST 完整界面，不再有内置的小手机
 * （联系人 / 朋友圈 / 卡片库 / 配置台 / 内置聊天全部移除）。
 * ST 的会话、CSRF 由 ST 自己在其 iframe 源内维护，父页面只负责：
 *   1. 从后端 /api/st/status 拿到已保存的 ST 地址（凭据不出后端）
 *   2. 把地址 host 归一化为 localhost（与前端同站，保证 ST 的 lax cookie 正常）
 *   3. 提供极简悬浮工具条：返回聊天 / 刷新 ST / 连接设置
 *
 * ST 未连接时显示引导页，可进连接设置页填地址；连上后自动回到 iframe。
 */
import { useCallback, useEffect, useState } from 'react';
import { useBack } from '@/lib/navigateBack';
import { ArrowLeft, RefreshCw, Settings2, PlugZap, Loader2 } from 'lucide-react';
import { useImmersiveStore } from '@/stores/immersiveStore';
import { getStStatus, invalidateStStatus } from '@/lib/api/tavern';
import { StConfigPage } from './phone/StConfigPage';

/** 取 ST 地址；本机地址统一用 localhost 作 iframe 源，避免跨站导致 ST 的 cookie 被拦。 */
function normalizeStUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === '[::1]') {
      u.hostname = 'localhost';
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

export function TavernPage() {
  const goBack = useBack();
  const setImmersive = useImmersiveStore((s) => s.setImmersive);
  const [stUrl, setStUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // 酒馆整页占满视口：沉浸式（收起 App 侧边栏与底部导航），离开时还原
  useEffect(() => {
    setImmersive(true);
  }, [setImmersive]);
  useEffect(() => () => setImmersive(false), [setImmersive]);

  const resolve = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getStStatus();
      setStUrl(s.up && s.url ? normalizeStUrl(s.url) : null);
    } catch {
      setStUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  // 连接设置页保存/清空后回到这里：清缓存、重探、强制重建 iframe
  const onConfigDone = useCallback(() => {
    invalidateStStatus();
    setShowConfig(false);
    void resolve().then(() => setIframeKey((k) => k + 1));
  }, [resolve]);

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-[#1b1b1d] text-foreground">
      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
          <p className="text-sm text-muted-foreground">正在连接 SillyTavern…</p>
        </div>
      ) : stUrl ? (
        <>
          <iframe
            key={iframeKey}
            src={stUrl}
            title="SillyTavern"
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen; autoplay"
          />
          {/* 极简悬浮工具条：不遮 ST 主内容，hover 才明显 */}
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2">
            <ToolBtn title="返回聊天" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn title="刷新 ST" onClick={() => setIframeKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn title="连接设置" onClick={() => setShowConfig(true)}>
              <Settings2 className="h-4 w-4" />
            </ToolBtn>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
            <PlugZap className="h-8 w-8 text-gold" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">SillyTavern 酒馆</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              酒馆已切换到 SillyTavern 本体。当前尚未连接，点下方按钮填写 ST 地址后即可进入完整界面。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-gold-on transition hover:bg-gold"
            >
              连接 SillyTavern
            </button>
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg bg-surface-2 px-5 py-2.5 text-sm text-foreground transition hover:bg-surface-3"
            >
              返回聊天
            </button>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="absolute inset-0 z-30">
          <StConfigPage onBack={onConfigDone} />
        </div>
      )}
    </div>
  );
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 opacity-40 shadow-lg backdrop-blur-sm transition hover:bg-black/80 hover:text-white hover:opacity-100"
    >
      {children}
    </button>
  );
}

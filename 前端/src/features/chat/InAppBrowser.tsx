import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Compass,
  RotateCw,
  Share,
  ShieldAlert,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 应用内浏览器（参考图那张 jiji.com 的浮层）。
 *
 * 布局照着参考图来：顶栏 = ✓ + 域名 + 加载进度条 + 右上角图标；
 * 底栏 = 返回 / 分享 / 关闭 / 指南针。中间就是真实的 iframe。
 *
 * 两个必须讲清楚的事实：
 * 1. **很多站点会拒绝被内嵌**（响应头 X-Frame-Options / CSP frame-ancestors）。
 *    浏览器不会把「被拒绝」这件事暴露给父页面，所以这里只能在超时后给一句
 *    「迟迟没加载出来」的提示 + 一个「用系统浏览器打开」的出口，而不是假装成功。
 * 2. iframe 是跨域的，父页面拿不到它的 history，所以「返回」只能回退**本浮层自己**
 *    记录过的地址栈（空栈就直接关闭浮层）。
 */
export function InAppBrowser({ url, onClose }: { url: string; onClose: () => void }) {
  /** 浮层自己的地址栈：进站内的新链接才 push，返回时 pop */
  const [stack, setStack] = useState<string[]>(() => [normalize(url)]);
  const [progress, setProgress] = useState(12);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [nonce, setNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const current = stack[stack.length - 1];

  const host = useMemo(() => {
    try {
      return new URL(current).host;
    } catch {
      return current;
    }
  }, [current]);

  /**
   * 换地址 / 重试时把进度归零。
   *
   * **必须在这里手动调，不能放进下面的 useEffect 里**：iframe 命中缓存时 onLoad
   * 有可能早于被动 effect 触发，effect 里再 setLoaded(false) 就会把刚点亮的
   * 「加载完成」又抹掉，进度条永远走不完（实测踩过）。
   */
  const resetProgress = useCallback(() => {
    setLoaded(false);
    setProgress(12);
    setSlow(false);
  }, []);

  /** 进度条：加载完成前一路爬到 88%，onLoad 时补到 100% 再淡出 */
  useEffect(() => {
    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? 88 : p + Math.max(1, (88 - p) * 0.18)));
    }, 220);
    const slowTimer = window.setTimeout(() => setSlow(true), 6000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(slowTimer);
    };
  }, [current, nonce]);

  const onFrameLoad = () => {
    setProgress(100);
    setLoaded(true);
    setSlow(false);
  };

  // Esc 关闭：capture 阶段拦下，避免一次 Esc 连带关掉底下的抽屉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    if (stack.length <= 1) onClose();
    else resetProgress();
  }, [onClose, resetProgress, stack.length]);

  const reload = useCallback(() => {
    resetProgress();
    setNonce((n) => n + 1);
  }, [resetProgress]);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ url: current, title: host });
      else await navigator.clipboard.writeText(current);
    } catch {
      /* 用户取消分享 / 剪贴板不可用，都静默 */
    }
  };

  const openExternal = () => window.open(current, '_blank', 'noopener,noreferrer');

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-chat-bg"
      data-testid="in-app-browser"
      role="dialog"
      aria-label="应用内浏览器"
    >
      {/* 顶栏：✓ / 域名 + 进度条 / 外链 */}
      <div className="relative shrink-0 bg-chat-bar pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="完成"
            data-testid="browser-done"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition active:scale-95"
          >
            <Check className="h-[18px] w-[18px]" strokeWidth={2.4} />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <div
              data-testid="browser-host"
              className="truncate text-[13px] font-medium text-foreground"
              title={current}
            >
              {host}
            </div>
          </div>

          <button
            type="button"
            onClick={openExternal}
            aria-label="用系统浏览器打开"
            title="用系统浏览器打开"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition active:scale-95"
          >
            <Compass className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* 加载进度条：细、贴顶栏下沿、走完淡出 */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <div
            data-testid="browser-progress"
            data-done={loaded ? '1' : '0'}
            className={cn(
              'h-full rounded-full bg-chat-accent transition-[width,opacity] duration-300 ease-out',
              loaded && 'opacity-0',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          ref={frameRef}
          key={`${current}#${nonce}`}
          src={current}
          title={host}
          onLoad={onFrameLoad}
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
          className="h-full w-full border-0 bg-white"
        />

        {/* 迟迟没 load：多半是被 X-Frame-Options / CSP 拒了，给个明说的出口 */}
        {slow && !loaded && (
          <div className="absolute inset-x-4 top-6 rounded-2xl border border-chat-line bg-chat-bar p-3 text-xs text-chat-pill-fg shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-chat-accent" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">这个站点可能不允许被内嵌</p>
                <p className="mt-0.5 leading-relaxed text-chat-meta">
                  很多网站会带 <code className="font-mono">X-Frame-Options</code> 拒绝外部框架，
                  浏览器不会把「被拒绝」告诉页面，所以这里只能提示。
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={openExternal}
                    className="rounded-full bg-chat-accent px-2.5 py-1 font-medium text-chat-accent-fg"
                  >
                    用系统浏览器打开
                  </button>
                  <button
                    type="button"
                    onClick={reload}
                    className="rounded-full bg-chat-line px-2.5 py-1 font-medium text-chat-pill-fg"
                  >
                    重试
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底栏：返回 / 分享 / 关闭 / 刷新 */}
      <div className="shrink-0 bg-chat-bar pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center justify-around px-4">
          <BarBtn label="返回" onClick={back} testid="browser-back">
            <ChevronLeft className="h-5 w-5" />
          </BarBtn>
          <BarBtn label="分享" onClick={() => void share()} testid="browser-share">
            <Share className="h-[18px] w-[18px]" />
          </BarBtn>
          <BarBtn label="关闭" onClick={onClose} testid="browser-close">
            <X className="h-5 w-5" />
          </BarBtn>
          <BarBtn label="重新加载" onClick={reload} testid="browser-refresh" round>
            <RotateCw className="h-4 w-4" />
          </BarBtn>
        </div>
      </div>
    </div>
  );
}

function BarBtn({
  label,
  onClick,
  testid,
  round,
  children,
}: {
  label: string;
  onClick: () => void;
  testid: string;
  round?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testid}
      className={cn(
        'flex h-10 w-10 items-center justify-center text-chat-pill-fg transition active:scale-95',
        round ? 'rounded-full bg-chat-pill shadow-sm' : 'rounded-full hover:bg-chat-line/60',
      )}
    >
      {children}
    </button>
  );
}

/** 补协议：用户拿到的大多是 `jiji.com` 这种裸域名 */
function normalize(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'about:blank';
  if (/^(https?:|about:)/i.test(s)) return s;
  return `https://${s}`;
}

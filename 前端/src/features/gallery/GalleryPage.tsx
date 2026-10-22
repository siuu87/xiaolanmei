/**
 * 相册（2026-10-20 起只保留「记忆相册」）
 *
 * 只接 Remember-Me 的 Dusk Archive Dashboard：
 * - 侧车在线 → 整页 iframe，深色外壳，不再出现「本地相册 / 记忆相册」切换；
 * - 侧车离线 → 启动说明 + 重试，不再回退旧的本地相册。
 *
 * 数据与图片都在 Remember-Me 自己的库里（`remember-me/.data`），
 * 本页不存第二个相册，也不复用旧的 gallery 表。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ExitButton } from '@/components/ExitButton';
import { cn } from '@/lib/utils';
import { getRememberMeStatus, type RememberMeStatus } from '@/lib/api/gallery';

export function GalleryPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RememberMeStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getRememberMeStatus());
    } catch {
      setStatus({ up: false, base: '', dashboard: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <PageShell
      title="相册"
      eyebrow="GALLERY"
      testId="gallery-page"
      className="bg-page-bg"
      bodyClassName="p-0"
      right={
        <div className="flex shrink-0 items-center gap-1">
          {status?.up && (
            <a
              href={status.dashboard}
              target="_blank"
              rel="noreferrer"
              aria-label="在新窗口打开记忆相册"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              <ExternalLink size={15} />
            </a>
          )}
          <button
            type="button"
            onClick={() => void check()}
            aria-label="重新检测记忆相册"
            data-testid="gallery-remember-check"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
          </button>
        </div>
      }
    >
      {loading && !status ? (
        <div className="flex items-center gap-2 px-5 py-10 text-[13px] text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> 正在打开记忆相册…
        </div>
      ) : status?.up ? (
        <div className="relative">
          {/* 记忆相册是整屏 iframe，退出键钉在右上角，任何时候都能点到 */}
          <ExitButton
            variant="solid"
            label="退出"
            ariaLabel="退出相册"
            onExit={() => navigate('/together')}
            testId="gallery-exit"
            className="top-[54px]"
          />
          <div
            data-testid="remember-me-frame"
            className="h-[calc(100dvh-57px)] w-full overflow-hidden bg-page-bg"
          >
            <iframe
              src={status.dashboard}
              title="Remember-Me"
              data-testid="remember-me-iframe"
              allow="clipboard-read; clipboard-write"
              className="h-full w-full border-0"
            />
          </div>
        </div>
      ) : (
        <div className="px-4 py-5">
          <div
            data-testid="remember-me-setup"
            className="paper-card p-5 text-card-foreground"
          >
            <div className="flex items-center gap-2 text-[13px] text-foreground">
              <HardDrive size={15} className="text-gold" /> 记忆相册还没启动
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              相册现在只使用 Remember-Me 的图像记忆库（Dusk Archive）。
              侧车默认在 127.0.0.1:8787，启动后点右上角刷新。
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-[10px] leading-4 text-muted-foreground">
              {String.raw`cd remember-me
.venv\Scripts\python.exe -m remember_me serve --data-root .data`}
            </pre>
            <button
              type="button"
              onClick={() => void check()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground transition active:scale-95"
            >
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> 重新检测
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

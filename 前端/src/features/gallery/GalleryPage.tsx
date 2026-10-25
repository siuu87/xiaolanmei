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
import { ExternalLink, HardDrive, Images, Loader2, RefreshCw } from 'lucide-react';
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
        <div className="relative min-h-[calc(100dvh-120px)]">
          {/* Remember-Me 出于安全策略禁止内嵌（X-Frame-Options: DENY + frame-ancestors 'none'），
              所以这里不嵌 iframe，改为在新标签页打开独立运行的 Dusk Archive 仪表盘。 */}
          <ExitButton
            variant="solid"
            label="退出"
            ariaLabel="退出相册"
            onExit={() => navigate('/together')}
            testId="gallery-exit"
            className="top-[54px]"
          />
          <div className="flex h-[calc(100dvh-140px)] flex-col items-center justify-center px-6 text-center">
            <div className="paper-card w-full max-w-sm p-6" data-testid="remember-me-launch">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                <Images size={22} />
              </div>
              <h2 className="text-[15px] font-semibold text-foreground">记忆相册 · Dusk Archive</h2>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Remember-Me 的图像记忆库以独立页面运行，出于安全策略不允许内嵌到本应用。
                点击下方按钮在新标签页打开，看完随时可返回。
              </p>
              <a
                href={status.dashboard}
                target="_blank"
                rel="noreferrer"
                data-testid="remember-me-open"
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-[12px] font-medium text-primary-foreground transition active:scale-[0.98]"
              >
                <ExternalLink size={14} /> 打开记忆相册
              </a>
            </div>
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
              侧车监听 8787 端口，启动后点右上角刷新。
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

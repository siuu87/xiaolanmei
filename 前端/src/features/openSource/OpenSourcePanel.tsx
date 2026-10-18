import { useEffect, useMemo, useState } from 'react';
import {
  Github,
  ExternalLink,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Star,
  Check,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenSourceStore } from './openSourceStore';
import type { OpenSourceProjectDTO } from '@/lib/api/openSource';

/** star 数压成 1.2k 这种短写法，列表里不至于被长数字挤爆 */
function shortStars(n: number | null): string | null {
  if (n == null) return null;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

/** 相对时间：3 天前 / 刚刚 */
function ago(ts: number | null): string | null {
  if (!ts) return null;
  const d = Date.now() - ts;
  if (d < 60_000) return '刚刚';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} 分钟前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} 小时前`;
  if (d < 2_592_000_000) return `${Math.floor(d / 86_400_000)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

/** 单行项目：名称 / 描述 / 版本，有更新就高亮，右侧「更新 / 知道了 / GitHub / 移除」 */
function ProjectRow({ p }: { p: OpenSourceProjectDTO }) {
  const refresh = useOpenSourceStore((s) => s.refresh);
  const ack = useOpenSourceStore((s) => s.ack);
  const remove = useOpenSourceStore((s) => s.remove);
  const refreshing = useOpenSourceStore((s) => s.refreshing);
  const [busy, setBusy] = useState(false);

  const stars = shortStars(p.stars);
  const releasedAt = ago(p.latestPublishedAt);

  return (
    <div
      data-testid="opensource-row"
      data-has-update={p.hasUpdate ? '1' : '0'}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3 transition',
        p.hasUpdate ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-sm text-foreground">{p.name}</span>
          {p.hasUpdate && (
            <span
              data-testid="opensource-update-tag"
              className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              有更新
            </span>
          )}
          {p.language && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {p.language}
            </span>
          )}
          {stars && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Star className="h-3 w-3" /> {stars}
            </span>
          )}
        </div>

        {p.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</p>
        )}
        {p.note && <p className="mt-0.5 line-clamp-1 text-xs text-foreground/70">备注：{p.note}</p>}

        <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
          {p.latestVersion ? (
            <>
              <span>{p.seenVersion ?? '—'}</span>
              {p.hasUpdate && (
                <>
                  <span className="text-primary">→</span>
                  <span className="text-primary">{p.latestVersion}</span>
                </>
              )}
              {!p.hasUpdate && <Package className="h-3 w-3" />}
            </>
          ) : (
            <span>还没有 release</span>
          )}
          {releasedAt && <span className="font-sans">· {releasedAt}</span>}
        </p>

        {p.checkError && (
          <p className="mt-1 text-[11px] text-destructive">上次没查到：{p.checkError}</p>
        )}
      </div>

      {/* 操作：单项目检查更新 → 知道了 → 仓库 → 移除 */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={refreshing || busy}
            onClick={async () => {
              setBusy(true);
              await refresh(p.id);
              setBusy(false);
            }}
            aria-label={`检查 ${p.name} 的更新`}
            title="检查这个项目的更新"
            data-testid="opensource-refresh-one"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
          </button>
          {p.hasUpdate && (
            <button
              type="button"
              onClick={() => void ack(p.id)}
              aria-label="知道了"
              title="记下这个版本，不再提示"
              data-testid="opensource-ack"
              className="rounded-md p-1 text-primary transition hover:bg-primary/10"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <a
            href={p.repoUrl}
            target="_blank"
            rel="noreferrer"
            title={`打开 ${p.name} 的仓库`}
            data-testid="opensource-link"
            className="flex items-center gap-1 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => void remove(p.id)}
            aria-label="移出清单"
            title="移出清单"
            data-testid="opensource-remove"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 工具箱内联面板：**我关注的开源项目**。
 *
 * 2026-10-18 改版：清单只放用户自己添加的项目（后端不再自动扫依赖），
 * 一开始是空的 —— 想看哪个项目就粘贴它的 GitHub 地址加进来。
 * 顶部「检查更新」按钮点一下会自动去 GitHub 拉所有项目的最新 release。
 */
export function OpenSourcePanel() {
  const items = useOpenSourceStore((s) => s.items);
  const summary = useOpenSourceStore((s) => s.summary);
  const loading = useOpenSourceStore((s) => s.loading);
  const refreshing = useOpenSourceStore((s) => s.refreshing);
  const error = useOpenSourceStore((s) => s.error);
  const load = useOpenSourceStore((s) => s.load);
  const add = useOpenSourceStore((s) => s.add);
  const refresh = useOpenSourceStore((s) => s.refresh);

  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (onlyUpdates ? items.filter((i) => i.hasUpdate) : items),
    [items, onlyUpdates],
  );

  const submit = async () => {
    const url = draft.trim();
    if (!url || adding) return;
    setAdding(true);
    try {
      await add(url);
      setDraft('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 添加：粘贴 GitHub 地址 → 只加用户指定的项目 */}
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter') void submit();
          }}
          placeholder="粘贴 GitHub 仓库地址，加进来"
          aria-label="GitHub 仓库地址"
          data-testid="opensource-input"
          className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={adding || !draft.trim()}
          data-testid="opensource-add"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          添加
        </button>
      </div>

      {/* 汇总行：总数 + 有更新数 + 只看有更新 + 一键检查更新 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          共 {summary?.total ?? items.length} 个
          {summary ? ` · ${summary.updates} 个有更新` : ''}
        </span>
        <div className="flex-1" />
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setOnlyUpdates((v) => !v)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs transition',
              onlyUpdates
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            只看有更新
          </button>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || items.length === 0}
          aria-label="检查更新"
          data-testid="opensource-refresh-all"
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-40"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {refreshing ? '检查中…' : '检查更新'}
        </button>
      </div>

      {summary?.checkedAt && (
        <p className="text-[11px] text-muted-foreground">上次检查：{ago(summary.checkedAt)}</p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          清单是空的 —— 想关注哪个开源项目，把它的 GitHub 地址粘到上面加进来。
        </p>
      )}

      {!loading && items.length > 0 && shown.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {onlyUpdates ? '都已是最新版本。' : '没有可显示的项目。'}
        </p>
      )}

      {loading && items.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">读取中…</p>
      )}

      <div className="space-y-1.5">
        {shown.map((p) => (
          <ProjectRow key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

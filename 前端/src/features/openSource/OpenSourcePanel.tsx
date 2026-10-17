import { useEffect, useMemo, useState } from 'react';
import { Github, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOpenSourceStore } from './openSourceStore';
import type { OpenSourceDepDTO } from '@/lib/api/openSource';

const SIDE_LABEL: Record<string, string> = { frontend: '前端', backend: '后端' };

/** 单行依赖：名称 / 描述 / 当前版 → 最新版，有更新就高亮，右挂 GitHub 外链 */
function DepRow({ dep }: { dep: OpenSourceDepDTO }) {
  const showArrow = dep.latest && dep.installed && dep.latest !== dep.installed;
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3 transition',
        dep.hasUpdate ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm font-medium text-foreground">{dep.name}</span>
          {dep.kind === 'devDependency' && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">dev</span>
          )}
          {dep.hasUpdate && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              有更新
            </span>
          )}
        </div>
        {dep.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{dep.description}</p>
        )}
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {dep.installed ?? dep.declared}
          {showArrow && <span className="text-primary"> → {dep.latest}</span>}
        </p>
      </div>
      <a
        href={dep.repoUrl}
        target="_blank"
        rel="noreferrer"
        title={`打开 ${dep.name} 的 GitHub 仓库`}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Github className="h-3.5 w-3.5" />
        GitHub
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

/**
 * 工具箱内联面板：开源项目清单（前端 / 后端分组）。
 * 只提醒不执行——每行给「当前版 → 最新版」与 GitHub 外链，不提供应用内更新按钮。
 */
export function OpenSourcePanel() {
  const items = useOpenSourceStore((s) => s.items);
  const summary = useOpenSourceStore((s) => s.summary);
  const loading = useOpenSourceStore((s) => s.loading);
  const error = useOpenSourceStore((s) => s.error);
  const load = useOpenSourceStore((s) => s.load);

  const [onlyUpdates, setOnlyUpdates] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const filtered = onlyUpdates ? items.filter((i) => i.hasUpdate) : items;
    return (['frontend', 'backend'] as const)
      .map((side) => ({ side, deps: filtered.filter((i) => i.side === side) }))
      .filter((g) => g.deps.length > 0);
  }, [items, onlyUpdates]);

  return (
    <div className="space-y-3">
      {/* 汇总行：总数 + 有更新数 + 只看有更新 + 刷新 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          共 {summary?.total ?? items.length} 个
          {summary ? ` · ${summary.updates} 个有更新` : ''}
        </span>
        <div className="flex-1" />
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
        <button
          type="button"
          onClick={() => void load(true)}
          aria-label="刷新"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!loading && groups.length === 0 && !error && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {onlyUpdates ? '没有需要更新的项目。' : '还没有可列出的开源项目。'}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.side}>
          <h4 className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {SIDE_LABEL[g.side]}
          </h4>
          <div className="space-y-1.5">
            {g.deps.map((d) => (
              <DepRow key={`${d.side}:${d.name}`} dep={d} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

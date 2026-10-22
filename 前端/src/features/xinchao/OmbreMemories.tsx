/**
 * OmbreMemories —— OB 记忆中枢的「记忆」视图（2026-10-21）。
 *
 * 挂在「内心 / 心潮」页面的「记忆」页签下：
 * - 顶部一排页签：全部 / 动态 / 永久 / 已归档 / 已钉选（标签筛选）
 * - 搜索框：300ms 防抖，调 `/search`
 * - 卡片网格：点开 = 手账风 Bottom Sheet 详情（OmbreDetail）
 *
 * 风格沿用 心潮 的暖暗色 + 微光留白，和花瓣、念头池是同一个中枢。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pin, Search } from 'lucide-react';
import type { BucketStateFilter, OmbreBucket, OmbreStatus } from '@/lib/api/ombreDashboard';
import { getOmbreBuckets, getOmbreStatus, searchOmbreBuckets } from '@/lib/api/ombreDashboard';
import { cn } from '@/lib/utils';
import { OmbreDetail } from './OmbreDetail';

const TABS: { key: BucketStateFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'dynamic', label: '动态' },
  { key: 'permanent', label: '永久' },
  { key: 'archived', label: '已归档' },
  { key: 'pinned', label: '已钉选' },
];

const TYPE_BADGE: Record<string, string> = {
  dynamic: '动态',
  permanent: '永久',
  letter: '信',
};

export function OmbreMemories() {
  const [tab, setTab] = useState<BucketStateFilter>('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [buckets, setBuckets] = useState<OmbreBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OmbreBucket | null>(null);
  const reqId = useRef(0);

  // 搜索防抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    (debounced
      ? searchOmbreBuckets(debounced)
      : getOmbreBuckets({ state: tab })
    )
      .then((res) => {
        if (id !== reqId.current) return;
        setBuckets(res.buckets ?? []);
      })
      .catch((e: unknown) => {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : '加载失败');
        setBuckets([]);
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [tab, debounced]);

  const sorted = useMemo(
    () => [...buckets].sort((a, b) => b.score - a.score),
    [buckets],
  );

  return (
    <div className="space-y-3">
      {/* 页签筛选 */}
      <div className="flex flex-wrap gap-1.5" data-testid="ombre-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            data-testid={`ombre-tab-${t.key}`}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] transition border',
              tab === t.key
                ? 'border-gold/30 bg-gold/15 text-foreground'
                : 'border-transparent bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="在记忆里翻找…"
          data-testid="ombre-search"
          className="w-full rounded-xl border border-border bg-surface-2 py-2 pl-9 pr-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
        />
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> 正在翻记忆…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-6 text-center text-[12px] text-destructive">
          {error}
        </p>
      ) : sorted.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-muted-foreground">
          {debounced ? '没有匹配的回忆。' : '这片记忆还空着。'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="ombre-list">
          {sorted.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setSelected(b)}
                data-testid="ombre-card"
                className="paper-card group w-full px-3.5 py-3 text-left transition hover:border-primary/40 hover:bg-surface-2"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {b.name}
                  </span>
                  {b.pinned && <Pin size={12} className="shrink-0 fill-primary/70 text-primary" />}
                  <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {TYPE_BADGE[b.type] ?? b.type}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-[11px] leading-5 text-muted-foreground">
                  {b.contentPreview || '（无预览）'}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span>活跃 {Math.round(b.score)}</span>
                  {b.domain.slice(0, 2).map((d) => (
                    <span key={d} className="rounded bg-surface-2 px-1.5 py-0.5">
                      #{d}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <OmbreDetail bucket={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/**
 * MemoryTab —— 「记忆」页签的内容容器（2026-10-21）。
 * 先探一下 OB Dashboard 有没有配/在线，没配就给一句温柔的提示，而不是空网格。
 */
export function MemoryTab() {
  const [status, setStatus] = useState<OmbreStatus | null>(null);

  useEffect(() => {
    let alive = true;
    getOmbreStatus()
      .then((s) => alive && setStatus(s))
      .catch(() =>
        alive &&
        setStatus({ configured: false, up: false, url: null, total: 0, dynamic: 0, permanent: 0, pinned: 0, resolved: 0 }),
      );
    return () => {
      alive = false;
    };
  }, []);

  if (!status) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> 正在连记忆中枢…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="paper-card p-5 text-[12px] leading-5 text-muted-foreground">
        <p className="font-medium text-foreground">记忆中枢还没接上</p>
        <p className="mt-1">
          在后端 <code className="rounded bg-surface-3 px-1">.env</code> 里配上{' '}
          <code className="rounded bg-surface-3 px-1">OMBRE_DASHBOARD_URL</code> 与{' '}
          <code className="rounded bg-surface-3 px-1">OMBRE_DASHBOARD_PASSWORD</code>，
          心潮的瓣和记忆桶就是同一个中枢了。
        </p>
      </div>
    );
  }

  if (!status.up) {
    return (
      <div className="paper-card p-5 text-[12px] leading-5 text-muted-foreground">
        <p className="font-medium text-foreground">记忆中枢离线</p>
        <p className="mt-1">OB Dashboard 没回应，但心潮还在。等它重新起来，这里会浮现旧的回忆。</p>
      </div>
    );
  }

  return <OmbreMemories />;
}

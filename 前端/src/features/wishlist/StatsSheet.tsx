import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CalendarDays, Flame, Layers, Sparkles } from 'lucide-react';
import { computeStats, type Entry } from './inspiration';

/**
 * 统计（2026-11-14，照 flomoplus 的「统计」页）：概览三格 + 近 26 周热力图 + 来源分布。
 *
 * 数据全部在本地算（两条流本来就已经拉下来了），不额外开接口 ——
 * 这点和 flomoplus 的「本地优先」一致：看一眼自己的记录节奏，不该再等一次网络。
 */

function heatAlpha(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 0.18;
  if (n <= 3) return 0.36;
  if (n <= 6) return 0.58;
  if (n <= 12) return 0.78;
  return 1;
}

export function StatsSheet({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  const s = computeStats(entries);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const max = Math.max(1, ...s.sources.map((x) => x.count));
  const since = s.firstAt
    ? (() => {
        const d = new Date(s.firstAt);
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
      })()
    : '—';

  return createPortal(
    <div className="insp-page fixed inset-0 z-[1320] overflow-y-auto bg-page-bg" data-testid="insp-stats">
      <div className="mx-auto w-full max-w-md">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-page-line bg-page-bg px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            data-testid="insp-stats-back"
            className="icon-btn h-8 w-8 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[15px] font-semibold text-foreground">统计</h1>
          <span className="ml-auto text-[10.5px] text-muted-foreground/70">从 {since} 开始</span>
        </header>

        <div className="px-4 pb-12 pt-3">
          {/* 概览 */}
          <p className="pl-1 text-[11px] font-medium text-muted-foreground">概览</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {[
              { icon: Layers, n: s.total, label: '总灵感', color: '#5B7FBF' },
              { icon: CalendarDays, n: s.thisMonth, label: '本月新增', color: '#5E9A86' },
              { icon: Flame, n: s.streak, label: '连续天数', color: '#C97A4A' },
            ].map((x) => (
              <div
                key={x.label}
                className="flex flex-col items-center gap-1 rounded-[16px] border border-border/60 bg-card px-2 py-3"
              >
                <x.icon className="h-4 w-4" style={{ color: x.color }} />
                <span className="text-[19px] font-semibold leading-none tracking-tight text-foreground">
                  {x.n}
                </span>
                <span className="text-[10px] text-muted-foreground">{x.label}</span>
              </div>
            ))}
          </div>

          {/* 热力图 */}
          <p className="mt-5 pl-1 text-[11px] font-medium text-muted-foreground">近 26 周记录分布</p>
          <div className="mt-1.5 rounded-[18px] border border-border/60 bg-card p-3">
            <div
              className="grid grid-flow-col grid-rows-7 gap-[3px]"
              role="img"
              aria-label={`近 26 周共记录 ${s.heat.reduce((a, b) => a + b.count, 0)} 条`}
            >
              {s.heat.map((d) => (
                <span
                  key={d.day}
                  title={`${d.day} · ${d.count} 条`}
                  className="aspect-square rounded-[2.5px]"
                  style={{
                    background:
                      d.count > 0
                        ? `hsl(var(--primary) / ${heatAlpha(d.count)})`
                        : 'hsl(var(--muted))',
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground/60">
              少
              {[0, 1, 3, 8, 14].map((n) => (
                <span
                  key={n}
                  className="h-[9px] w-[9px] rounded-[2px]"
                  style={{
                    background: n ? `hsl(var(--primary) / ${heatAlpha(n)})` : 'hsl(var(--muted))',
                  }}
                />
              ))}
              多
            </div>
          </div>

          {/* 来源分布 */}
          <p className="mt-5 pl-1 text-[11px] font-medium text-muted-foreground">来源分布</p>
          <div className="mt-1.5 rounded-[18px] border border-border/60 bg-card px-3.5 py-2">
            {s.sources.length === 0 ? (
              <p className="flex items-center gap-1.5 py-2 text-[12px] text-muted-foreground/70">
                <Sparkles className="h-3.5 w-3.5" />
                还没有任何记录
              </p>
            ) : (
              s.sources.map((x, i) => (
                <div
                  key={x.label}
                  className={
                    i === 0 ? 'flex items-center gap-2 py-2' : 'flex items-center gap-2 border-t border-border/50 py-2'
                  }
                >
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: x.color }}
                  />
                  <span className="w-[62px] shrink-0 text-[12px] text-foreground">{x.label}</span>
                  <span className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.max(4, (x.count / max) * 100)}%`,
                        background: x.color,
                        opacity: 0.75,
                      }}
                    />
                  </span>
                  <span className="w-[52px] shrink-0 text-right text-[10.5px] text-muted-foreground">
                    {x.count}（{Math.round((x.count / Math.max(1, s.total)) * 100)}%）
                  </span>
                </div>
              ))
            )}
          </div>

          <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground/60">
            这个页面只统计「灵感库」里的东西：剪回来的、以及你自己写的。数据一直在本机。
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

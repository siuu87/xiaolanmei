import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { getTokenStats, type TokenStats } from '@/lib/api/token';
import { getBillingBalance, type BillingBalance } from '@/lib/api/billing';
import {
  BigRing,
  EMPTY_STATS,
  fmtCny,
  CNY_PER_USD,
  stationIdOf,
  modelLabel,
  StationPicker,
} from './StationPicker';

/**
 * Token 明细页（/token）：
 * - 大圆圈进度条：圈里显示选中站子的总花费 + 余额（还剩）；
 * - 下方每个模型一条用量进度条（该模型花费 / 选中范围总花费）；
 * - 右上角可换站子，看不同站子的数据。
 */
export function TokenPage() {
  const [stats, setStats] = useState<TokenStats>(EMPTY_STATS);
  const [balanceInfo, setBalanceInfo] = useState<BillingBalance | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getTokenStats(0)
        .then((s) => {
          if (alive) setStats(s);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30_000);
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getBillingBalance()
        .then((b) => {
          if (alive) setBalanceInfo(b);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 120_000);
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, []);

  const stationList = stats.byStation;
  const isAll = selectedStation == null;
  const selectedName = isAll
    ? null
    : (stationList.find((s) => stationIdOf(s) === selectedStation)?.name ?? null);
  const selectedCost = isAll
    ? stats.totals.cost
    : (stationList.find((s) => stationIdOf(s) === selectedStation)?.cost ?? 0);

  const spentCny = selectedCost * CNY_PER_USD;
  const balance = balanceInfo?.available ? balanceInfo.balance : 0;
  const remaining = balanceInfo?.available ? Math.max(0, balance - spentCny) : null;
  const share = balance > 0 ? Math.min(1, spentCny / balance) : 0;

  // 选中范围内的模型（按花费降序）
  const models = useMemo(() => {
    const list = isAll
      ? stats.byModel
      : stats.byModel.filter((m) => m.stationName === selectedName);
    return [...list].sort((a, b) => b.cost - a.cost);
  }, [stats, isAll, selectedName]);

  const denom = selectedCost > 0 ? selectedCost : stats.totals.cost;

  return (
    <PageShell
      title="Token 明细"
      eyebrow="TOKEN"
      backTo="/chat"
      right={
        <StationPicker
          stationList={stationList}
          selectedStation={selectedStation}
          onSelect={setSelectedStation}
        />
      }
    >
      {/* 大圆圈进度条 */}
      <div className="mt-2 flex flex-col items-center">
        <div className="relative h-44 w-44">
          <BigRing share={share} strokeWidth={4} />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="text-[11px] text-muted-foreground">{selectedName ?? '全部站子'}</span>
            <span className="mt-1 text-2xl font-semibold tabular-nums text-foreground leading-none">
              {fmtCny(spentCny)}
            </span>
            <span className="mt-1.5 text-[11px] text-muted-foreground">
              {remaining == null ? '余额 —' : `还剩 ${fmtCny(remaining)}`}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {balance > 0 ? `已用 ${Math.round(share * 100)}%` : '余额 —'} · 余额{' '}
          {balanceInfo?.available ? fmtCny(balance) : '—'}
        </p>
      </div>

      {/* 各模型用量进度条 */}
      <div className="mt-7">
        <h3 className="eyebrow mb-3">各模型用量</h3>
        {models.length > 0 ? (
          <div className="space-y-3.5">
            {models.map((m) => {
              const pct = denom > 0 ? Math.min(100, (m.cost / denom) * 100) : 0;
              return (
                <div key={m.model}>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-foreground/80">{modelLabel(m.model)}</span>
                    <span className="shrink-0 tabular-nums text-foreground/90">{fmtCny(m.cost * CNY_PER_USD)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60">还没有调用记录</p>
        )}
      </div>
    </PageShell>
  );
}

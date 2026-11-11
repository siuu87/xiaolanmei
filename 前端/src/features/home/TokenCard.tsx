import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTokenStats, type TokenStats } from '@/lib/api/token';
import { getBillingBalance, type BillingBalance } from '@/lib/api/billing';
import {
  BigRing,
  EMPTY_STATS,
  fmtCny,
  CNY_PER_USD,
  stationIdOf,
  StationPicker,
} from './StationPicker';

/**
 * Token 记录卡片（首页用，极简版）：
 * - 只显示「花了多少 / 还剩多少」——一个大圆环；
 * - 右上角切换站子（全部 / 某站子）；
 * - 整卡可点，进入 /token 详情页看每个模型的用量进度条。
 */
export function TokenCard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<TokenStats>(EMPTY_STATS);
  const [balanceInfo, setBalanceInfo] = useState<BillingBalance | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  // 花费统计：30 秒 + 聚焦刷新
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

  // 账户余额：挂载 + 聚焦 + 每 2 分钟
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
  const selectedCost = selectedStation == null
    ? stats.totals.cost
    : (stationList.find((s) => stationIdOf(s) === selectedStation)?.cost ?? 0);
  const selectedName = selectedStation == null
    ? null
    : (stationList.find((s) => stationIdOf(s) === selectedStation)?.name ?? null);

  const spentCny = selectedCost * CNY_PER_USD;
  const balance = balanceInfo?.available ? balanceInfo.balance : 0;
  const remaining = balanceInfo?.available ? Math.max(0, balance - spentCny) : null;
  const share = balance > 0 ? Math.min(1, spentCny / balance) : 0;

  return (
    <div
      className="glass relative z-10 flex cursor-pointer flex-col p-3"
      onClick={() => navigate('/token')}
    >
      {/* 头部：标题 + 右上角换站子 */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xs text-muted-foreground">Token 记录</h2>
        <div onClick={(e) => e.stopPropagation()}>
          <StationPicker
            stationList={stationList}
            selectedStation={selectedStation}
            onSelect={setSelectedStation}
          />
        </div>
      </div>

      {/* 圆圈：花了多少 / 还剩多少 */}
      <div className="mt-3 flex flex-col items-center gap-1.5">
        <div className="relative h-20 w-20">
          <BigRing share={share} strokeWidth={5} />
          <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[13px] font-semibold tabular-nums text-foreground leading-none">
              {fmtCny(spentCny)}
            </span>
            <span className="mt-0.5 text-[8px] text-muted-foreground leading-none">
              {selectedName ?? '已花费'}
            </span>
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {remaining == null ? '还剩 —' : `还剩 ${fmtCny(remaining)}`}
        </span>
      </div>

      <div className="mt-2 text-center text-[10px] text-muted-foreground/70">查看明细 ›</div>
    </div>
  );
}

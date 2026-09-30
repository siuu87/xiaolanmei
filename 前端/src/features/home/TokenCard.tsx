import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTokenStats, type TokenStats } from '@/lib/api/token';
import { getBillingBalance, type BillingBalance } from '@/lib/api/billing';

/** 美元 → 人民币近似汇率（后端成本按美元计） */
const CNY_PER_USD = 7.2;

/** 人民币金额显示：小金额多留几位小数 */
function fmtCny(cny: number): string {
  if (cny === 0) return '¥0.00';
  if (cny < 0.01) return `¥${cny.toFixed(4)}`;
  return `¥${cny.toFixed(2)}`;
}

/** 把模型名映射成更好读的模型名 */
function modelLabel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('deepseek-reasoner')) return 'DeepSeek-R1';
  if (m.includes('deepseek')) return 'DeepSeek';
  if (m.includes('gpt-4o-mini')) return 'GPT-4o Mini';
  if (m.includes('gpt-4o')) return 'GPT-4o';
  if (m.includes('gpt-4.1')) return 'GPT-4.1';
  if (m.includes('claude-opus')) return 'Claude Opus';
  if (m.includes('claude-sonnet')) return 'Claude Sonnet';
  if (m.includes('claude-haiku')) return 'Claude Haiku';
  if (m.includes('qwen')) return 'Qwen';
  if (m.includes('gemini')) return 'Gemini';
  return model;
}

const EMPTY: TokenStats = {
  totals: { input: 0, output: 0, total: 0, cost: 0, calls: 0 },
  byModel: [],
  byStation: [],
  byDay: [],
  byFeature: [],
  byConversation: [],
};

/**
 * Token 记录卡片：从后端 token_usage 拉真实统计（每次 AI 调用自动落库）。
 * - 左边一个大圆环 = 累计已花费，右边 = 各模型的具体花费（过多可滑动）；
 * - 右上角「分类」按 API 站子聚合展开；
 * - 余额从接入的 API 站子自动查询（后端用 Key 直连上游），不再手动填；
 * - 每 30 秒 + 窗口聚焦自动刷新花费；余额每 2 分钟刷一次。
 */
export function TokenCard() {
  const [stats, setStats] = useState<TokenStats>(EMPTY);
  const [balanceInfo, setBalanceInfo] = useState<BillingBalance | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<string | null>(null); // null = 全部
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外部时收起
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

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

  // 账户余额：挂载 + 聚焦 + 每 2 分钟（后端自身还带 60 秒缓存）
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

  // 按 API 站子聚合（后端已按真实站子算好，直接展示）
  const stationList = stats.byStation;
  const stationIdOf = (s: (typeof stationList)[number]) => s.stationId ?? '__other__';
  // 选中的花费范围：全部 = totals，否则 = 对应站子
  const selectedCost = selectedStation == null
    ? stats.totals.cost
    : (stationList.find((s) => stationIdOf(s) === selectedStation)?.cost ?? 0);
  const selectedName = selectedStation == null
    ? null
    : (stationList.find((s) => stationIdOf(s) === selectedStation)?.name ?? null);

  const totalSpentCny = stats.totals.cost * CNY_PER_USD; // 余额/还剩按总额算
  const spentCny = selectedCost * CNY_PER_USD; // 圆环按选中范围算
  const balance = balanceInfo?.available ? balanceInfo.balance : 0;
  const remaining = balanceInfo?.available ? Math.max(0, balance - totalSpentCny) : null;

  // 各模型花费（右边，过多可滑动）
  const models = stats.byModel;

  return (
    <div className="glass relative z-10 flex flex-col p-3">
      {/* 头部：标题 + 右上角分类（点击在下方展开折叠菜单） */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xs text-muted-foreground">Token 记录</h2>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            分类
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>

          {/* 折叠菜单：按 API 站子聚合 */}
          {open && (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-border/60 bg-popover/95 p-2 shadow-lg backdrop-blur-xl">
              <div className="mb-1 px-1 text-[10px] text-muted-foreground">按站子</div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStation(null);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] hover:bg-muted/50',
                    selectedStation == null && 'bg-muted/50',
                  )}
                >
                  <span className="text-foreground/80">全部</span>
                  <span className="tabular-nums text-muted-foreground">{fmtCny(totalSpentCny)}</span>
                </button>
                {stationList.length > 0 ? (
                  stationList.map((s) => (
                    <button
                      key={stationIdOf(s)}
                      type="button"
                      onClick={() => {
                        setSelectedStation(stationIdOf(s));
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] hover:bg-muted/50',
                        selectedStation === stationIdOf(s) && 'bg-muted/50',
                      )}
                    >
                      <span className="text-foreground/80">{s.name}</span>
                      <span className="tabular-nums text-muted-foreground">{fmtCny(s.cost * CNY_PER_USD)}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-1.5 py-1 text-[11px] text-muted-foreground/50">还没有调用记录</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 左边大圆环（已花费） + 右边各模型花费 */}
      <div className="mt-3 flex items-center gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="relative h-16 w-16">
            <BigRing share={balance > 0 ? Math.min(1, spentCny / balance) : 0} />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-foreground">
              {fmtCny(spentCny)}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground">{selectedName ?? '已花费'}</span>
        </div>

        <div className="max-h-24 min-w-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {models.length > 0 ? (
            models.map((m) => (
              <div key={m.model} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-foreground/80">{modelLabel(m.model)}</span>
                <span className="shrink-0 tabular-nums text-foreground/90">{fmtCny(m.cost * CNY_PER_USD)}</span>
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground/50">暂无调用</span>
          )}
        </div>
      </div>

      {/* 余额 / 还剩 */}
      <div className="mt-3 space-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>余额</span>
          <span className="tabular-nums text-foreground/90" title={balanceInfo?.source}>
            {balanceInfo == null ? '…' : balanceInfo.available ? fmtCny(balanceInfo.balance) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>还剩</span>
          <span className="tabular-nums text-foreground/90">{remaining == null ? '—' : fmtCny(remaining)}</span>
        </div>
        {balanceInfo && !balanceInfo.available && (
          <div className="text-[9px] text-muted-foreground/60">{balanceInfo.source}</div>
        )}
      </div>
    </div>
  );
}

/** 大圆环：环弧 = 已花费占余额的比例（无余额时只画底圈） */
function BigRing({ share }: { share: number }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="5" className="stroke-muted-foreground/15" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        className="stroke-primary transition-all duration-700 ease-out"
      />
    </svg>
  );
}

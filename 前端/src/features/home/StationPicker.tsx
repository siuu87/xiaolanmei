import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TokenStats } from '@/lib/api/token';

/** 美元 → 人民币近似汇率（后端成本按美元计） */
export const CNY_PER_USD = 7.2;

/** 人民币金额显示：小金额多留几位小数 */
export function fmtCny(cny: number): string {
  if (cny === 0) return '¥0.00';
  if (cny < 0.01) return `¥${cny.toFixed(4)}`;
  return `¥${cny.toFixed(2)}`;
}

export type StationItem = TokenStats['byStation'][number];
export const stationIdOf = (s: StationItem) => s.stationId ?? '__other__';

/** 把模型名映射成更好读的模型名 */
export function modelLabel(model: string): string {
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

/** Token 统计的空值（避免每次渲染新建） */
export const EMPTY_STATS: TokenStats = {
  totals: { input: 0, output: 0, total: 0, cost: 0, calls: 0 },
  byModel: [],
  byStation: [],
  byDay: [],
  byFeature: [],
  byConversation: [],
};

/** 圆环：环弧 = share(0~1) 占满程度 */
export function BigRing({ share, strokeWidth = 4 }: { share: number; strokeWidth?: number }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
      <circle cx="24" cy="24" r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted-foreground/15" />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, share)))}
        className="stroke-primary transition-all duration-700 ease-out"
      />
    </svg>
  );
}

/** 站子选择器：点开下拉，选「全部站子」或某个站子 */
export function StationPicker({
  stationList,
  selectedStation,
  onSelect,
}: {
  stationList: StationItem[];
  selectedStation: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const currentName =
    selectedStation == null
      ? '全部站子'
      : (stationList.find((s) => stationIdOf(s) === selectedStation)?.name ?? '全部站子');

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
      >
        {currentName}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-border bg-popover p-2 shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]">
          <div className="mb-1 px-1 text-[10px] text-muted-foreground">按站子</div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] hover:bg-muted/50',
                selectedStation == null && 'bg-muted/50',
              )}
            >
              <span className="text-foreground/80">全部站子</span>
            </button>
            {stationList.map((s) => (
              <button
                key={stationIdOf(s)}
                type="button"
                onClick={() => {
                  onSelect(stationIdOf(s));
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-[11px] hover:bg-muted/50',
                  selectedStation === stationIdOf(s) && 'bg-muted/50',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-foreground/80" title={s.name}>
                  {s.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{fmtCny(s.cost * CNY_PER_USD)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

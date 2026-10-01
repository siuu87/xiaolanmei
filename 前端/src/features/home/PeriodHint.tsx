import { usePeriodStore, periodDayIndexOf, predictNextStart, careMessage } from './periodStore';
import { periodSummary, diffDays, todayISODate } from '@/lib/cycle';

/**
 * 经期温暖提示（首页）：仅在「正在经期」或「预测经期临近（3 天内）」时显示，
 * 提示记得保暖、多关心，附「上次经期 X 天前 · 平均周期 Y 天」摘要。
 */
export function PeriodHint() {
  const records = usePeriodStore((s) => s.records);
  const settings = usePeriodStore((s) => s.settings);
  const today = todayISODate();

  const idx = periodDayIndexOf(today, records);
  const next = predictNextStart(records, settings);
  const daysToNext = next ? diffDays(today, next) : null;

  const inPeriod = idx !== null;
  const nearNext = !inPeriod && daysToNext !== null && daysToNext >= 0 && daysToNext <= 3;
  if (!inPeriod && !nearNext) return null;

  const care = careMessage({ records, settings });
  const summary = periodSummary(records, settings, today);

  return (
    <div className="rounded-2xl bg-gradient-to-r from-rose-500/15 via-pink-500/10 to-transparent px-4 py-3 ring-1 ring-rose-400/25">
      <div className="flex items-center gap-2.5">
        <span className="text-lg leading-none">💗</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose-100/90">{care}</p>
          {summary && <p className="mt-0.5 text-xs text-rose-200/50">{summary}</p>}
        </div>
      </div>
    </div>
  );
}

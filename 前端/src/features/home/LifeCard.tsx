/**
 * 首页「生活」卡（2026-11-10）：承接从设置页移出的两项。
 *
 * 设置大改时用户要求「提醒的和记录的归到首页的生活里」：
 * - 经期预测：读 periodStore，展示下次预测日期（记录仍在首页日历里点选）。
 * - 睡前提醒：复用 `blueberry.bedReminder` 同一把 localStorage 开关，
 *   `BedtimeNudge`（AppLayout 全局挂载）读它，22:00–02:59 弹一次夜间提醒。
 */
import { CalendarDays, Moon } from 'lucide-react';
import { usePeriodStore, predictNextStart } from '@/features/home/periodStore';
import { useLocalSwitch } from '@/lib/useLocalSwitch';
import { IOSSwitch } from '@/components/ios/IOSSwitch';

function fmtNext(iso: string | null): string {
  if (!iso) return '尚未记录';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '尚未记录';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function LifeCard() {
  const records = usePeriodStore((s) => s.records);
  const settings = usePeriodStore((s) => s.settings);
  const [bedReminder, setBedReminder] = useLocalSwitch('blueberry.bedReminder', false);

  const next = predictNextStart(records, settings);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="eyebrow shrink-0">生活</h2>
        <span aria-hidden className="hairline flex-1" />
      </div>
      <div className="glass divide-y divide-border overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-400/15 text-rose-500">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-foreground">经期预测</p>
            <p className="text-[12px] text-muted-foreground">
              {next ? `下次预测 ${fmtNext(next)}` : '在日历里点选日期即可记录'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-400/15 text-indigo-500">
            <Moon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-foreground">睡前提醒</p>
            <p className="text-[12px] text-muted-foreground">
              {bedReminder ? '22:00 后提醒一次，可直达晚安页' : '关闭中'}
            </p>
          </div>
          <IOSSwitch checked={bedReminder} onCheckedChange={setBedReminder} aria-label="睡前提醒" />
        </div>
      </div>
    </section>
  );
}

import { AnniversaryCard } from './AnniversaryCard';
import { MoodCard } from './MoodCard';
import { CalendarCard } from './CalendarCard';
import { CourseCard } from './CourseCard';
import { TodoCard } from './TodoCard';
import { TokenCard } from './TokenCard';
import { FeatureGrid } from './FeatureGrid';
import { PeriodHint } from './PeriodHint';
import { useMemorialStore } from './memorialStore';
import { useProfileStore } from '@/stores/profileStore';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function greeting(hour: number) {
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function HomePage() {
  const memorialDays = useMemorialStore((s) => s.days);
  const pinnedDay = memorialDays.find((d) => d.pinned);
  const name = useProfileStore((s) => s.name);
  const partnerName = useProfileStore((s) => s.partnerRemark || s.partnerName);
  const now = new Date();

  return (
    <div className="relative min-h-full bg-page-bg text-foreground">
      <div className="relative mx-auto w-full max-w-md px-4 py-5">
        {/* 顶部环境光，营造呼吸感 */}
        <div aria-hidden className="page-wash pointer-events-none absolute inset-x-0 top-0 h-52" />

        <header className="rise-in relative mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">
              {now.getMonth() + 1} 月 {now.getDate()} 日 · 周{WEEK[now.getDay()]}
            </p>
            <h1 className="display text-[26px] font-semibold leading-tight tracking-tight text-foreground">
              {greeting(now.getHours())}，{name || '你'}
            </h1>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {partnerName ? `今天也和 ${partnerName} 一起，记一笔吧。` : '今天也留一点时间给自己。'}
            </p>
          </div>
          <span className="brand-seal mt-1 h-10 w-10 shrink-0 text-[20px] shadow-glow" aria-hidden>
            🫐
          </span>
        </header>

        <div className="relative space-y-4">
          {/* 置顶区域：有置顶纪念日才显示，否则留空 */}
          {pinnedDay && <AnniversaryCard memorial={pinnedDay} />}
          <MoodCard />
          <CalendarCard />
          <PeriodHint />
          <CourseCard />
          <div className="grid grid-cols-2 gap-3">
            <TodoCard />
            <div data-testid="token-capsule">
              <TokenCard />
            </div>
          </div>
          <FeatureGrid />
        </div>
      </div>
    </div>
  );
}

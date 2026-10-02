import { AnniversaryCard } from './AnniversaryCard';
import { CalendarCard } from './CalendarCard';
import { CourseCard } from './CourseCard';
import { TodoCard } from './TodoCard';
import { TokenCard } from './TokenCard';
import { FeatureGrid } from './FeatureGrid';
import { PeriodHint } from './PeriodHint';
import { InspirationNoteCard } from '@/features/notes/InspirationNoteCard';
import { HealthIndicator } from '@/components/HealthIndicator';
import { useMemorialStore } from './memorialStore';

export function HomePage() {
  const memorialDays = useMemorialStore((s) => s.days);
  const pinnedDay = memorialDays.find((d) => d.pinned);

  return (
    <div className="relative mx-auto w-full max-w-md px-4 py-6">
      {/* 顶部环境光，营造呼吸感 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary/10 to-transparent" />

      <div className="relative space-y-4">
        {/* 置顶区域：有置顶纪念日才显示，否则留空 */}
        {pinnedDay && <AnniversaryCard memorial={pinnedDay} />}
        <CalendarCard />
        <PeriodHint />
        <HealthIndicator />
        <CourseCard />
        <TodoCard />
        <div className="grid grid-cols-2 items-start gap-3">
          <TokenCard />
          <InspirationNoteCard />
        </div>
        <FeatureGrid />
      </div>
    </div>
  );
}

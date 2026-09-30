import { AnniversaryCard } from './AnniversaryCard';
import { CalendarCard } from './CalendarCard';
import { CourseCard } from './CourseCard';
import { TodoCard } from './TodoCard';
import { TokenCard } from './TokenCard';
import { FeatureGrid } from './FeatureGrid';
import { InspirationNoteCard } from '@/features/notes/InspirationNoteCard';

export function HomePage() {
  return (
    <div className="relative mx-auto w-full max-w-md px-4 py-6">
      {/* 顶部环境光，营造呼吸感 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary/10 to-transparent" />

      <div className="relative space-y-4">
        <AnniversaryCard />
        <CalendarCard />
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

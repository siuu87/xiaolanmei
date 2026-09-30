import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useTimetableStore, coursesForDayWeek, isMorningCourse, todayDay, type Course } from '@/features/schedule/timetableStore';

/** 首页课程小卡片：今天上午（12 点前）的课；连堂课只算一门，卡片固定只占「半天」 */
export function CourseCard() {
  const navigate = useNavigate();
  const courses = useTimetableStore((s) => s.courses);
  const periodTimes = useTimetableStore((s) => s.periodTimes);
  const week = useTimetableStore((s) => s.currentWeek);

  const todays = coursesForDayWeek(courses, todayDay(), week);
  const items = todays.filter((c) => isMorningCourse(c, periodTimes));
  const rest = todays.length - items.length;

  const label = (c: Course) => {
    const p = c.endPeriod !== c.startPeriod ? `${c.startPeriod}-${c.endPeriod}` : `${c.startPeriod}`;
    const start = periodTimes[c.startPeriod - 1]?.start;
    const end = periodTimes[c.endPeriod - 1]?.end;
    const time = start && end ? ` ${start}–${end}` : '';
    return `第${p}节${time}`;
  };

  return (
    <div className="glass p-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="font-serif text-xs text-muted-foreground">今日课程</h2>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          className="text-xs text-primary transition hover:underline"
        >
          课程表
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground/70">
          {rest > 0 ? '上午没课，下午才有～' : '今天没有课，好好休息～'}
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="shrink-0 font-serif text-xs text-muted-foreground">{label(c)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{c.name}</span>
              {c.location && <span className="shrink-0 text-[10px] text-muted-foreground">{c.location}</span>}
            </li>
          ))}
          {rest > 0 && (
            <li className="pt-0.5 text-center text-[11px] text-muted-foreground">下午还有 {rest} 门</li>
          )}
        </ul>
      )}
    </div>
  );
}

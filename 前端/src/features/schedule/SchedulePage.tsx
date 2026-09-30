import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimetableView } from './TimetableView';
import {
  useTimetableStore,
  todayDay,
  WEEKDAY_LABELS,
  PERIOD_LABELS,
  COURSE_COLORS,
  type Course,
  type Parity,
} from './timetableStore';

/** 课程表：周次网格（周一~周日 × 节次），点空白添加、点课程编辑 */
export function SchedulePage() {
  const navigate = useNavigate();
  const [courseEditing, setCourseEditing] = useState<Course | null>(null);
  const [courseCreating, setCourseCreating] = useState<{ day: number; startPeriod: number } | null>(null);

  const openCourse = (day?: number, startPeriod?: number) => {
    const d = day ?? todayDay();
    const p = startPeriod != null ? startPeriod : 1;
    setCourseCreating({ day: d, startPeriod: p });
  };
  const close = () => {
    setCourseEditing(null);
    setCourseCreating(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="返回"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-bold">课程表</h1>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => openCourse()}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> 添加
        </button>
      </div>

      {/* 课程表 */}
      <div className="mt-4">
        <TimetableView onCreate={openCourse} onEdit={setCourseEditing} />
      </div>

      {(courseEditing || courseCreating) && (
        <CourseEditor
          key={courseEditing?.id ?? 'new'}
          course={courseEditing}
          initial={courseCreating ?? { day: todayDay(), startPeriod: 1 }}
          onClose={close}
        />
      )}
    </div>
  );
}

/* ------------------------------ 课程编辑器 ------------------------------ */

interface CourseEditorProps {
  course?: Course | null;
  initial: { day: number; startPeriod: number };
  onClose: () => void;
}

function CourseEditor({ course, initial, onClose }: CourseEditorProps) {
  const addCourse = useTimetableStore((s) => s.addCourse);
  const updateCourse = useTimetableStore((s) => s.updateCourse);
  const removeCourse = useTimetableStore((s) => s.removeCourse);
  const totalWeeks = useTimetableStore((s) => s.totalWeeks);

  const [name, setName] = useState(course?.name ?? '');
  const [teacher, setTeacher] = useState(course?.teacher ?? '');
  const [location, setLocation] = useState(course?.location ?? '');
  const [day, setDay] = useState(course?.day ?? initial.day);
  const [startPeriod, setStartPeriod] = useState(course?.startPeriod ?? initial.startPeriod);
  const [endPeriod, setEndPeriod] = useState(course?.endPeriod ?? initial.startPeriod);
  const [startWeek, setStartWeek] = useState(course?.startWeek ?? 1);
  const [endWeek, setEndWeek] = useState(course?.endWeek ?? totalWeeks);
  const [parity, setParity] = useState<Parity>(course?.parity ?? 'all');
  const [color, setColor] = useState(course?.color ?? COURSE_COLORS[1]);

  const inputCls =
    'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const sp = Math.min(startPeriod, endPeriod);
    const ep = Math.max(startPeriod, endPeriod);
    const payload = {
      name: n,
      teacher: teacher.trim() || undefined,
      location: location.trim() || undefined,
      day,
      startPeriod: sp,
      endPeriod: ep,
      startWeek: Math.min(startWeek, endWeek),
      endWeek: Math.max(startWeek, endWeek),
      parity,
      color,
    };
    if (course) updateCourse(course.id, payload);
    else addCourse(payload);
    onClose();
  };

  const remove = () => {
    if (course) removeCourse(course.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{course ? '编辑课程' : '添加课程'}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">课程名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="如：高等数学"
              autoFocus
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">老师（可选）</label>
              <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="如：张老师" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">教室（可选）</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：A102" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">周几</label>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={inputCls}>
                {WEEKDAY_LABELS.map((w, i) => (
                  <option key={w} value={i + 1}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">颜色</label>
              <div className="flex h-10 items-center gap-1.5">
                {COURSE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`颜色 ${c}`}
                    className={cn(
                      'h-6 w-6 rounded-full transition',
                      color === c ? 'ring-2 ring-offset-2 ring-offset-background' : 'opacity-70 hover:opacity-100',
                    )}
                    style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">起始节</label>
              <select value={startPeriod} onChange={(e) => setStartPeriod(Number(e.target.value))} className={inputCls}>
                {PERIOD_LABELS.map((p, i) => (
                  <option key={p} value={i + 1}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">结束节</label>
              <select value={endPeriod} onChange={(e) => setEndPeriod(Number(e.target.value))} className={inputCls}>
                {PERIOD_LABELS.map((p, i) => (
                  <option key={p} value={i + 1}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">起始周</label>
              <input type="number" min={1} max={totalWeeks} value={startWeek} onChange={(e) => setStartWeek(Number(e.target.value) || 1)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">结束周</label>
              <input type="number" min={1} max={totalWeeks} value={endWeek} onChange={(e) => setEndWeek(Number(e.target.value) || 1)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">单双周</label>
              <select value={parity} onChange={(e) => setParity(e.target.value as Parity)} className={inputCls}>
                <option value="all">每周</option>
                <option value="odd">单周</option>
                <option value="even">双周</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {course && (
            <button
              type="button"
              onClick={remove}
              aria-label="删除"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

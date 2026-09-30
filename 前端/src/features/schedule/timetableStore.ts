import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listCourses, createCourse, patchCourse, deleteCourse, getTimetableConfig, putTimetableConfig } from '@/lib/api/home';
import { newId } from '@/lib/id';

export type Parity = 'all' | 'odd' | 'even';

/** 每节课的上下课时间（可自定义学期作息），"HH:mm"；留空表示不显示 */
export interface PeriodTime {
  start: string;
  end: string;
}

/** 一门课：周几 + 节次 + 周次（单双周），WakeUp 风格；时间不固定，所以用节次不用钟点 */
export interface Course {
  id: string;
  name: string; // 课程名
  location?: string; // 教室 / 地点
  teacher?: string; // 老师
  day: number; // 1=周一 ... 7=周日
  startPeriod: number; // 起始节次（1-based）
  endPeriod: number; // 结束节次
  startWeek: number; // 起始周
  endWeek: number; // 结束周
  parity: Parity; // 每周 / 单周 / 双周
  color: string;
}

/** 每天节次数 */
export const PERIODS = 12;
export const PERIOD_LABELS = Array.from({ length: PERIODS }, (_, i) => `第${i + 1}节`);

export const DEFAULT_TOTAL_WEEKS = 20;

/** 课程颜色预设（课程表块 / 课程编辑器共用） */
export const COURSE_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 今天周几（周一起始 1-7） */
export function todayDay(): number {
  return ((new Date().getDay() + 6) % 7) + 1;
}

/** 某门课在第 week 周是否上课 */
export function courseInWeek(c: Course, week: number): boolean {
  if (week < c.startWeek || week > c.endWeek) return false;
  if (c.parity === 'odd') return week % 2 === 1;
  if (c.parity === 'even') return week % 2 === 0;
  return true;
}

interface TimetableState {
  courses: Course[];
  loaded: boolean;
  totalWeeks: number;
  periodTimes: PeriodTime[];
  /** 当前是第几周（课程表周选择器 + 首页今日课程共用） */
  currentWeek: number;
  load: () => Promise<void>;
  /** 聊天图片识别（save_courses 工具）写入后，从后端拉最新课表 */
  reload: () => Promise<void>;
  addCourse: (c: Omit<Course, 'id'>) => void;
  updateCourse: (id: string, patch: Partial<Omit<Course, 'id'>>) => void;
  removeCourse: (id: string) => void;
  setTotalWeeks: (n: number) => void;
  setPeriodTime: (index: number, time: PeriodTime) => void;
  setCurrentWeek: (n: number) => void;
}

const emptyPeriodTimes = (): PeriodTime[] =>
  Array.from({ length: PERIODS }, () => ({ start: '', end: '' }));

/** 课程表 store：课程 + 总周数 + 上下课时间都写穿后端；localStorage 仅作离线缓存 */
export const useTimetableStore = create<TimetableState>()(
  persist(
    (set, get) => ({
      courses: [],
      loaded: false,
      totalWeeks: DEFAULT_TOTAL_WEEKS,
      periodTimes: emptyPeriodTimes(),
      currentWeek: 1,

      load: async () => {
        try {
          const [courses, config] = await Promise.all([listCourses(), getTimetableConfig()]);
          set({
            courses,
            totalWeeks: config.totalWeeks || DEFAULT_TOTAL_WEEKS,
            periodTimes: Array.isArray(config.periodTimes) && config.periodTimes.length
              ? config.periodTimes
              : emptyPeriodTimes(),
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      },

      reload: async () => {
        try {
          set({ courses: await listCourses() });
        } catch {
          /* 静默：拉取失败不打断聊天 */
        }
      },

      addCourse: (c) => {
        const course: Course = { ...c, id: newId() };
        set((s) => ({ courses: [...s.courses, course] }));
        void createCourse(course).catch(() => {});
      },

      updateCourse: (id, patch) => {
        set((s) => ({ courses: s.courses.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
        void patchCourse(id, patch).catch(() => {});
      },

      removeCourse: (id) => {
        set((s) => ({ courses: s.courses.filter((x) => x.id !== id) }));
        void deleteCourse(id).catch(() => {});
      },

      setTotalWeeks: (n) => {
        const totalWeeks = Math.max(1, n);
        set({ totalWeeks });
        void putTimetableConfig({ totalWeeks, periodTimes: get().periodTimes }).catch(() => {});
      },

      setPeriodTime: (index, time) => {
        const periodTimes = get().periodTimes.map((t, i) => (i === index ? time : t));
        set({ periodTimes });
        void putTimetableConfig({ totalWeeks: get().totalWeeks, periodTimes }).catch(() => {});
      },

      setCurrentWeek: (n) => set({ currentWeek: Math.max(1, n) }),
    }),
    {
      name: 'blueberry.timetable.v2',
      partialize: (s) => ({ totalWeeks: s.totalWeeks, periodTimes: s.periodTimes, currentWeek: s.currentWeek }),
    },
  ),
);

/** 某天某周的上课列表（按节次排序） */
export function coursesForDayWeek(courses: Course[], day: number, week: number): Course[] {
  return courses.filter((c) => c.day === day && courseInWeek(c, week)).sort((a, b) => a.startPeriod - b.startPeriod);
}

/** 某门课是否在上午（12 点前下课）；未设上下课时间时，默认上午为前 4 节 */
export function isMorningCourse(c: Course, periodTimes: PeriodTime[]): boolean {
  const end = periodTimes[c.endPeriod - 1]?.end;
  if (end) return end <= '12:00';
  return c.endPeriod <= 4;
}

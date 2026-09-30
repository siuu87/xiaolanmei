import { request } from './conversations';
import type { Todo } from '@/features/home/todoStore';
import type { MemorialDay } from '@/features/home/memorialStore';
import type { PeriodRecord, PeriodSettings } from '@/features/home/periodStore';
import type { DiaryEntry } from '@/features/diary/diaryData';
import type { InspirationNote } from '@/features/notes/notesData';
import type { Course } from '@/features/schedule/timetableStore';

// ---- 日记 ----
export const listDiaries = () => request<DiaryEntry[]>('/api/diaries');
export const createDiary = (entry: DiaryEntry) =>
  request<{ id: string }>('/api/diaries', { method: 'POST', body: JSON.stringify(entry) });
export const deleteDiary = (id: string) =>
  request<{ ok: true }>(`/api/diaries/${id}`, { method: 'DELETE' });

// ---- 待办 ----
export const listTodos = () => request<Todo[]>('/api/todos');
export const createTodo = (todo: Todo) =>
  request<{ id: string }>('/api/todos', { method: 'POST', body: JSON.stringify(todo) });
export const patchTodo = (id: string, patch: Partial<Todo>) =>
  request<{ ok: true }>(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteTodo = (id: string) =>
  request<{ ok: true }>(`/api/todos/${id}`, { method: 'DELETE' });

// ---- 纪念日 ----
export const listMemorials = () => request<MemorialDay[]>('/api/memorials');
export const createMemorial = (m: MemorialDay) =>
  request<{ id: string }>('/api/memorials', { method: 'POST', body: JSON.stringify(m) });
export const patchMemorial = (id: string, patch: Partial<MemorialDay>) =>
  request<{ ok: true }>(`/api/memorials/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteMemorial = (id: string) =>
  request<{ ok: true }>(`/api/memorials/${id}`, { method: 'DELETE' });

// ---- 经期 ----
export const getPeriod = () => request<{ settings: PeriodSettings; records: PeriodRecord[] }>('/api/period');
export const putPeriod = (state: { settings: PeriodSettings; records: PeriodRecord[] }) =>
  request<{ ok: true }>('/api/period', { method: 'PUT', body: JSON.stringify(state) });

// ---- 灵感便签 ----
export const listNotes = () => request<InspirationNote[]>('/api/notes');
export const createNote = (note: InspirationNote) =>
  request<{ id: string }>('/api/notes', { method: 'POST', body: JSON.stringify(note) });
export const deleteNote = (id: string) =>
  request<{ ok: true }>(`/api/notes/${id}`, { method: 'DELETE' });
export const generateNote = () => request<{ content: string }>('/api/notes/generate', { method: 'POST' });

// ---- 课程表 ----
export const listCourses = () => request<Course[]>('/api/courses');
export const createCourse = (course: Course) =>
  request<{ id: string }>('/api/courses', { method: 'POST', body: JSON.stringify(course) });
export const patchCourse = (id: string, patch: Partial<Course>) =>
  request<{ ok: true }>(`/api/courses/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteCourse = (id: string) =>
  request<{ ok: true }>(`/api/courses/${id}`, { method: 'DELETE' });

// ---- 课程表配置（总周数 + 上下课时间） ----
export interface TimetableConfig {
  totalWeeks: number;
  periodTimes: { start: string; end: string }[];
}
export const getTimetableConfig = () => request<TimetableConfig>('/api/timetable/config');
export const putTimetableConfig = (config: TimetableConfig) =>
  request<{ ok: true }>('/api/timetable/config', { method: 'PUT', body: JSON.stringify(config) });

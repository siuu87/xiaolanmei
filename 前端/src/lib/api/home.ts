import { request } from './conversations';
import type { Todo } from '@/features/home/todoStore';
import type { MemorialDay } from '@/features/home/memorialStore';
import type { PeriodRecord, PeriodSettings } from '@/features/home/periodStore';
import type { DiaryEntry, DiaryBook, DiaryPageLock, DiarySlip, DiarySticker } from '@/features/diary/diaryData';
import type { InspirationNote } from '@/features/notes/notesData';
import type { Course } from '@/features/schedule/timetableStore';

// ---- 日记 ----
export const listDiaries = () => request<DiaryEntry[]>('/api/diaries');
export const createDiary = (entry: DiaryEntry) =>
  request<{ id: string }>('/api/diaries', { method: 'POST', body: JSON.stringify(entry) });
export const patchDiary = (
  id: string,
  patch: Partial<Pick<DiaryEntry, 'date' | 'content' | 'bookId' | 'images' | 'time' | 'mood' | 'tags'>>,
) => request<{ ok: true }>(`/api/diaries/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteDiary = (id: string) =>
  request<{ ok: true }>(`/api/diaries/${id}`, { method: 'DELETE' });

// ---- 日记本（封面墙）----
export const listDiaryBooks = () => request<DiaryBook[]>('/api/diary/books');
export const createDiaryBook = (book: Omit<DiaryBook, 'id' | 'sortOrder'>) =>
  request<{ id: string }>('/api/diary/books', { method: 'POST', body: JSON.stringify(book) });
export const patchDiaryBook = (
  id: string,
  patch: Partial<Pick<DiaryBook, 'name' | 'kind' | 'cover' | 'coverImage'>>,
) => request<{ ok: true }>(`/api/diary/books/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteDiaryBook = (id: string) =>
  request<{ ok: true }>(`/api/diary/books/${id}`, { method: 'DELETE' });

// ---- 小纸条（夹在 TA 的日记里）----
export const listDiarySlips = () => request<DiarySlip[]>('/api/diary/slips');
export const createDiarySlip = (slip: DiarySlip) =>
  // 他会不会回、什么时候回都不在响应里（条埋在十几小时之后才浮现），只回我自己这张的 id
  request<{ id: string; createdAt: number }>('/api/diary/slips', {
    method: 'POST',
    body: JSON.stringify(slip),
  });
export const patchDiarySlip = (
  id: string,
  patch: Partial<Pick<DiarySlip, 'date' | 'content' | 'color' | 'x' | 'y'>>,
) => request<{ ok: true }>(`/api/diary/slips/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteDiarySlip = (id: string) =>
  request<{ ok: true }>(`/api/diary/slips/${id}`, { method: 'DELETE' });

// ---- 日记贴纸（贴在纸上，不属于某一条时刻）----
export const listDiaryStickers = () => request<DiarySticker[]>('/api/diary/stickers');
export const createDiarySticker = (sticker: Omit<DiarySticker, 'id'>) =>
  request<{ id: string; z: number }>('/api/diary/stickers', {
    method: 'POST',
    body: JSON.stringify(sticker),
  });
export const patchDiarySticker = (
  id: string,
  patch: Partial<Pick<DiarySticker, 'x' | 'y' | 'scale' | 'rot'>>,
) => request<{ ok: true }>(`/api/diary/stickers/${id}`, {
  method: 'PATCH',
  body: JSON.stringify(patch),
});
export const deleteDiarySticker = (id: string) =>
  request<{ ok: true }>(`/api/diary/stickers/${id}`, { method: 'DELETE' });

// ---- 单页锁（只锁某一天那一页；密码不下发，校验走后端）----
export const listDiaryPageLocks = () =>
  request<DiaryPageLock[]>('/api/diary/page-locks');
export const lockDiaryPage = (input: { bookId: string; date: string; code: string }) =>
  request<{ id: string }>('/api/diary/page-locks', { method: 'PUT', body: JSON.stringify(input) });
export const checkDiaryPageCode = (input: { bookId: string; date: string; code: string }) =>
  request<{ ok: true; gone?: boolean }>('/api/diary/page-locks/check', {
    method: 'POST',
    body: JSON.stringify(input),
  });
/** 猜不出密码就撬：这一页会被记下「闯过」，TA 会发现 */
export const sneakDiaryPage = (input: { bookId: string; date: string; tries: number }) =>
  request<{ ok: true; gone?: boolean; line: string }>('/api/diary/page-locks/sneak', {
    method: 'POST',
    body: JSON.stringify(input),
  });
/** TA 主动来留字条：翻到某页时问一句「他今天留过吗」 */
export const claimTaDiaryNote = (input: { bookId: string; date: string }) =>
  request<{ slip: DiarySlip | null }>('/api/diary/ta-note/visit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const unlockDiaryPage = (bookId: string, date: string) =>
  request<{ ok: true }>(
    `/api/diary/page-locks?book=${encodeURIComponent(bookId)}&date=${encodeURIComponent(date)}`,
    { method: 'DELETE' },
  );

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
/** 给某一封信换信封颜色（只改 letterTheme，正文不动） */
export const patchNoteTheme = (id: string, letterTheme: string) =>
  request<{ ok: true }>(`/api/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ letterTheme }),
  });
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

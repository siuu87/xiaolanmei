import { request } from './conversations';

// ---- 一起读 / 书房 类型与 API ----

export type Reader = 'me' | 'partner';
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'violet' | 'amber';

export interface ReadingBook {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  totalChapters: number;
  content: string;
  desc?: string;
  toc: string[];
  color?: string;
  band?: string;
  height?: number;
  /** 来源渠道（2026-10-19）：local | weread | fanqie */
  source?: string;
  sourceId?: string;
  sourceMeta?: Record<string, unknown> | null;
  lastSyncedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingProgress {
  reader: Reader;
  currentChapter: number;
  currentPosition: number;
  percent: number;
  /** local / pending / synced */
  syncStatus?: string;
  lastSyncedAt?: number;
  updatedAt: number;
}

export interface AnnotationNote {
  id: string;
  annotationId: string;
  author: Reader;
  content: string;
  createdAt: number;
}

export interface ReadingAnnotation {
  id: string;
  bookId: string;
  chapter: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  color: AnnotationColor;
  createdAt: number;
  notes: AnnotationNote[];
}

export interface NewBookInput {
  title: string;
  author?: string;
  coverUrl?: string;
  content?: string;
  desc?: string;
  toc?: string[];
  color?: string;
  band?: string;
  height?: number;
}

export const listReadingBooks = () => request<ReadingBook[]>('/api/reading/books');
export const getReadingBook = (id: string) => request<ReadingBook>(`/api/reading/books/${id}`);
export const createReadingBook = (input: NewBookInput) =>
  request<{ id: string; createdAt: number }>('/api/reading/books', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateReadingBook = (id: string, patch: Partial<NewBookInput>) =>
  request<{ ok: true }>(`/api/reading/books/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
export const deleteReadingBook = (id: string) =>
  request<{ ok: true }>(`/api/reading/books/${id}`, { method: 'DELETE' });

export const getProgress = (bookId: string) =>
  request<ReadingProgress[]>(`/api/reading/progress?bookId=${encodeURIComponent(bookId)}`);
export const saveProgress = (input: {
  bookId: string;
  reader: Reader;
  currentChapter: number;
  currentPosition: number;
  percent: number;
}) =>
  request<{ ok: true; reader: Reader; percent: number }>('/api/reading/progress', {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const getAnnotations = (bookId: string, chapter?: number) => {
  const qs = new URLSearchParams({ bookId });
  if (chapter != null) qs.set('chapter', String(chapter));
  return request<ReadingAnnotation[]>(`/api/reading/annotations?${qs.toString()}`);
};
export const createAnnotation = (input: {
  bookId: string;
  chapter: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  color: AnnotationColor;
}) =>
  request<ReadingAnnotation>('/api/reading/annotations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const deleteAnnotation = (id: string) =>
  request<{ ok: true }>(`/api/reading/annotations/${id}`, { method: 'DELETE' });

export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const getReadingTime = (reader: Reader, from: string, to: string) =>
  request<{ day: string; minutes: number }[]>(
    `/api/reading/time?reader=${reader}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
export const saveReadingTime = (input: { bookId: string; reader: Reader; day: string; minutes: number }) =>
  request<{ ok: true }>('/api/reading/time', {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const getAnnotationNotes = (id: string) =>
  request<AnnotationNote[]>(`/api/reading/annotations/${id}/notes`);
export const createAnnotationNote = (id: string, input: { author: Reader; content: string }) =>
  request<AnnotationNote>(`/api/reading/annotations/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

// ── 多源书架（2026-10-19）────────────────────────────────

export interface ReadingSourceMeta {
  id: string;
  label: string;
  ready: boolean;
  note: string;
}

export const listReadingSources = () =>
  request<{ sources: ReadingSourceMeta[] }>('/api/reading/sources');

/** 番茄：导入书名/作者/封面/目录（正文受字体混淆限制，不抓） */
export const importFanqieBook = (url: string) =>
  request<{
    id: string;
    updated?: boolean;
    title: string;
    author?: string;
    chapters: number;
    hasText: boolean;
    warning?: string;
  }>('/api/reading/import/fanqie', { method: 'POST', body: JSON.stringify({ url }) });

/** 通用网页：抓公开正文入库 */
export const importLinkBook = (url: string, title?: string) =>
  request<{ id: string; title: string; chars: number }>('/api/reading/import/link', {
    method: 'POST',
    body: JSON.stringify({ url, title }),
  });

/** 进度同步：本地书 local；外部来源记为 pending（不谎报已同步） */
export const syncReadingProgress = (bookId: string) =>
  request<{
    status: string;
    source: string;
    note: string;
    progress: ReadingProgress[];
  }>('/api/reading/progress/sync', { method: 'POST', body: JSON.stringify({ bookId }) });

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
  createdAt: number;
  updatedAt: number;
}

export interface ReadingProgress {
  reader: Reader;
  currentChapter: number;
  currentPosition: number;
  percent: number;
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

export const getAnnotationNotes = (id: string) =>
  request<AnnotationNote[]>(`/api/reading/annotations/${id}/notes`);
export const createAnnotationNote = (id: string, input: { author: Reader; content: string }) =>
  request<AnnotationNote>(`/api/reading/annotations/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

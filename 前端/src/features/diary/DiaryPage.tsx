import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { diaryDayKey, dayKeyToDate } from './diaryData';
import { useDiaryStore } from './diaryStore';
import { BookWall } from './BookWall';
import { BookDeck } from './BookDeck';
import { PageReader } from './PageReader';

/**
 * 日记本（2026-11-11 Paper 式改版）：
 * 封面墙（多本：我的 / TA 的 / 情侣日记）→ 点封面翻开本子（翻到最后一页即今天，直接记录）
 * → 左右翻页看历史 → 点某一页进入全屏阅读（可编辑 / 上下滑动）。
 *
 * 日历深链保留：?date=YYYY-M-D 打开含当天日记的本子并定位那页；?date=...&new=1 翻开今天直接记录。
 */
export function DiaryPage() {
  const entries = useDiaryStore((s) => s.entries);
  const books = useDiaryStore((s) => s.books);
  const load = useDiaryStore((s) => s.load);

  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const newParam = searchParams.get('new');

  const [openBook, setOpenBook] = useState<DiaryBook | null>(null);
  const [readerEntry, setReaderEntry] = useState<DiaryEntry | null>(null);
  // 日历深链指定的日期页（打开本子后定位用）
  const [focusDate, setFocusDate] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 日历「查看日记」：找到当天日记 → 打开它所属的本子并定位
  useEffect(() => {
    if (!dateParam || newParam) return;
    if (books.length === 0) return; // 本子还没加载好
    const target = entries.find((d) => diaryDayKey(d) === dateParam);
    if (!target) return;
    const bookId = target.bookId ?? 'book-me';
    const book = books.find((b) => b.id === bookId) ?? books[0];
    setOpenBook(book);
    setFocusDate(target.date);
  }, [dateParam, newParam, entries, books]);

  // 日历「去记日记」：打开「我的日记」翻到今天
  useEffect(() => {
    if (!newParam) return;
    if (books.length === 0) return;
    const book = books.find((b) => b.kind === 'me') ?? books[0];
    setOpenBook(book);
  }, [newParam, books]);

  const readerBook = readerEntry
    ? books.find((b) => b.id === (readerEntry.bookId ?? 'book-me')) ?? books[0]
    : null;

  return (
    <PageShell title="日记本" eyebrow="DIARY" testId="diary-page">
      <BookWall
        books={books}
        entries={entries}
        onOpen={(b) => setOpenBook(b)}
        onAdd={(patch) => useDiaryStore.getState().addBook(patch)}
        onPatch={(id, patch) => useDiaryStore.getState().patchBook(id, patch)}
        onRemove={(id) => useDiaryStore.getState().removeBook(id)}
      />

      {openBook && (
        <BookDeck
          book={openBook}
          entries={entries}
          focusDate={focusDate}
          onClose={() => {
            setOpenBook(null);
            setFocusDate(null);
          }}
          onOpenReader={(e) => {
            setReaderEntry(e);
            setOpenBook(null);
          }}
        />
      )}

      {readerEntry && readerBook && (
        <PageReader
          entry={readerEntry}
          book={readerBook}
          onClose={() => setReaderEntry(null)}
        />
      )}
    </PageShell>
  );
}

/** 今天的 YYYY-MM-DD（暴露给日历深链复用） */
export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** 供日历跳转把 dayKey 转回标准日期 */
export { dayKeyToDate };

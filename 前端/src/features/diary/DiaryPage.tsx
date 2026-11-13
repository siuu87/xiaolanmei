import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { diaryDayKey, dayKeyToDate } from './diaryData';
import { useDiaryStore } from './diaryStore';
import { BookShelf } from './BookShelf';
import { BookDeck } from './BookDeck';
import { PageReader } from './PageReader';

/**
 * 手写日记本（2026-11-13 重构）：
 *   横向书架（左右滑动换本）→ 点封面进本子详情 → 锁屏（若上锁）→ 翻页阅读 → 右上角进编写页
 *
 * - 书架一屏一本、scroll-snap；上锁的本子封面带锁，进详情先进锁屏
 * - 详情默认「翻页阅读」，只有右上角能进编写；保存/返回都回翻页页
 * - 日历深链：?date=YYYY-M-D 打开含那天日记的本子并定位（阅读态）；&new=1 直接进编写
 */
export function DiaryPage() {
  const entries = useDiaryStore((s) => s.entries);
  const books = useDiaryStore((s) => s.books);
  const slips = useDiaryStore((s) => s.slips);
  const load = useDiaryStore((s) => s.load);

  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const newParam = searchParams.get('new');

  // 存 id 而不是对象：本子上锁/改名后，从 books 里取最新的那一份
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [readerEntry, setReaderEntry] = useState<DiaryEntry | null>(null);
  // 日历深链指定的日期页（打开本子后定位用）
  const [focusDate, setFocusDate] = useState<string | null>(null);
  // 打开本子时是否直接进编写页（右上角「去记录」/ 日历 &new=1）
  const [startEditing, setStartEditing] = useState(false);
  // 封面墙右上角「去记录」：books 可能还没加载完，等到位再打开
  const [wantWrite, setWantWrite] = useState(false);

  const openBook = openBookId ? books.find((b) => b.id === openBookId) ?? null : null;
  const readerBook = readerEntry
    ? books.find((b) => b.id === (readerEntry.bookId ?? 'book-me')) ?? books[0]
    : null;

  useEffect(() => {
    void load();
  }, [load]);

  const openBookById = (book: DiaryBook, write = false) => {
    setReaderEntry(null);
    setFocusDate(null);
    setStartEditing(write);
    setOpenBookId(book.id);
  };

  // 书架右上角「去记录」：打开「我的日记」并直接进编写页
  useEffect(() => {
    if (!wantWrite || books.length === 0) return;
    const book = books.find((b) => b.kind === 'me') ?? books[0];
    openBookById(book, true);
    setWantWrite(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantWrite, books]);

  // 日历「查看日记」：找到当天日记 → 打开它所属的本子并定位
  useEffect(() => {
    if (!dateParam || newParam) return;
    if (books.length === 0) return;
    const target = entries.find((d) => diaryDayKey(d) === dateParam);
    if (!target) return;
    const bookId = target.bookId ?? 'book-me';
    const book = books.find((b) => b.id === bookId) ?? books[0];
    setOpenBookId(book.id);
    setStartEditing(false);
    setFocusDate(target.date);
  }, [dateParam, newParam, entries, books]);

  // 日历「去记日记」：打开「我的日记」翻到今天并直接记录
  useEffect(() => {
    if (!newParam) return;
    if (books.length === 0) return;
    const book = books.find((b) => b.kind === 'me') ?? books[0];
    setOpenBookId(book.id);
    setStartEditing(true);
  }, [newParam, books]);

  return (
    <PageShell
      title="日记本"
      eyebrow="DIARY"
      testId="diary-page"
      right={
        <button
          type="button"
          onClick={() => setWantWrite(true)}
          aria-label="去记录"
          data-testid="diary-page-go-write"
          className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-page-line px-3 text-xs font-medium text-foreground transition hover:bg-surface-2"
        >
          <PenLine className="h-3.5 w-3.5" />
          去记录
        </button>
      }
    >
      <BookShelf
        books={books}
        entries={entries}
        onOpen={(b) => openBookById(b)}
        onAdd={(draft) => useDiaryStore.getState().addBook(draft)}
        onPatch={(id, patch) => useDiaryStore.getState().patchBook(id, patch)}
        onRemove={(id) => {
          useDiaryStore.getState().removeBook(id);
          if (openBookId === id) setOpenBookId(null);
        }}
      />

      {openBook && (
        <BookDeck
          book={openBook}
          entries={entries}
          focusDate={focusDate}
          startEditing={startEditing}
          onClose={() => {
            setOpenBookId(null);
            setFocusDate(null);
            setStartEditing(false);
          }}
          onOpenReader={(e) => setReaderEntry(e)}
        />
      )}

      {readerEntry && readerBook && (
        <PageReader
          entry={readerEntry}
          book={readerBook}
          slips={slips.filter(
            (s) => (s.bookId || 'book-me') === readerBook.id && s.date === readerEntry.date,
          )}
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

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { diaryDayKey, dayKeyToDate } from './diaryData';
import { useDiaryStore } from './diaryStore';
import { BookWall } from './BookWall';
import { BookDeck } from './BookDeck';
import { PageReader } from './PageReader';

/**
 * 日记本（Paper 式改版）：
 * 封面墙（多本：我的 / TA 的 / 情侣日记）→ 点封面只翻开本子，停在今天那页的阅读态
 * → 左右翻页看历史 → 点某一页进入全屏阅读（可编辑 / 上下滑动）。
 * 右上角「去记录」= 打开「我的日记」并直接进编写页；翻开本子后右上角也有同款入口。
 *
 * 日历深链保留：?date=YYYY-M-D 打开含当天日记的本子并定位那页（阅读态）；&new=1 翻开今天直接记录。
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
  // 打开本子时是否直接进编写态（右上角「去记录」/ 日历 &new=1）
  const [startEditing, setStartEditing] = useState(false);
  // 封面墙右上角「去记录」：books 可能还没加载完，等到位再打开
  const [wantWrite, setWantWrite] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // 封面墙右上角「去记录」：打开「我的日记」并直接进编写页
  useEffect(() => {
    if (!wantWrite || books.length === 0) return;
    const book = books.find((b) => b.kind === 'me') ?? books[0];
    setOpenBook(book);
    setFocusDate(null);
    setStartEditing(true);
    setWantWrite(false);
  }, [wantWrite, books]);

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

  // 日历「去记日记」：打开「我的日记」翻到今天并直接记录
  useEffect(() => {
    if (!newParam) return;
    if (books.length === 0) return;
    const book = books.find((b) => b.kind === 'me') ?? books[0];
    setOpenBook(book);
    setStartEditing(true);
  }, [newParam, books]);

  const readerBook = readerEntry
    ? books.find((b) => b.id === (readerEntry.bookId ?? 'book-me')) ?? books[0]
    : null;

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
          startEditing={startEditing}
          onClose={() => {
            setOpenBook(null);
            setFocusDate(null);
            setStartEditing(false);
          }}
          onOpenReader={(e) => {
            setReaderEntry(e);
            setOpenBook(null);
            setStartEditing(false);
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

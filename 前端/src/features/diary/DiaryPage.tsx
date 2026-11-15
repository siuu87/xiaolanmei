import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DeckPage, DiaryBook, DiaryEntry } from './diaryData';
import { dayKeyToDate, diaryDayKey } from './diaryData';
import { useDiaryStore } from './diaryStore';
import { BookDeck } from './BookDeck';
import { BookLock } from './BookLock';
import { BookSheet, type BookDraft } from './BookSheet';
import { BookSwitcher } from './BookSwitcher';
import { DlogBook } from './DlogBook';
import { DlogCompose } from './DlogCompose';
import { MonthJump } from './MonthJump';
import { PageReader } from './PageReader';
import { SlipEditor } from './SlipEditor';

/**
 * 日记（2026-11-15 改成单页翻页本）：
 *
 *   一屏就是一页纸（一天），手指一划 / 点底部箭头翻页，纸绕左边书脊掀走。
 *   顶栏「我的日记 ⌄」换本、日历翻到某一天、齿轮进本子设置。
 *
 * - 一天可以记很多条「时刻」（时间 / 心情 / 标签 / 照片），写新的不覆盖旧的
 * - 「TA 的日记」同样一本，但只能夹纸条，不能代写
 * - 情侣本仍沿用「一天一页、上下两半」的老书（BookDeck），下一步再并进来
 */
export function DiaryPage() {
  const entries = useDiaryStore((s) => s.entries);
  const books = useDiaryStore((s) => s.books);
  const slips = useDiaryStore((s) => s.slips);
  const stickers = useDiaryStore((s) => s.stickers);
  const load = useDiaryStore((s) => s.load);
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const newParam = searchParams.get('new');

  const today = todayISO();

  const [bookId, setBookId] = useState('');
  /** 翻到哪一天（null = 今天） */
  const [focusDate, setFocusDate] = useState<string | null>(null);
  /** 记录 / 改某一条 */
  const [compose, setCompose] = useState<{ date: string; entry?: DiaryEntry | null } | null>(null);
  const [switcher, setSwitcher] = useState(false);
  const [sheet, setSheet] = useState<{ book: DiaryBook | null } | null>(null);
  const [slipEditor, setSlipEditor] = useState<{ date: string } | null>(null);
  /** 月历跳页 */
  const [jump, setJump] = useState(false);
  /** 本次会话里解锁过 / 撬开过的本子 */
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [readerPage, setReaderPage] = useState<DeckPage | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 默认打开「我的日记」
  useEffect(() => {
    if (bookId || books.length === 0) return;
    setBookId((books.find((b) => b.kind === 'me') ?? books[0]).id);
  }, [bookId, books]);

  const book = books.find((b) => b.id === bookId) ?? null;

  /** 这本的全部日记（老数据 bookId 为空 = 我的日记） */
  const bookEntries = useMemo(
    () => entries.filter((e) => (e.bookId || 'book-me') === (book?.id ?? 'book-me')),
    [entries, book?.id],
  );

  /** 这本夹着的纸条 */
  const bookSlips = useMemo(
    () => slips.filter((s) => (s.bookId || 'book-me') === (book?.id ?? 'book-me')),
    [slips, book?.id],
  );

  /** 这本贴过的贴纸 */
  const bookStickers = useMemo(
    () => stickers.filter((s) => (s.bookId || 'book-me') === (book?.id ?? 'book-me')),
    [stickers, book?.id],
  );

  // 日历深链：?date=YYYY-M-D
  useEffect(() => {
    if (!dateParam || newParam || books.length === 0) return;
    const target = entries.find((d) => diaryDayKey(d) === dateParam);
    if (target) {
      setBookId(target.bookId || 'book-me');
      setFocusDate(target.date);
      return;
    }
    setFocusDate(dayKeyToDate(dateParam));
  }, [dateParam, newParam, entries, books]);

  // 日历深链：&new=1 直接记今天
  useEffect(() => {
    if (!newParam || books.length === 0) return;
    const mine = books.find((b) => b.kind === 'me') ?? books[0];
    setBookId(mine.id);
    setFocusDate(today);
    setCompose({ date: today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam, books.length]);

  // 本子还没加载到：铺一层不透明底，别让底下的聊天透出来
  if (!book) {
    return (
      <div className="min-h-screen bg-page-bg" data-testid="diary-page">
        <div className="flex h-40 items-center justify-center text-[13px] text-muted-foreground">
          正在打开日记…
        </div>
      </div>
    );
  }

  // 上锁的本子：先过锁面（长按可撬锁，撬开这次仍算上锁）
  if (book.locked && !unlocked.includes(book.id)) {
    return (
      <BookLock
        book={book}
        onUnlock={() => setUnlocked((prev) => [...prev, book.id])}
        onSneak={() => setUnlocked((prev) => [...prev, book.id])}
        onClose={() => navigate('/chat')}
      />
    );
  }

  const canWrite = book.kind !== 'partner';

  // 情侣本：仍然用原来的「一天一页、上下两半」，下一步再并进书里
  if (book.kind === 'couple') {
    return (
      <div className="min-h-full bg-page-bg" data-testid="diary-page">
        <BookDeck
          book={book}
          entries={entries}
          focusDate={focusDate}
          startEditing={!!compose}
          onClose={() => setFocusDate(null)}
          onOpenReader={(p) => setReaderPage(p)}
        />
        {readerPage && (
          <PageReader
            page={readerPage}
            book={book}
            slips={slips.filter((s) => (s.bookId || 'book-me') === book.id && s.date === readerPage.date)}
            onClose={() => setReaderPage(null)}
          />
        )}
      </div>
    );
  }

  const current = focusDate ?? today;

  return (
    <div className="h-full bg-page-bg" data-testid="diary-page">
      <DlogBook
        key={book.id}
        book={book}
        entries={bookEntries}
        slips={bookSlips}
        stickers={bookStickers}
        today={today}
        canWrite={canWrite}
        focusDate={focusDate}
        onDateChange={setFocusDate}
        onCompose={(d) => setCompose({ date: d })}
        onEdit={(e) => setCompose({ date: e.date, entry: e })}
        onDelete={(e) => useDiaryStore.getState().removeEntry(e.id)}
        onSlip={(d) => setSlipEditor({ date: d })}
        onAddSticker={(s) => useDiaryStore.getState().addSticker(s)}
        onMoveSticker={(id, pos) => useDiaryStore.getState().patchSticker(id, pos)}
        onChangeSticker={(id, patch) => useDiaryStore.getState().patchSticker(id, patch)}
        onRemoveSticker={(id) => useDiaryStore.getState().removeSticker(id)}
        onJump={() => setJump(true)}
        onSwitchBook={() => setSwitcher(true)}
        onSettings={() => setSheet({ book })}
        onBack={() => navigate('/chat')}
      />

      {jump && (
        <MonthJump
          entries={bookEntries}
          today={today}
          current={current}
          onPick={(d) => {
            setFocusDate(d);
            setJump(false);
          }}
          onClose={() => setJump(false)}
        />
      )}

      {compose && canWrite && (
        <DlogCompose
          book={book}
          date={compose.date}
          entry={compose.entry ?? null}
          onClose={() => setCompose(null)}
        />
      )}

      {switcher && (
        <BookSwitcher
          books={books}
          currentId={book.id}
          entries={entries}
          onPick={(b) => {
            setBookId(b.id);
            setFocusDate(null);
            setSwitcher(false);
          }}
          onAdd={() => {
            setSwitcher(false);
            setSheet({ book: null });
          }}
          onClose={() => setSwitcher(false)}
        />
      )}

      {sheet && (
        <BookSheet
          book={sheet.book}
          onClose={() => setSheet(null)}
          onSave={(draft: BookDraft) => {
            const store = useDiaryStore.getState();
            if (sheet.book) {
              store.patchBook(sheet.book.id, draft);
            } else {
              store.addBook({ ...draft, locked: draft.locked, lockCode: draft.lockCode });
            }
            setSheet(null);
          }}
          onDelete={
            sheet.book
              ? () => {
                  useDiaryStore.getState().removeBook(sheet.book!.id);
                  setSheet(null);
                }
              : undefined
          }
        />
      )}

      {slipEditor && (
        <SlipEditor
          date={slipEditor.date}
          onSave={(content, color) => {
            useDiaryStore.getState().addSlip({
              bookId: book.id,
              date: slipEditor.date,
              content,
              color,
            });
            setSlipEditor(null);
          }}
          onClose={() => setSlipEditor(null)}
        />
      )}
    </div>
  );
}

/** 今天的 YYYY-MM-DD（暴露给日历深链复用） */
export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

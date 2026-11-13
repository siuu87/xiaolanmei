import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DeckPage, DiaryBook, DiaryEntry } from './diaryData';
import { dayKeyToDate, diaryDayKey, sortByTime } from './diaryData';
import { useDiaryStore } from './diaryStore';
import { BookDeck } from './BookDeck';
import { BookLock } from './BookLock';
import { BookSheet, type BookDraft } from './BookSheet';
import { BookSwitcher } from './BookSwitcher';
import { DlogCompose } from './DlogCompose';
import { DlogDay } from './DlogDay';
import { DlogHome } from './DlogHome';
import { PageReader } from './PageReader';
import { SlipEditor } from './SlipEditor';

/**
 * 日记（2026-11-14 按 D·LOG 重做个人那两本）：
 *
 *   月历首页（格子里是照片）→ 点某天 → 当天页（一条条「时刻」）→ ＋ 记这一刻
 *   顶部「我的日记 ⌄」换本；右上齿轮进本子设置（改名 / 换封皮 / 上锁）
 *
 * - 一天可以记很多条，每条带时刻 / 心情 / 标签，写新的不覆盖旧的
 * - 「TA 的日记」同样的照片流水账，但只能夹纸条，不能代写
 * - 情侣本沿用原来「一天一页、上下两半」的版本，下一步再按 DuoLog 改
 */
export function DiaryPage() {
  const entries = useDiaryStore((s) => s.entries);
  const books = useDiaryStore((s) => s.books);
  const slips = useDiaryStore((s) => s.slips);
  const load = useDiaryStore((s) => s.load);
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const newParam = searchParams.get('new');

  const today = todayISO();

  const [bookId, setBookId] = useState('');
  /** 打开着哪一天（null = 月历首页） */
  const [dayDate, setDayDate] = useState<string | null>(null);
  /** 记录 / 改某一条 */
  const [compose, setCompose] = useState<{ date: string; entry?: DiaryEntry | null } | null>(null);
  const [switcher, setSwitcher] = useState(false);
  const [sheet, setSheet] = useState<{ book: DiaryBook | null } | null>(null);
  const [slipEditor, setSlipEditor] = useState<{ date: string } | null>(null);
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

  /** 某一天的「时刻」 */
  const entriesOf = (date: string) => sortByTime(bookEntries.filter((e) => e.date === date));

  // 日历深链：?date=YYYY-M-D
  useEffect(() => {
    if (!dateParam || newParam || books.length === 0) return;
    const target = entries.find((d) => diaryDayKey(d) === dateParam);
    if (target) {
      setBookId(target.bookId || 'book-me');
      setDayDate(target.date);
      return;
    }
    setDayDate(dayKeyToDate(dateParam));
  }, [dateParam, newParam, entries, books]);

  // 日历深链：&new=1 直接记今天
  useEffect(() => {
    if (!newParam || books.length === 0) return;
    const mine = books.find((b) => b.kind === 'me') ?? books[0];
    setBookId(mine.id);
    setDayDate(today);
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

  // 情侣本：仍然用原来的「一天一页」，等下一轮按 DuoLog 重做
  if (book.kind === 'couple') {
    return (
      <div className="min-h-full bg-page-bg" data-testid="diary-page">
        <BookDeck
          book={book}
          entries={entries}
          focusDate={dayDate}
          startEditing={!!compose}
          onClose={() => setDayDate(null)}
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

  return (
    <div className="min-h-full bg-page-bg" data-testid="diary-page">
      {dayDate ? (
        <DlogDay
          book={book}
          date={dayDate}
          entries={entriesOf(dayDate)}
          slips={slips.filter((s) => (s.bookId || 'book-me') === book.id && s.date === dayDate)}
          canWrite={canWrite}
          today={today}
          onBack={() => setDayDate(null)}
          onChangeDate={(d) => setDayDate(d)}
          onCompose={(d) => setCompose({ date: d })}
          onEdit={(e) => setCompose({ date: e.date, entry: e })}
          onDelete={(e) => useDiaryStore.getState().removeEntry(e.id)}
          onSlip={() => setSlipEditor({ date: dayDate })}
        />
      ) : (
        <DlogHome
          book={book}
          entries={bookEntries}
          today={today}
          onOpenDay={(d) => setDayDate(d)}
          onCompose={(d) => setCompose({ date: d })}
          onSwitchBook={() => setSwitcher(true)}
          onSettings={() => setSheet({ book })}
          onBack={() => navigate('/chat')}
          canWrite={canWrite}
          onSlip={(d) => setSlipEditor({ date: d })}
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
            setDayDate(null);
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

/** 供日历跳转把 dayKey 转回标准日期 */
export { dayKeyToDate };

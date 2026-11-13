import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, PenLine, Plus, StickyNote, Trash2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry, DiarySlip } from './diaryData';
import { prettyTime, shiftDate, weekdayOf } from './diaryData';

interface Props {
  book: DiaryBook;
  date: string;
  /** 这一天全部「时刻」，已按时间排好 */
  entries: DiaryEntry[];
  slips: DiarySlip[];
  canWrite: boolean;
  today: string;
  onBack: () => void;
  onChangeDate: (date: string) => void;
  onCompose: (date: string) => void;
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
  onSlip: () => void;
}

/**
 * 当天页（D·LOG 的「一天」详情）：
 * 一条一条的「时刻」往下排 —— 时间 + 心情 + 文字 + 图，最后是标签；
 * 底部固定「前天 ｜ ＋ ｜ 下一天」，和 app 一样直接翻日子。
 */
export function DlogDay({
  book,
  date,
  entries,
  slips,
  canWrite,
  today,
  onBack,
  onChangeDate,
  onCompose,
  onEdit,
  onDelete,
  onSlip,
}: Props) {
  const prev = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const photos = useMemo(() => entries.flatMap((e) => e.images ?? []), [entries]);
  const isFuture = date > today;

  return (
    <div className="min-h-full bg-page-bg pb-28" data-testid="diary-dlog-day">
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-page-bg/95 px-3 py-2.5 backdrop-blur-[2px]">
        <button type="button" onClick={onBack} aria-label="返回日历" className="icon-btn h-8 w-8">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="text-[11px] text-muted-foreground">{book.name}</span>
          <span className="text-[14px] font-semibold tabular-nums text-foreground">{date.replace(/-/g, ".")}</span>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => onCompose(date)}
            aria-label="记这一刻"
            data-testid="diary-day-write"
            className="icon-btn h-8 w-8"
          >
            <PenLine className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSlip}
            aria-label="夹张纸条"
            data-testid="diary-day-slip"
            className="icon-btn h-8 w-8"
          >
            <StickyNote className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="px-4">
        {/* 日期 + 这一天的小结（不再用大图打头，免得和第一条重复） */}
        <div className="mb-4 flex items-end justify-between border-b border-page-line pb-3">
          <div>
            <div className="text-[11px] leading-none text-muted-foreground">
              星期{['日', '一', '二', '三', '四', '五', '六'][weekdayOf(date)]}
            </div>
            <div className="mt-1.5 text-[32px] font-bold leading-none tabular-nums text-foreground">
              {Number(date.slice(-2))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-0.5 text-[14px]">
              {Array.from(new Set(entries.map((e) => e.mood).filter(Boolean))).map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {entries.length} 个时刻{photos.length > 0 ? ` · ${photos.length} 张照片` : ''}
            </span>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-[34px]">📷</span>
            <p className="text-[14px] font-medium text-foreground">这天还没有记录</p>
            <p className="max-w-[220px] text-[12px] leading-5 text-muted-foreground">
              一张照片、一句话就够，时间会自动记上
            </p>
            {canWrite ? (
              <button
                type="button"
                onClick={() => onCompose(date)}
                data-testid="diary-day-empty-add"
                className="mt-1 flex items-center gap-1 rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-page-bg"
              >
                <Plus className="h-4 w-4" />
                记这一刻
              </button>
            ) : (
              <button
                type="button"
                onClick={onSlip}
                className="mt-1 flex items-center gap-1 rounded-full border border-page-line px-4 py-2 text-[13px] font-medium"
              >
                <StickyNote className="h-4 w-4" />
                夹张纸条给他
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-6">
            {entries.map((e, i) => (
              <article key={e.id} data-testid="diary-moment">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium tabular-nums text-foreground/80">
                    {prettyTime(e.time) || `第 ${i + 1} 条`}
                  </span>
                  {e.mood && <span className="text-[15px] leading-none">{e.mood}</span>}
                  <span className="flex-1" />
                  {canWrite && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(e)}
                        aria-label="编辑这一条"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground active:bg-black/5"
                      >
                        <PenLine className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(e)}
                        aria-label="删除这一条"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground active:bg-black/5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {e.content && (
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                    {e.content}
                  </p>
                )}

                {(e.images ?? []).length > 0 && (
                  <div
                    className={`mt-2 gap-1.5 ${
                      (e.images?.length ?? 0) === 1 ? 'block' : 'grid grid-cols-2'
                    }`}
                  >
                    {(e.images ?? []).map((src, idx) => (
                      <img
                        key={src}
                        src={src}
                        alt=""
                        loading="lazy"
                        className={
                          (e.images?.length ?? 0) === 1
                            ? 'max-h-[260px] w-full rounded-xl object-cover'
                            : idx === 0 && (e.images?.length ?? 0) === 3
                              ? 'col-span-2 max-h-[260px] w-full rounded-xl object-cover'
                              : 'aspect-square w-full rounded-xl object-cover'
                        }
                      />
                    ))}
                  </div>
                )}

                {(e.tags ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(e.tags ?? []).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* 夹在这天的纸条 */}
        {slips.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] tracking-[0.14em] text-muted-foreground">纸条</div>
            <div className="flex flex-col gap-2">
              {slips.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg px-3 py-2 text-[13px] leading-6 text-[#3b3830] shadow-sm"
                  style={{ background: s.color }}
                >
                  {s.content}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部翻日条 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-page-line bg-page-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button
            type="button"
            onClick={() => onChangeDate(prev)}
            data-testid="diary-day-prev"
            className="flex items-center gap-1 px-2 py-2 text-[13px] text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            前天
          </button>
          <button
            type="button"
            onClick={canWrite ? () => onCompose(date) : onSlip}
            aria-label={canWrite ? '加一条' : '夹张纸条'}
            data-testid={canWrite ? 'diary-day-add' : 'diary-day-add-slip'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-page-bg shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)] active:scale-95"
          >
            {canWrite ? <Plus className="h-5 w-5" /> : <StickyNote className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => onChangeDate(next)}
            disabled={isFuture}
            data-testid="diary-day-next"
            className="flex items-center gap-1 px-2 py-2 text-[13px] text-muted-foreground disabled:opacity-30"
          >
            下一天
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

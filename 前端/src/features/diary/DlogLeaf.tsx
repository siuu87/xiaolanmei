import { PenLine, Trash2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry, DiarySlip } from './diaryData';
import { HAND_FONT, weekdayOf } from './diaryData';
import type { PageBox } from './pageLayout';
import { PaperTexture } from './InkShapes';

interface Props {
  book: DiaryBook;
  /** 这一页是哪一天 YYYY-MM-DD */
  date: string;
  /** 这一天全部「时刻」，已按时间排好 */
  entries: DiaryEntry[];
  slips: DiarySlip[];
  /** 纸页尺寸（由书壳按视口算好，固定比例） */
  box: PageBox;
  /** 第几页 / 共几页（页脚印出来） */
  pageNo: number;
  total: number;
  canWrite: boolean;
  onEdit: (entry: DiaryEntry) => void;
  onDelete: (entry: DiaryEntry) => void;
  /** 空页点一下就能写 */
  onCompose: () => void;
}

/** 纸面底色（米白纸 / 深色下的暖黑），整本书统一 */
const PAPER = 'bg-[#fdfbf6] text-[#3d3a35] dark:bg-[#262220] dark:text-[#d8d2c7]';

/** 页眉高、页脚高、左右留白：固定值，纸页大小永不随内容变 */
const HEAD_H = 62;
const FOOT_H = 24;
const PAD_X = 30;

/** 横格线间距（也是正文行高） */
const RULE_GAP = 26;

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 日记本的一页（2026-11-15 单页翻页本）：
 *
 * 一页 = 一天。页眉是这天的大字日期 + 星期 + 心情 + 「几个时刻」，
 * 下面是一条条时刻（时间 / 文字 / 图 / 标签），页脚印本名和页码。
 *
 * 纸的质感（纸纹 / 横格 / 手画纸边）走 PaperTexture，纯装饰不碰排版；
 * 一天写太多时页内可滚（滚动条藏起来），底部留一道渐隐，不做硬切。
 */
export function DlogLeaf({
  book,
  date,
  entries,
  slips,
  box,
  pageNo,
  total,
  canWrite,
  onEdit,
  onDelete,
  onCompose,
}: Props) {
  const day = Number(date.slice(-2));
  const month = Number(date.slice(5, 7));
  const moods = Array.from(new Set(entries.map((e) => e.mood).filter(Boolean)));
  const photos = entries.reduce((n, e) => n + (e.images?.length ?? 0), 0);
  const contentH = box.h - HEAD_H - FOOT_H;

  return (
    <div
      className={`relative overflow-hidden rounded-[7px] ${PAPER}`}
      style={{ width: box.w, height: box.h }}
      data-testid="diary-leaf"
      data-date={date}
    >
      {/* 纸的质感：纸纹 + 淡横格 + 左侧红线 + 手画的纸边（压到 0.8，别抢正文） */}
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <PaperTexture
          w={box.w}
          h={box.h}
          r={7}
          seed={`leaf-${date}`}
          rules
          ruleTop={HEAD_H + 10}
          ruleGap={RULE_GAP}
          margin={14}
        />
      </div>

      <div className="relative z-10 flex h-full w-full flex-col">
        {/* 页眉：大字日期 + 星期 / 右上是这天的心情和条数 */}
        <div
          className="flex shrink-0 items-end justify-between"
          style={{ height: HEAD_H, paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: 12 }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-semibold leading-none tabular-nums text-ink">{day}</span>
            <span className="text-[10px] leading-none tracking-[0.08em] text-ink/45">
              {month} 月 · 星期{WEEK[weekdayOf(date)]}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[12px] leading-none">{moods.join('')}</span>
            <span className="text-[9px] leading-none tracking-[0.06em] text-ink/40">
              {entries.length > 0
                ? `${entries.length} 个时刻${photos > 0 ? ` · ${photos} 张` : ''}`
                : '空白页'}
            </span>
          </div>
        </div>

        {/* 正文：固定高的窗口，写太多就在页内滚 */}
        <div className="relative shrink-0" style={{ height: contentH }}>
          {entries.length === 0 ? (
            <button
              type="button"
              onClick={canWrite ? onCompose : undefined}
              data-testid="diary-leaf-empty"
              className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center"
            >
              <span className="text-[15px] tracking-[0.4em] text-ink/15">· · ·</span>
              <span className="text-[11px] leading-5 text-ink/35" style={{ fontFamily: HAND_FONT }}>
                {canWrite ? '这天还是空白的，点一下就能写' : '这天没有留下字迹'}
              </span>
            </button>
          ) : (
            <div
              className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: 2 }}
              data-testid="diary-leaf-body"
            >
              {entries.map((e, i) => {
                const imgs = e.images ?? [];
                return (
                  <article key={e.id} data-testid="diary-moment" className="mb-3 last:mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] tabular-nums leading-none text-ink/40">
                        {e.time || `第 ${i + 1} 条`}
                      </span>
                      {e.mood && <span className="text-[11px] leading-none">{e.mood}</span>}
                      <span className="flex-1" />
                      {canWrite && (
                        <span className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onEdit(e)}
                            aria-label="编辑这一条"
                            className="flex h-6 w-6 items-center justify-center rounded-full text-ink/30 active:bg-black/5"
                          >
                            <PenLine className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(e)}
                            aria-label="删除这一条"
                            className="flex h-6 w-6 items-center justify-center rounded-full text-ink/30 active:bg-black/5"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>

                    {e.content && (
                      <p
                        className="mt-0.5 whitespace-pre-wrap text-[14px] text-ink/90"
                        style={{ fontFamily: HAND_FONT, lineHeight: `${RULE_GAP}px` }}
                      >
                        {e.content}
                      </p>
                    )}

                    {imgs.length === 1 && (
                      <img
                        src={imgs[0]}
                        alt=""
                        loading="lazy"
                        className="mt-1 w-full rounded-[3px] object-cover"
                        style={{ height: Math.round(contentH * 0.3) }}
                      />
                    )}
                    {imgs.length > 1 && (
                      <div className="mt-1 grid grid-cols-3 gap-1">
                        {imgs.slice(0, 6).map((src) => (
                          <img
                            key={src}
                            src={src}
                            alt=""
                            loading="lazy"
                            className="aspect-square w-full rounded-[2px] object-cover"
                          />
                        ))}
                      </div>
                    )}

                    {(e.tags ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(e.tags ?? []).map((t) => (
                          <span key={t} className="text-[9px] leading-none text-ink/35">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}

              {/* 夹在这一页里的纸条（TA 的本只能留纸条） */}
              {slips.length > 0 && (
                <div className="mb-1 mt-2 flex flex-col gap-1.5">
                  {slips.slice(-2).map((s) => (
                    <div
                      key={s.id}
                      data-slip-id={s.id}
                      className="rotate-[-0.6deg] px-2 py-1.5 shadow-[0_5px_10px_-8px_rgba(0,0,0,0.5)]"
                      style={{ background: s.color }}
                    >
                      <p
                        className="max-h-[42px] overflow-hidden whitespace-pre-wrap text-[10px] leading-[16px] text-[#3b3830]"
                        style={{ fontFamily: HAND_FONT }}
                      >
                        {s.content}
                      </p>
                    </div>
                  ))}
                  {slips.length > 2 && (
                    <span className="text-[9px] text-ink/30">还有 {slips.length - 2} 张纸条</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 底部渐隐：滚到底不硬切一行字 */}
          {entries.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-[#fdfbf6] to-transparent dark:from-[#262220]"
            />
          )}
        </div>

        {/* 页脚：本名 + 页码 */}
        <div
          className="flex shrink-0 items-center justify-between text-[9px] tracking-[0.14em] text-ink/40"
          style={{ height: FOOT_H, paddingLeft: PAD_X, paddingRight: PAD_X }}
        >
          <span className="max-w-[55%] truncate">{book.name}</span>
          <span className="tabular-nums">
            {pageNo} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}

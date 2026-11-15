import { useState } from 'react';
import { PenLine, Trash2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry, DiarySlip, DiarySticker } from './diaryData';
import { HAND_FONT, prettyTime, weekdayOf } from './diaryData';
import type { PageBox } from './pageLayout';
import { PaperTexture } from './InkShapes';
import { PhotoViewer } from './PhotoViewer';
import { SlipLayer } from './SlipLayer';
import { StickerLayer } from './StickerLayer';
import { TapedPhoto } from './TapedPhoto';

interface Props {
  book: DiaryBook;
  /** 这一页是哪一天 YYYY-MM-DD */
  date: string;
  /** 这一天全部「时刻」，已按时间排好 */
  entries: DiaryEntry[];
  slips: DiarySlip[];
  /** 贴在这一页上的表情包贴纸 */
  stickers: DiarySticker[];
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
  onMoveSticker: (id: string, pos: { x: number; y: number }) => void;
  onChangeSticker: (id: string, patch: { scale?: number; rot?: number }) => void;
  onRemoveSticker: (id: string) => void;
  /** 纸条换个位置（贴在纸上，0~1 比例） */
  onMoveSlip: (id: string, pos: { x: number; y: number }) => void;
  /** 点开一张纸条：我的去改，他的去读 */
  onOpenSlip: (slip: DiarySlip) => void;
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
  stickers,
  box,
  pageNo,
  total,
  canWrite,
  onEdit,
  onDelete,
  onCompose,
  onMoveSticker,
  onChangeSticker,
  onRemoveSticker,
  onMoveSlip,
  onOpenSlip,
}: Props) {
  const day = Number(date.slice(-2));
  const month = Number(date.slice(5, 7));
  const photos = entries.reduce((n, e) => n + (e.images?.length ?? 0), 0);
  const contentH = box.h - HEAD_H - FOOT_H;
  /** 点开的大图（这一条的全部照片，能左右翻） */
  const [viewer, setViewer] = useState<{ images: string[]; start: number; caption: string } | null>(null);
  /** 拼贴可用宽度：稍微顶出左右留白一点，像贴到了格子外 */
  const collageW = box.w - PAD_X * 2 + 6;

  /**
   * 页眉右上那行小字：写了几个时刻 / 贴了几张 / 便签几张。
   * 便签 2026-11-16 起浮在纸面上（`SlipLayer`），空页也可能只贴着一张便签。
   */
  const marks =
    entries.length > 0
      ? `${entries.length} 个时刻${photos > 0 ? ` · ${photos} 张` : ''}`
      : stickers.length > 0 || slips.length > 0
        ? [
            stickers.length > 0 ? `贴了 ${stickers.length} 张` : '',
            slips.length > 0 ? `便签 ${slips.length} 张` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : '空白页';

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
            <span className="text-[9px] leading-none tracking-[0.06em] text-ink/40">{marks}</span>
          </div>
        </div>

        {/* 正文：固定高的窗口，写太多就在页内滚 */}
        <div className="relative shrink-0" style={{ height: contentH }}>
          {entries.length === 0 ? (
            /* 空页：**贴着便签时不再写「这天还空着」** —— 方形便签占地方，
               那句话会被两张纸切成半截，看着像排版坏了。便签本身就是这页的内容，
               点纸面空白处照样能写。 */
            <div className="flex h-full flex-col px-3">
              <button
                type="button"
                onClick={canWrite ? onCompose : undefined}
                data-testid="diary-leaf-empty"
                data-empty-hint={slips.length === 0 ? 'text' : 'hidden'}
                className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-2 text-center"
              >
                {slips.length === 0 ? (
                  <>
                    <span className="text-[15px] tracking-[0.4em] text-ink/15">· · ·</span>
                    <span className="text-[11px] leading-5 text-ink/35" style={{ fontFamily: HAND_FONT }}>
                      {canWrite
                        ? stickers.length > 0
                          ? '这天还空着，点一下写点什么'
                          : '这天还是空白的，点一下就能写'
                        : '这天没有留下字迹'}
                    </span>
                  </>
                ) : (
                  <span className="sr-only">{canWrite ? '点一下写点什么' : '这天没有留下字迹'}</span>
                )}
              </button>
            </div>
          ) : (
            <div
              className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: 2, paddingBottom: 18 }}
              data-testid="diary-leaf-body"
            >
              {entries.map((e, i) => {
                const imgs = e.images ?? [];
                return (
                  <article key={e.id} data-testid="diary-moment" className="mb-3 last:mb-1">
                    <div className="flex items-center gap-1.5">
                      {/* 时间写成一小块手写标签，像贴上去的 */}
                      <span className="inline-block -rotate-[1.2deg] bg-[#f2e8d2] px-1.5 py-[3px] text-[10px] leading-none tabular-nums text-[#6b6353] dark:bg-[#413a31] dark:text-[#c3b9a7]">
                        {(e.time && prettyTime(e.time)) || `第 ${i + 1} 条`}
                      </span>
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

                    {/* 照片：手账式拼贴（拍立得白框 + 胶带 + 随手歪的角度） */}
                    {imgs.length > 0 && (
                      <div
                        className="flex flex-wrap items-start gap-x-2"
                        style={{ marginTop: 6, marginLeft: -2, marginRight: -2, paddingTop: 6, paddingBottom: 4, rowGap: 12 }}
                        data-testid="diary-moment-photos"
                      >
                        {imgs.slice(0, 5).map((src, k) => {
                          const single = imgs.length === 1;
                          const w = single
                            ? Math.min(236, Math.round(collageW * 0.8))
                            : Math.round((collageW - 10) / 2);
                          const firstTag = (e.tags ?? [])[0];
                          const cap = single
                            ? (e.time && prettyTime(e.time)) || (firstTag ? `#${firstTag}` : undefined)
                            : undefined;
                          return (
                            <TapedPhoto
                              key={src}
                              src={src}
                              w={w}
                              ratio={single ? 0.72 : 0.8}
                              caption={cap}
                              tape={k % 3 === 0 ? 'top' : k % 3 === 1 ? 'right' : 'left'}
                              offsetX={imgs.length === 3 && k === 2 ? 26 : 0}
                              offsetY={k % 2 === 1 ? 9 : 0}
                              onClick={() =>
                                setViewer({
                                  images: imgs,
                                  start: k,
                                  caption: [
                                    e.time ? prettyTime(e.time) : '',
                                    ...(e.tags ?? []).map((t) => `#${t}`),
                                  ]
                                    .filter(Boolean)
                                    .join('   '),
                                })
                              }
                            />
                          );
                        })}
                        {imgs.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setViewer({ images: imgs, start: 5, caption: '' })}
                            className="mt-2 flex h-9 items-center justify-center rounded-[2px] bg-black/5 px-2.5 text-[11px] text-ink/45 dark:bg-white/10"
                          >
                            +{imgs.length - 5}
                          </button>
                        )}
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
            </div>
          )}

          {/* 底部渐隐：滚到底不硬切一行字 */}
          {entries.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#fdfbf6] to-transparent dark:from-[#262220]"
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

      {/* 纸条：贴在纸上的一层（能拖、点开能改），落在正文之上、贴纸之下 */}
      <SlipLayer slips={slips} w={box.w} h={box.h} onMove={onMoveSlip} onOpen={onOpenSlip} />

      {/* 贴纸：压在正文之上（真实贴纸本来就会盖住字），位置按纸页比例存 */}
      <StickerLayer
        stickers={stickers}
        w={box.w}
        h={box.h}
        canEdit={canWrite}
        onMove={onMoveSticker}
        onChange={onChangeSticker}
        onRemove={onRemoveSticker}
      />

      {/* 点开的大图：portal 到 body，不受这页裁切影响 */}
      {viewer && (
        <PhotoViewer
          images={viewer.images}
          start={viewer.start}
          caption={viewer.caption}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

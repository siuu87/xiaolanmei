import { useEffect, useRef } from 'react';
import type { DiaryEntry, DiarySlip } from './diaryData';
import { AUTHOR_LABEL, HAND_FONT } from './diaryData';
import type { PageBox } from './pageLayout';

interface Props {
  entry: DiaryEntry;
  /** 纸页尺寸（由 fitPage 算好，固定比例） */
  box: PageBox;
  /** 这篇日记被自动排成了几面，这是第几面（从 0 起） */
  slice?: number;
  /** 量出这一篇一共占几面，回报给翻页栈（页数会变，页大小不变） */
  onPages?: (count: number) => void;
  /** 夹在这一页上的小纸条（TA 的日记里我只能留纸条） */
  slips?: DiarySlip[];
  onSlipClick?: (slip: DiarySlip) => void;
  /**
   * paginate：本子里翻页看，长文自动分栏排到下一面（默认）
   * scroll：放大阅读 / 编写时整页可上下滚
   */
  flow?: 'paginate' | 'scroll';
}

/** 2026.04.08 这种点分日期（参考图里日期就在页眉右侧） */
function dottedDate(date: string): string {
  return date.replace(/-/g, '.');
}

/** 纸条预览最多几个字，多了省略（点开看全文） */
const SLIP_PREVIEW = 54;

/** 页眉高、页脚高、左右留白：固定值，页高不随内容变 */
const HEADER_H = 44;
const FOOT_H = 34;
const PAD_X = 22;

/**
 * 日记本单页（2026-11-13 按参考图重做）：
 * 一页 = 一张固定大小的纸，页眉左边谁写的、右边日期。
 * 长文不会把纸撑长 —— 用 CSS 分栏把文字排到「下一面」，页数变多、页大小不变。
 * 画在书壳里时由 BookDeck 负责，放大阅读器里 flow='scroll'。
 */
export function DiaryPageFace({
  entry,
  box,
  slice = 0,
  onPages,
  slips = [],
  onSlipClick,
  flow = 'paginate',
}: Props) {
  const images = entry.images ?? [];
  const [cover, ...rest] = images;
  const hasText = entry.content.trim().length > 0;
  const hasSlips = slips.length > 0;
  const shown = slips.slice(-2);

  const contentW = Math.max(80, box.w - PAD_X * 2);
  const contentH = Math.max(80, box.h - HEADER_H - FOOT_H);

  const flowRef = useRef<HTMLDivElement>(null);
  const pagesCb = useRef(onPages);
  pagesCb.current = onPages;
  const imagesKey = images.join('|');

  // 量「这一篇占几面」：分栏后 scrollWidth / 单栏宽
  useEffect(() => {
    if (flow !== 'paginate') return;
    const el = flowRef.current;
    if (!el) return;
    const measure = () => {
      const n = Math.max(1, Math.round(el.scrollWidth / contentW));
      pagesCb.current?.(n);
    };
    measure();
    const t = window.setTimeout(measure, 160); // 图片加载完再量一次
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [contentW, contentH, entry.content, imagesKey, flow]);

  const body = (
    <>
      {cover && (
        <div
          className="mb-3 overflow-hidden rounded-lg bg-ink/[0.06]"
          style={{ breakInside: 'avoid' }}
        >
          <img
            src={cover}
            alt=""
            className="w-full object-cover"
            style={{ height: Math.round(contentH * 0.42) }}
            loading="lazy"
            onLoad={() => pagesCb.current?.(Math.max(1, Math.round((flowRef.current?.scrollWidth ?? contentW) / contentW)))}
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty('display', 'none');
            }}
            data-testid="diary-page-cover"
          />
        </div>
      )}

      {rest.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-1.5" style={{ breakInside: 'avoid' }}>
          {rest.slice(0, 6).map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              className="aspect-square w-full rounded-md object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      <p
        className="whitespace-pre-wrap text-[16px] text-ink/90"
        style={{ fontFamily: HAND_FONT, lineHeight: '30px' }}
      >
        {hasText ? (
          entry.content
        ) : images.length > 0 || hasSlips ? null : (
          <span className="text-ink/25">（空白页）</span>
        )}
      </p>
    </>
  );

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      data-testid="diary-page-face"
      style={{ width: box.w, height: box.h }}
    >
      {/* 页眉：左边谁写的，右边日期（对齐参考图的右上日期） */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4"
        style={{ height: HEADER_H }}
      >
        <span className="text-[11px] tracking-[0.16em] text-ink/45" style={{ fontFamily: HAND_FONT }}>
          {AUTHOR_LABEL[entry.author]}
        </span>
        <span className="text-[11px] tabular-nums tracking-[0.12em] text-ink/45">
          {dottedDate(entry.date)}
        </span>
      </div>

      {/* 正文：固定高的窗口，长文按栏排到下一面 */}
      <div className="relative shrink-0 overflow-hidden" style={{ height: contentH, marginLeft: PAD_X, width: contentW }}>
        {flow === 'scroll' ? (
          <div className="relative h-full" style={{ width: contentW }}>
            <div
              className="h-full overflow-y-auto overscroll-contain pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ width: contentW }}
            >
              {body}
            </div>
            {/* 底部淡出：整页可滚时，末尾不要硬切一行字 */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#fdfbf6] to-transparent dark:from-[#221f1c]"
            />
          </div>
        ) : (
          <div
            ref={flowRef}
            style={{
              width: contentW,
              height: contentH,
              columnWidth: contentW,
              columnGap: 0,
              columnFill: 'auto',
              transform: `translateX(${-slice * contentW}px)`,
              transition: 'transform 320ms ease',
            }}
          >
            {body}
          </div>
        )}
      </div>

      {/* 页脚：留白，让纸看着像纸 */}
      <div className="shrink-0" style={{ height: FOOT_H }} />

      {/* 小纸条：压在页面右下角，摞两张；点开看全文 / 改它 */}
      {hasSlips && (
        <div
          className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-col items-end gap-2"
          data-testid="diary-page-slips"
        >
          {shown.map((s, i) => {
            const text = s.content.length > SLIP_PREVIEW ? `${s.content.slice(0, SLIP_PREVIEW)}…` : s.content;
            return (
              <button
                key={s.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSlipClick?.(s);
                }}
                data-testid="diary-slip"
                data-slip-id={s.id}
                className={`pointer-events-auto relative block w-[58%] max-w-[190px] text-left transition-transform active:scale-[0.98] ${
                  i % 2 === 0 ? 'rotate-[1.6deg]' : '-rotate-[1.2deg]'
                }`}
              >
                {/* 胶带 */}
                <span
                  aria-hidden
                  className="absolute -top-1.5 left-1/2 h-3 w-9 -translate-x-1/2 -rotate-3 bg-white/70 shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
                />
                <div
                  className="rounded-[2px] px-2.5 py-2 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.55)]"
                  style={{ background: s.color }}
                >
                  <p
                    className="max-h-[52px] overflow-hidden whitespace-pre-wrap text-[12px] leading-[18px] text-[#3a3730]"
                    style={{ fontFamily: HAND_FONT }}
                  >
                    {text}
                  </p>
                </div>
              </button>
            );
          })}
          {slips.length > shown.length && (
            <span className="text-[10px] text-ink/35">还有 {slips.length - shown.length} 张</span>
          )}
        </div>
      )}
    </div>
  );
}

/** 纸面底色（Paper 米白纸）——翻页卡与阅读器共用 */
export const PAPER_CLASS =
  'bg-[#fdfbf6] text-[#3d3a35] dark:bg-[#221f1c] dark:text-[#d8d2c7]';

import type { DiaryEntry, DiarySlip } from './diaryData';
import { AUTHOR_LABEL, HAND_FONT } from './diaryData';

interface Props {
  entry: DiaryEntry;
  /** 夹在这一页上的小纸条（TA 的日记里我只能留纸条） */
  slips?: DiarySlip[];
  onSlipClick?: (slip: DiarySlip) => void;
}

/** 2026.04.08 这种点分日期（参考图里日期就在页眉右侧） */
function dottedDate(date: string): string {
  return date.replace(/-/g, '.');
}

/** 纸条预览最多几个字，多了省略（点开看全文） */
const SLIP_PREVIEW = 54;

/**
 * 日记本单页（2026-11-13 改版，参考「整面卡片」日记 App）：
 * 一页 = 一整面纸，右上角日期，上面可以放图、下面写字，图文同页混排。
 * 右下角还可以压着别人留的小纸条。
 * 翻页卡与全屏阅读器共用，保证两边视觉一致。
 */
export function DiaryPageFace({ entry, slips = [], onSlipClick }: Props) {
  const images = entry.images ?? [];
  const [cover, ...rest] = images;
  const hasText = entry.content.trim().length > 0;
  const hasSlips = slips.length > 0;
  const shown = slips.slice(-2);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" data-testid="diary-page-face">
      {/* 页眉：左边谁写的，右边日期（对齐参考图的右上日期） */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-4">
        <span
          className="text-[11px] tracking-[0.16em] text-ink/45"
          style={{ fontFamily: HAND_FONT }}
        >
          {AUTHOR_LABEL[entry.author]}
        </span>
        <span className="text-[11px] tabular-nums tracking-[0.12em] text-ink/45">
          {dottedDate(entry.date)}
        </span>
      </div>

      {/* 这一面的内容：图在上、字在下，整体在纸内滚动 */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cover && (
          <div className="mb-3 overflow-hidden rounded-lg bg-ink/[0.06]">
            <img
              src={cover}
              alt=""
              className="h-44 w-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty('display', 'none');
              }}
              data-testid="diary-page-cover"
            />
          </div>
        )}

        {rest.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-1.5">
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
      </div>

      {/* 小纸条：压在右下角，摞两张；点开看全文 / 改它 */}
      {hasSlips && (
        <div
          className="pointer-events-none absolute inset-x-4 bottom-16 z-10 flex flex-col items-end gap-2"
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
                className={`pointer-events-auto relative block w-[62%] max-w-[210px] text-left transition-transform active:scale-[0.98] ${
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
                    className="max-h-[58px] overflow-hidden whitespace-pre-wrap text-[12px] leading-[19px] text-[#3a3730]"
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

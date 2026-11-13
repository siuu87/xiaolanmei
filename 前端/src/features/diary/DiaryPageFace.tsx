import type { DiaryEntry } from './diaryData';
import { AUTHOR_LABEL, HAND_FONT } from './diaryData';

interface Props {
  entry: DiaryEntry;
}

/** 2026.04.08 这种点分日期（参考图里日期就在页眉右侧） */
function dottedDate(date: string): string {
  return date.replace(/-/g, '.');
}

/**
 * 日记本单页（2026-11-13 改版，参考「整面卡片」日记 App）：
 * 一页 = 一整面纸，右上角日期，上面可以放图、下面写字，图文同页混排。
 * 翻页卡与全屏阅读器共用，保证两边视觉一致。
 */
export function DiaryPageFace({ entry }: Props) {
  const images = entry.images ?? [];
  const [cover, ...rest] = images;
  const hasText = entry.content.trim().length > 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" data-testid="diary-page-face">
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
          ) : images.length > 0 ? null : (
            <span className="text-ink/25">（空白页）</span>
          )}
        </p>
      </div>
    </div>
  );
}

/** 纸面底色（Paper 米白纸）——翻页卡与阅读器共用 */
export const PAPER_CLASS =
  'bg-[#fdfbf6] text-[#3d3a35] dark:bg-[#221f1c] dark:text-[#d8d2c7]';

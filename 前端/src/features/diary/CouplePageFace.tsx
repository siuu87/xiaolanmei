import type { CoupleDay, DiaryEntry } from './diaryData';
import { HAND_FONT } from './diaryData';
import { useProfileStore } from '@/stores/profileStore';

interface Props {
  day: CoupleDay;
}

/** 2026.11.13 这种点分日期（和单页日记一致） */
function dottedDate(date: string): string {
  return date.replace(/-/g, '.');
}

/**
 * 情侣日记的一页（2026-11-13，参考「恋与制作人·百日」那种同一天并排记的写法）：
 * 一天一页，上半是他写的，下半是我写的，中间一条虚线 + 一枚小星把两个人分开。
 * 两半各自在纸内滚动，长文也不会把另一半挤没。
 * 翻页卡与全屏阅读器共用，保证两边视觉一致。
 */
export function CouplePageFace({ day }: Props) {
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerName = useProfileStore((s) => s.partnerName);
  const myName = useProfileStore((s) => s.name);

  const hisName = partnerRemark || partnerName || '他';
  const herName = myName || '我';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" data-testid="diary-couple-face">
      {/* 页眉：日期居中，两边各一条细线，像书页上的日期题头 */}
      <div className="flex shrink-0 items-center gap-3 px-5 pb-0.5 pt-4">
        <span aria-hidden className="h-px flex-1 bg-ink/10" />
        <span className="text-[11px] tabular-nums tracking-[0.14em] text-ink/45">
          {dottedDate(day.date)}
        </span>
        <span aria-hidden className="h-px flex-1 bg-ink/10" />
      </div>

      <Half
        side="theirs"
        name={hisName}
        entry={day.theirs}
        placeholder={`这一天${hisName}还没写`}
      />

      {/* 分隔：虚线 + 小星，压在纸色上 */}
      <div className="relative shrink-0 px-5 py-1" aria-hidden>
        <div className="border-t border-dashed border-ink/15" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#fdfbf6] px-2 text-[10px] leading-none text-ink/25 dark:bg-[#221f1c]">
          ✦
        </span>
      </div>

      <Half
        side="mine"
        name={herName}
        entry={day.mine}
        placeholder="这半页还空着，点右上角写下今天"
      />
    </div>
  );
}

interface HalfProps {
  side: 'theirs' | 'mine';
  name: string;
  entry?: DiaryEntry;
  placeholder: string;
}

/** 一天里属于某个人的那半页 */
function Half({ side, name, entry, placeholder }: HalfProps) {
  const images = entry?.images ?? [];
  const [cover, ...rest] = images;
  const text = entry?.content?.trim() ?? '';

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      data-testid={`diary-couple-${side}`}
      data-filled={text || images.length > 0 ? '1' : '0'}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-5 pt-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${side === 'theirs' ? 'bg-[#c9a0a6]' : 'bg-[#9aa6b2]'}`}
        />
        <span
          className="truncate text-[11px] tracking-[0.12em] text-ink/55"
          style={{ fontFamily: HAND_FONT }}
        >
          {name}
        </span>
        <span className="shrink-0 text-[9px] tracking-[0.2em] text-ink/25">
          {side === 'theirs' ? 'HIM' : 'ME'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-3 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cover && (
          <div className="mb-2 overflow-hidden rounded-md bg-ink/[0.06]">
            <img
              src={cover}
              alt=""
              className="h-24 w-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty(
                  'display',
                  'none',
                );
              }}
            />
          </div>
        )}
        {rest.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {rest.slice(0, 4).map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                className="h-12 w-12 rounded object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {text ? (
          <p
            className="whitespace-pre-wrap text-[15px] text-ink/90"
            style={{ fontFamily: HAND_FONT, lineHeight: '26px' }}
          >
            {text}
          </p>
        ) : (
          <p className="text-[13px] text-ink/35" style={{ fontFamily: HAND_FONT }}>
            {images.length > 0 ? '' : placeholder}
          </p>
        )}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import type { CoupleDay, DiaryEntry } from './diaryData';
import { HAND_FONT } from './diaryData';
import type { PageBox } from './pageLayout';
import { inkLine } from './ink';
import { PaperTexture } from './InkShapes';
import { useProfileStore } from '@/stores/profileStore';

interface Props {
  day: CoupleDay;
  /** 纸页尺寸（固定比例，上下两半都在这张纸里） */
  box: PageBox;
  /** 这一天被排成了几面，这是第几面（从 0 起） */
  slice?: number;
  /** 回报这一页（一天）一共占几面 = 两半里较多的那个 */
  onPages?: (count: number) => void;
  flow?: 'paginate' | 'scroll';
}

/** 2026.11.13 这种点分日期（和单页日记一致） */
function dottedDate(date: string): string {
  return date.replace(/-/g, '.');
}

const PAD_X = 22;
const HEAD_H = 30;
const DIVIDER_H = 16;
const LABEL_H = 20;

/**
 * 情侣日记的一页（2026-11-13，参考「恋与制作人·百日」那种同一天并排记的写法）：
 * 一天一页，上半是他写的，下半是我写的，中间一条虚线 + 一枚小星。
 * 纸页固定大小；哪一半写得长，就自己往后排一面，不会把这张纸撑长。
 */
export function CouplePageFace({ day, box, slice = 0, onPages, flow = 'paginate' }: Props) {
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerName = useProfileStore((s) => s.partnerName);
  const myName = useProfileStore((s) => s.name);

  const hisName = partnerRemark || partnerName || '他';
  const herName = myName || '我';

  const contentW = Math.max(80, box.w - PAD_X * 2);
  const halfH = Math.max(90, (box.h - HEAD_H - DIVIDER_H) / 2);
  const contentH = Math.max(60, halfH - LABEL_H - 8);

  const theirsRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const pagesCb = useRef(onPages);
  pagesCb.current = onPages;

  const theirsKey = (day.theirs?.content ?? '') + (day.theirs?.images ?? []).join('|');
  const mineKey = (day.mine?.content ?? '') + (day.mine?.images ?? []).join('|');

  // 一天占几面：取两半里较多的那个
  useEffect(() => {
    if (flow !== 'paginate') return;
    const measure = () => {
      const nOf = (el: HTMLDivElement | null) =>
        el ? Math.max(1, Math.round(el.scrollWidth / contentW)) : 1;
      pagesCb.current?.(Math.max(nOf(theirsRef.current), nOf(mineRef.current)));
    };
    measure();
    const t = window.setTimeout(measure, 160);
    const obs: ResizeObserver[] = [];
    [theirsRef.current, mineRef.current].forEach((el) => {
      if (!el) return;
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      obs.push(ro);
    });
    return () => {
      window.clearTimeout(t);
      obs.forEach((ro) => ro.disconnect());
    };
  }, [contentW, contentH, theirsKey, mineKey, flow]);

  // 中间那条虚线：手画的，不是 CSS 边框
  const dividerW = Math.max(40, box.w - 40);
  const dividerD = useMemo(
    () => inkLine(0, 0.5, dividerW, 0.5, { seed: `divider-${day.date}`, amp: 0.5 }),
    [dividerW, day.date],
  );

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      data-testid="diary-couple-face"
      style={{ width: box.w, height: box.h }}
    >
      {/* 纸的质感：纸纹 + 手画纸边（情侣本不加横格，中间那条虚线才是这里的分界） */}
      <PaperTexture w={box.w} h={box.h} r={6} seed={`couple-${day.date}-${slice}`} outline />

      <div className="relative z-10 flex h-full w-full flex-col">
        {/* 页眉：日期居中，两边各一条细线，像书页上的日期题头 */}
        <div className="flex shrink-0 items-center gap-3 px-5" style={{ height: HEAD_H }}>
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
          width={contentW}
          height={halfH}
          contentH={contentH}
          slice={slice}
          flow={flow}
          flowRef={theirsRef}
        />

        {/* 分隔：手画的虚线 + 小星，压在纸色上 */}
        <div className="relative shrink-0 px-5" style={{ height: DIVIDER_H }}>
          <svg
            aria-hidden
            className="absolute left-5 top-1/2 -translate-y-1/2 text-ink/25"
            width={dividerW}
            height={2}
            viewBox={`0 0 ${dividerW} 2`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.1}
            strokeDasharray="5 4"
            strokeLinecap="round"
          >
            <path d={dividerD} />
          </svg>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#fdfbf6] px-2 text-[10px] leading-none text-ink/25 dark:bg-[#221f1c]">
            ✦
          </span>
        </div>

        <Half
          side="mine"
          name={herName}
          entry={day.mine}
          placeholder="这半页还空着，点右上角写下今天"
          width={contentW}
          height={halfH}
          contentH={contentH}
          slice={slice}
          flow={flow}
          flowRef={mineRef}
        />
      </div>
    </div>
  );
}

interface HalfProps {
  side: 'theirs' | 'mine';
  name: string;
  entry?: DiaryEntry;
  placeholder: string;
  width: number;
  height: number;
  contentH: number;
  slice: number;
  flow: 'paginate' | 'scroll';
  flowRef: React.Ref<HTMLDivElement>;
}

/** 一天里属于某个人的那半页 */
function Half({
  side,
  name,
  entry,
  placeholder,
  width,
  height,
  contentH,
  slice,
  flow,
  flowRef,
}: HalfProps) {
  const images = entry?.images ?? [];
  const [cover, ...rest] = images;
  const text = entry?.content?.trim() ?? '';

  const body = (
    <>
      {cover && (
        <div
          className="relative mb-2.5 bg-white p-[4px] pb-1.5 shadow-[0_8px_14px_-10px_rgba(0,0,0,0.6)]"
          style={{ breakInside: 'avoid', transform: 'rotate(-0.6deg)' }}
        >
          <img
            src={cover}
            alt=""
            className="w-full object-cover"
            style={{ height: Math.round(contentH * 0.38) }}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty('display', 'none');
            }}
          />
        </div>
      )}
      {rest.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" style={{ breakInside: 'avoid' }}>
          {rest.slice(0, 4).map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              className="h-11 w-11 border-2 border-white object-cover shadow-[0_4px_10px_-7px_rgba(0,0,0,0.6)]"
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
    </>
  );

  return (
    <section
      className="flex flex-col overflow-hidden"
      data-testid={`diary-couple-${side}`}
      data-filled={text || images.length > 0 ? '1' : '0'}
      style={{ height }}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-5" style={{ height: LABEL_H }}>
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

      <div className="relative overflow-hidden" style={{ height: contentH, width, marginLeft: PAD_X }}>
        {flow === 'scroll' ? (
          <div className="relative h-full" style={{ width }}>
            <div
              className="h-full overflow-y-auto overscroll-contain pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ width }}
            >
              {body}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#fdfbf6] to-transparent dark:from-[#221f1c]"
            />
          </div>
        ) : (
          <div
            ref={flowRef}
            style={{
              width,
              height: contentH,
              columnWidth: width,
              columnGap: 0,
              columnFill: 'auto',
              transform: `translateX(${-slice * width}px)`,
              transition: 'transform 320ms ease',
            }}
          >
            {body}
          </div>
        )}
      </div>
    </section>
  );
}

import { HAND_FONT } from './diaryData';

/**
 * 手账式贴图（2026-11-15）：
 *
 * 日记页面里的照片不再是一排方块，而是一张张「贴」上去的：
 * 拍立得白框（底下留一条写小字）+ 一条半透明纸胶带 + 随手歪 2~4 度 + 落纸的投影。
 *
 * 角度不随机 —— 用 src 算一个稳定 hash，同一张照片每次打开都歪同一个角度，
 * 不然每翻一次页、每重排一次 DOM，照片就在原地抖一下。
 */

/** 纸胶带：手账里最常见的那几种颜色（薄荷 / 奶油 / 藕粉 / 雾蓝） */
const TAPES = [
  'rgba(206, 232, 219, 0.80)',
  'rgba(246, 228, 186, 0.82)',
  'rgba(238, 214, 224, 0.80)',
  'rgba(206, 222, 240, 0.80)',
];

/** 胶带两端的手撕毛边（不用图片，纯 clip-path 锯齿） */
const TORN =
  'polygon(0 8%, 7% 0, 15% 6%, 24% 1%, 33% 7%, 43% 0, 52% 6%, 61% 1%, 70% 7%, 79% 0, 88% 6%, 96% 1%, 100% 7%, 100% 93%, 93% 100%, 84% 94%, 75% 99%, 66% 93%, 56% 100%, 47% 94%, 38% 99%, 29% 93%, 19% 100%, 10% 94%, 0 99%)';

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Props {
  src: string;
  /** 拍立得外框宽（px），高由 ratio 算出来 */
  w: number;
  /** 照片区高宽比，默认接近 3:4 竖构图 */
  ratio?: number;
  /** 覆盖倾斜角度；不传就按 src 稳定生成 */
  rotate?: number;
  /** 白框底下那行小字（时间 / 标签 / 一句话） */
  caption?: string;
  /** 胶带贴在哪 */
  tape?: 'top' | 'left' | 'right' | 'none';
  onClick?: () => void;
  /** 额外位移，拼贴错落用 */
  offsetX?: number;
  offsetY?: number;
  z?: number;
}

export function TapedPhoto({
  src,
  w,
  ratio = 0.74,
  rotate,
  caption,
  tape = 'top',
  onClick,
  offsetX = 0,
  offsetY = 0,
  z = 1,
}: Props) {
  const h = hashOf(src);
  const deg = rotate ?? Number((((h % 700) / 100 - 3.4)).toFixed(2));
  const tapeColor = TAPES[h % TAPES.length];
  const inner = w - 10;
  const imgH = Math.round(inner * ratio);
  /** 底下那条留白：有小字就宽一点，没有就只留一道窄边 */
  const capH = caption ? 20 : 6;

  const tapeSize = Math.max(30, Math.round(w * 0.34));
  const tapeStyle =
    tape === 'top'
      ? { left: '50%', top: -7, marginLeft: -tapeSize / 2, transform: 'rotate(-2.2deg)' }
      : tape === 'left'
        ? { left: -Math.round(tapeSize * 0.34), top: -6, transform: 'rotate(-38deg)' }
        : { right: -Math.round(tapeSize * 0.34), top: -6, transform: 'rotate(38deg)' };

  return (
    <div
      className="relative shrink-0 transition-opacity duration-150 active:opacity-85"
      style={{
        width: w,
        transform: `translate(${offsetX}px, ${offsetY}px) rotate(${deg}deg)`,
        zIndex: z,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label={caption ? `照片：${caption}` : '照片'}
        className="block w-full bg-[#fbf8f0] text-left dark:bg-[#4a4238]"
        style={{
          padding: 5,
          paddingBottom: capH + 5,
          borderRadius: 2,
          boxShadow:
            '0 10px 18px -10px rgba(38,32,24,0.55), 0 2px 4px -2px rgba(38,32,24,0.18), inset 0 0 0 0.5px rgba(0,0,0,0.10)',
        }}
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="block w-full select-none object-cover"
          style={{ height: imgH, borderRadius: 1 }}
        />
        {caption && (
          <span
            className="absolute inset-x-0 bottom-0 flex items-center justify-center truncate px-1.5 text-[9px] leading-[20px] text-[#8a8272] dark:text-[#c9bfae]"
            style={{ fontFamily: HAND_FONT }}
          >
            {caption}
          </span>
        )}
      </button>

      {tape !== 'none' && (
        <span
          aria-hidden
          className="pointer-events-none absolute h-[13px] opacity-90 dark:opacity-60"
          style={{
            width: tapeSize,
            background: tapeColor,
            clipPath: TORN,
            boxShadow: '0 1px 2px rgba(0,0,0,0.10)',
            ...tapeStyle,
          }}
        />
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import type { LetterTheme } from './notesData';

/**
 * 信封 / 信纸 / 火漆的配色表。
 *
 * 2026-11-13 从 3 套扩到 6 套，并且信封不再是「只能跟着主题走」——
 * 用户可以给某一封信单独换信封颜色（`PATCH /api/notes/:id { letterTheme }`）。
 *
 * 字段分两类：
 * - **Tailwind class**（paper / envelope / ink / meta …）：给 HTML 层用；
 * - **纯色 hex**（paperSolid / envSolid / stage / sealBase / sealDark …）：给 SVG 填充用，
 *   SVG 里不能写 class，而撕口、背板、火漆这些必须在 SVG 里画。
 *
 * 新主题只加这一张表，别的文件不用动。
 */

export type { LetterTheme };

export interface LetterThemeParts {
  /** 信纸（HTML 层渐变） */
  paper: string;
  /** 信纸底色（SVG / 整块底） */
  paperSolid: string;
  /** 信封本体 */
  envelope: string;
  /** 信封纸主色（SVG 填充：背板、撕口、前面板） */
  envSolid: string;
  /** 信封封盖：填充色 / 描边色 */
  flapFill: string;
  flapStroke: string;
  /** 弹窗舞台底色（整屏纯色，比信封淡一档） */
  stage: string;
  /** 胶囊 / 标签底色（跟信封同色系，用于日期条） */
  chip: string;
  /** 火漆印（HTML class + 蜡色两端，SVG 用） */
  seal: string;
  sealGlow: string;
  sealBase: string;
  sealDark: string;
  /** 正文墨色（night 主题是浅色，其余是深色） */
  ink: string;
  /** 正文墨色纯色版（弹窗里要写 inline style） */
  inkSolid: string;
  /** 日期 / 署名 */
  meta: string;
  /** 日期 / 署名纯色版 */
  metaSolid: string;
  /** 卡片主视觉（封面）渐变 */
  cover: string;
  /** 封面底部的渐隐 */
  coverFade: string;
  /** 封面上的月亮微光 */
  moon: string;
  moonGlow: string;
  /** 星点 */
  star: string;
}

export const LETTER_THEME_PARTS: Record<LetterTheme, LetterThemeParts> = {
  default: {
    paper: 'bg-gradient-to-b from-[#fbf7ef] to-[#f1e9d7]',
    paperSolid: '#FBF7EF',
    envelope: 'bg-gradient-to-b from-[#efe6d5] to-[#e0d5be]',
    envSolid: '#E9DFCA',
    flapFill: '#dcd0b9',
    flapStroke: '#c9bca2',
    stage: '#FFFCF2',
    chip: '#F3EAD6',
    seal: 'bg-gradient-to-br from-[#b4554c] to-[#8d3b34] text-white/95',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(180,85,76,0.7)]',
    sealBase: '#B4554C',
    sealDark: '#8D3B34',
    ink: 'text-[#4a4034]',
    inkSolid: '#4A4034',
    meta: 'text-[#8a7f6d]',
    metaSolid: '#8A7F6D',
    cover: 'bg-gradient-to-b from-[#efe7d8] via-[#e5dac6] to-[#d9cdb6]',
    coverFade: 'bg-gradient-to-t from-[#d9cdb6] to-transparent',
    moon: 'bg-gradient-to-br from-[#fffaf0] to-[#efe0c4] opacity-80',
    moonGlow: 'shadow-[0_0_18px_4px_rgba(239,224,196,0.28)]',
    star: 'bg-[#8a7f6d]/40',
  },
  memorial: {
    paper: 'bg-gradient-to-b from-[#fff6f3] to-[#f8e4dd]',
    paperSolid: '#FFF6F3',
    envelope: 'bg-gradient-to-b from-[#f7e3db] to-[#eac9bd]',
    envSolid: '#F2DCD2',
    flapFill: '#e9cabe',
    flapStroke: '#d8ab9b',
    stage: '#FFF9F6',
    chip: '#FAE8E0',
    seal: 'bg-gradient-to-br from-[#d9b53a] to-[#a9801a] text-[#3a2a10]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(201,162,39,0.75)]',
    sealBase: '#D9B53A',
    sealDark: '#A9801A',
    ink: 'text-[#5b3a33]',
    inkSolid: '#5B3A33',
    meta: 'text-[#9a7a70]',
    metaSolid: '#9A7A70',
    cover: 'bg-gradient-to-b from-[#f9e6de] via-[#f0cdbf] to-[#e6b7a4]',
    coverFade: 'bg-gradient-to-t from-[#e6b7a4] to-transparent',
    moon: 'bg-gradient-to-br from-[#fff3d6] to-[#e8c877] opacity-95',
    moonGlow: 'shadow-[0_0_22px_6px_rgba(232,200,119,0.32)]',
    star: 'bg-[#b08a4a]/50',
  },
  night: {
    paper: 'bg-gradient-to-b from-[#1c2340] to-[#111728]',
    paperSolid: '#1C2340',
    envelope: 'bg-gradient-to-b from-[#242d4a] to-[#161d31]',
    envSolid: '#232C48',
    flapFill: '#2c3550',
    flapStroke: '#3d4767',
    stage: '#0E1322',
    chip: '#1E2740',
    seal: 'bg-gradient-to-br from-[#e3c07a] to-[#a8813a] text-[#1a1206]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(227,192,122,0.7)]',
    sealBase: '#E3C07A',
    sealDark: '#A8813A',
    ink: 'text-[#dfe4ef]',
    inkSolid: '#DFE4EF',
    meta: 'text-[#8f9ab5]',
    metaSolid: '#8F9AB5',
    cover: 'bg-gradient-to-b from-[#242e4b] via-[#171e33] to-[#101726]',
    coverFade: 'bg-gradient-to-t from-[#0e1322] to-transparent',
    moon: 'bg-gradient-to-br from-[#f7e6ba] to-[#e0c489] opacity-90',
    moonGlow: 'shadow-[0_0_22px_6px_rgba(247,230,186,0.18)]',
    star: 'bg-white/60',
  },
  kraft: {
    paper: 'bg-gradient-to-b from-[#fdf8ec] to-[#f4ead3]',
    paperSolid: '#FDF8EC',
    envelope: 'bg-gradient-to-b from-[#d9b98d] to-[#c19a6b]',
    envSolid: '#CFAC7E',
    flapFill: '#c8a271',
    flapStroke: '#ab8452',
    stage: '#FBF4E6',
    chip: '#EBD6B2',
    seal: 'bg-gradient-to-br from-[#a34e3e] to-[#7c3428] text-[#fbe9e1]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(163,78,62,0.7)]',
    sealBase: '#A34E3E',
    sealDark: '#7C3428',
    ink: 'text-[#4a3a2a]',
    inkSolid: '#4A3A2A',
    meta: 'text-[#8a7458]',
    metaSolid: '#8A7458',
    cover: 'bg-gradient-to-b from-[#e6cba3] via-[#d9b98d] to-[#c8a473]',
    coverFade: 'bg-gradient-to-t from-[#c8a473] to-transparent',
    moon: 'bg-gradient-to-br from-[#fff6df] to-[#e8cf9f] opacity-90',
    moonGlow: 'shadow-[0_0_20px_5px_rgba(232,207,159,0.3)]',
    star: 'bg-[#8a7458]/45',
  },
  sage: {
    paper: 'bg-gradient-to-b from-[#fbfaf3] to-[#eef0e2]',
    paperSolid: '#FBFAF3',
    envelope: 'bg-gradient-to-b from-[#d3dcc6] to-[#b9c6a9]',
    envSolid: '#C9D4BA',
    flapFill: '#c3cfb2',
    flapStroke: '#a4b391',
    stage: '#F8FAF3',
    chip: '#E4EAD9',
    seal: 'bg-gradient-to-br from-[#b96b4e] to-[#8e4a33] text-[#fdf1e8]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(185,107,78,0.65)]',
    sealBase: '#B96B4E',
    sealDark: '#8E4A33',
    ink: 'text-[#3f4438]',
    inkSolid: '#3F4438',
    meta: 'text-[#7d8570]',
    metaSolid: '#7D8570',
    cover: 'bg-gradient-to-b from-[#dfe6d3] via-[#ccd6bd] to-[#b9c6a9]',
    coverFade: 'bg-gradient-to-t from-[#b9c6a9] to-transparent',
    moon: 'bg-gradient-to-br from-[#fdfbf2] to-[#e6ead8] opacity-90',
    moonGlow: 'shadow-[0_0_18px_4px_rgba(230,234,216,0.28)]',
    star: 'bg-[#7d8570]/45',
  },
  lilac: {
    paper: 'bg-gradient-to-b from-[#fdfaff] to-[#f2ecfa]',
    paperSolid: '#FDFAFF',
    envelope: 'bg-gradient-to-b from-[#e6dcf2] to-[#cfc0e4]',
    envSolid: '#DED2EE',
    flapFill: '#d9cdea',
    flapStroke: '#bcabd4',
    stage: '#FBF8FF',
    chip: '#EEE6F8',
    seal: 'bg-gradient-to-br from-[#9b5a86] to-[#723e62] text-[#fbeef6]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(155,90,134,0.65)]',
    sealBase: '#9B5A86',
    sealDark: '#723E62',
    ink: 'text-[#453a52]',
    inkSolid: '#453A52',
    meta: 'text-[#8a7d99]',
    metaSolid: '#8A7D99',
    cover: 'bg-gradient-to-b from-[#efe7f8] via-[#e2d5f0] to-[#d3c2e6]',
    coverFade: 'bg-gradient-to-t from-[#d3c2e6] to-transparent',
    moon: 'bg-gradient-to-br from-[#fffafd] to-[#ecdff6] opacity-90',
    moonGlow: 'shadow-[0_0_18px_4px_rgba(236,223,246,0.3)]',
    star: 'bg-[#8a7d99]/45',
  },
};

/** 取一套主题配色；传进来的值非法就退回 default */
export function letterParts(theme: LetterTheme | undefined): LetterThemeParts {
  return LETTER_THEME_PARTS[theme ?? 'default'] ?? LETTER_THEME_PARTS.default;
}

/** 蜡体外缘的起伏：18 个瓣，半径抖在 16.4~19.6 之间（写死，两次渲染完全一致） */
const SEAL_LUMPS = [
  17.6, 19.2, 16.8, 18.7, 17.2, 19.4, 16.5, 18.2, 17.9, 19.6, 16.6, 18.4, 17.4, 19.0, 16.9, 18.8,
  17.1, 19.2,
];

/** 用二次贝塞尔把相邻两点接成柔顺的波浪边 —— 蜡是流的，不该有直角 */
function sealPath(cx: number, cy: number, k = 1): string {
  const n = SEAL_LUMPS.length;
  const pts = SEAL_LUMPS.map((r, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as const;
  });
  const mid = (a: readonly [number, number], b: readonly [number, number]) =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${start[0].toFixed(2)} ${start[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${m[0].toFixed(2)} ${m[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * 火漆印章（2026-11-13 重画）。
 *
 * 原来是 `rounded-full` + emoji，看着像一张贴纸；真实火漆是**手压出来的一坨蜡**：
 * 边缘不规则、中间压进去一个凹面、凹面里留一枚印记。所以拆成四层：
 *
 * 1. 蜡体：18 瓣起伏的柔和边（`sealPath`），带一点厚度阴影；
 * 2. 高光：偏左上的一小块亮面，蜡是半透的；
 * 3. 内圈凹面：比外圈暗一点，被章压过的那一圈；
 * 4. 印记：一朵小蓝莓（三颗果 + 两片叶）。
 *
 * `cracked` 时两半各自歪一点、中间露一道缝 —— 拆过的信不该还是完好一枚。
 */
export function WaxSeal({
  parts,
  size = 28,
  cracked = false,
  className,
}: {
  parts: LetterThemeParts;
  size?: number;
  cracked?: boolean;
  className?: string;
}) {
  const idSafe = parts.sealBase.replace('#', '');
  const wax = sealPath(20, 20);

  /** 整枚蜡（蜡体 + 高光 + 凹面 + 印记）。裂开时画两遍，各自裁一半 */
  const body = (key: string) => (
    <g key={key}>
      <path d={wax} fill={`url(#ws-${idSafe})`} />
      {/* 蜡的边缘：一圈很细的深色，交代厚度 */}
      <path d={wax} fill="none" stroke={parts.sealDark} strokeWidth="0.6" strokeOpacity="0.5" />
      {/* 高光：偏左上，别太亮，蜡是哑光的 */}
      <ellipse
        cx="14.6"
        cy="12.4"
        rx="6.4"
        ry="4.2"
        fill="#fff"
        opacity="0.16"
        transform="rotate(-24 14.6 12.4)"
      />
      {/* 压出来的凹面 */}
      <circle cx="20" cy="20.4" r="11.4" fill={parts.sealDark} opacity="0.16" />
      <circle cx="20" cy="20.9" r="11.4" fill={parts.sealBase} opacity="0.5" />
      <circle
        cx="20"
        cy="20.4"
        r="11.4"
        fill="none"
        stroke={parts.sealDark}
        strokeWidth="0.8"
        strokeOpacity="0.45"
      />
      {/* 印记：小蓝莓 */}
      <g>
        <circle cx="16.5" cy="22" r="3.4" fill={parts.sealDark} opacity="0.7" />
        <circle cx="23.5" cy="22.2" r="3.4" fill={parts.sealDark} opacity="0.7" />
        <circle cx="20" cy="17.2" r="3.6" fill={parts.sealDark} opacity="0.74" />
        <path
          d="M20 13.7c.9-1.9 2.6-2.6 4.2-2.4-.3 1.9-1.7 3.2-3.5 3.4"
          fill={parts.sealDark}
          opacity="0.6"
        />
        <path
          d="M19.4 13.8c-.7-1.7-2.2-2.4-3.6-2.3.2 1.7 1.4 2.9 3 3.2"
          fill={parts.sealDark}
          opacity="0.48"
        />
      </g>
    </g>
  );

  return (
    <svg
      aria-hidden
      data-testid="wax-seal"
      data-cracked={cracked ? '1' : '0'}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn('block', className)}
      style={{ filter: 'drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.24))' }}
    >
      <defs>
        <radialGradient id={`ws-${idSafe}`} cx="36%" cy="28%" r="76%">
          <stop offset="0%" stopColor={parts.sealBase} />
          <stop offset="58%" stopColor={parts.sealBase} />
          <stop offset="100%" stopColor={parts.sealDark} />
        </radialGradient>
      </defs>

      {cracked ? (
        <>
          <g style={{ clipPath: 'polygon(0 0, 48% 0, 46% 100%, 0 100%)' }}>
            <g style={{ transform: 'rotate(-6deg) translate(-1.4px, -0.6px)', transformOrigin: '20px 20px' }}>
              {body('l')}
            </g>
          </g>
          <g style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 52% 100%)' }}>
            <g style={{ transform: 'rotate(5deg) translate(1.4px, 0.6px)', transformOrigin: '20px 20px' }}>
              {body('r')}
            </g>
          </g>
        </>
      ) : (
        body('whole')
      )}
    </svg>
  );
}

/** 封盖三角 + 火漆印：铺满父容器，父容器需要 relative + overflow-hidden */
export function EnvelopeFlap({
  theme = 'default',
  seal = true,
  sealClass = 'h-3.5 w-3.5 text-[7px]',
}: {
  theme?: LetterTheme;
  seal?: boolean;
  sealClass?: string;
}) {
  const p = letterParts(theme);
  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path d="M0 0 L50 44 L100 0 Z" fill={p.flapFill} />
        <path
          d="M0 0 L50 44 L100 0 Z"
          fill="none"
          stroke={p.flapStroke}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {seal && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2',
            'items-center justify-center',
            sealClass,
          )}
        >
          <WaxSeal parts={p} size={22} />
        </span>
      )}
    </>
  );
}

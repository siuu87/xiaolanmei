import { cn } from '@/lib/utils';
import type { LetterTheme } from './notesData';

/**
 * 阅读页（拆开一封信）用的信封零件与配色。
 *
 * 2026-10-18 新增**信封主题（letter_theme）**：同一套零件按主题换配色，
 * 前端信箱按 `note.letterTheme` 选一套渲染，视觉与数据解耦、新增主题只改这张表。
 * - `default`  **奶油手帐（2026-11-11 换皮）**：奶油米白纸 + 灰米白信封 + 蓝色手绘星星。
 *   参考 Mee 冬日回信，去掉了暗红火漆 / 金边 / 丝带，见 `MeeSkin.tsx`。
 * - `memorial` 纪念日：暖玫瑰金 + 金箔火漆
 * - `night`    深色磨砂星空：深蓝紫纸 + 银蓝火漆（注意墨色要反过来变浅）
 *
 * 枚举本身定义在 `notesData.ts`（它是信件实体的字段），这里只做「主题 → 配色」。
 */

export type { LetterTheme };

export interface LetterThemeParts {
  /** 信纸 */
  paper: string;
  /** 信封本体 */
  envelope: string;
  /** 封盖三角：填充色 / 描边色 */
  flapFill: string;
  flapStroke: string;
  /** 火漆印（底 + 字色） */
  seal: string;
  /** 火漆印的柔光，跟着火漆色走 */
  sealGlow: string;
  /** 正文墨色（night 主题是浅色，其余是深色） */
  ink: string;
  /** 日期 / 署名 */
  meta: string;
  /** 卡片主视觉（封面）渐变 */
  cover: string;
  /** 封面底部的渐隐（night 融进深色卡片，浅色主题就淡到封面自身底色） */
  coverFade: string;
  /** 封面上的月亮微光 */
  moon: string;
  /** 月亮外圈柔光 */
  moonGlow: string;
  /** 星点（night 主题才明显） */
  star: string;
}

export const LETTER_THEME_PARTS: Record<LetterTheme, LetterThemeParts> = {
  default: {
    paper: 'bg-gradient-to-b from-[#FCFAF3] to-[#F6F2E6]',
    envelope: 'bg-gradient-to-b from-[#F1EEE3] to-[#E9E4D5]',
    flapFill: '#EFEBDE',
    flapStroke: '#DED8C7',
    // 火漆在 Mee 皮肤下不显示（调用方传 seal={false}），这里留蓝色兜底，别再回到暗红
    seal: 'bg-[#5B8DDE] text-white',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(91,141,222,0.5)]',
    ink: 'text-[#3E3D38]',
    meta: 'text-[#9C988B]',
    cover: 'bg-gradient-to-b from-[#FAF8F0] via-[#F6F2E6] to-[#EFEBDE]',
    coverFade: 'bg-gradient-to-t from-[#EFEBDE] to-transparent',
    moon: 'bg-gradient-to-br from-[#FFFDF5] to-[#FFE48C] opacity-75',
    moonGlow: 'shadow-[0_0_18px_4px_rgba(255,228,140,0.22)]',
    star: 'bg-[#5B8DDE]/35',
  },
  memorial: {
    paper: 'bg-gradient-to-b from-[#fff6f3] to-[#f8e4dd]',
    envelope: 'bg-gradient-to-b from-[#f7e3db] to-[#eac9bd]',
    flapFill: '#e9cabe',
    flapStroke: '#d8ab9b',
    seal: 'bg-gradient-to-br from-[#d9b53a] to-[#a9801a] text-[#3a2a10]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(201,162,39,0.75)]',
    ink: 'text-[#5b3a33]',
    meta: 'text-[#9a7a70]',
    cover: 'bg-gradient-to-b from-[#f9e6de] via-[#f0cdbf] to-[#e6b7a4]',
    coverFade: 'bg-gradient-to-t from-[#e6b7a4] to-transparent',
    moon: 'bg-gradient-to-br from-[#fff3d6] to-[#e8c877] opacity-95',
    moonGlow: 'shadow-[0_0_22px_6px_rgba(232,200,119,0.32)]',
    star: 'bg-[#b08a4a]/50',
  },
  night: {
    paper: 'bg-gradient-to-b from-[#1c2340] to-[#111728]',
    envelope: 'bg-gradient-to-b from-[#242d4a] to-[#161d31]',
    flapFill: '#2c3550',
    flapStroke: '#3d4767',
    seal: 'bg-gradient-to-br from-[#9db5e8] to-[#6a86c4] text-[#101828]',
    sealGlow: 'shadow-[0_0_12px_-2px_rgba(127,155,209,0.75)]',
    ink: 'text-[#dfe4ef]',
    meta: 'text-[#8f9ab5]',
    cover: 'bg-gradient-to-b from-[#242e4b] via-[#171e33] to-[#101726]',
    coverFade: 'bg-gradient-to-t from-[#0e1322] to-transparent',
    moon: 'bg-gradient-to-br from-[#f7e6ba] to-[#e0c489] opacity-90',
    moonGlow: 'shadow-[0_0_22px_6px_rgba(247,230,186,0.18)]',
    star: 'bg-white/60',
  },
};

/** 取一套主题配色；传进来的值非法就退回 default */
export function letterParts(theme: LetterTheme | undefined): LetterThemeParts {
  return LETTER_THEME_PARTS[theme ?? 'default'] ?? LETTER_THEME_PARTS.default;
}

/**
 * **奶油手帐统一纸面（2026-11-11）**
 *
 * 库里的旧信带着 `memorial`（玫瑰金）/ `night`（深蓝星空）主题，换皮后会变成
 * 粉的、深蓝的信封，一整本信看着像三套产品拼在一起。用户要的是「整本都是
 * Mee 那种米白纸」，所以**渲染时**把纸 / 信封 / 封盖 / 墨色一律刷成 default 的奶油色。
 *
 * `letter_theme` 不清库、不改后端：它仍然是信件实体的有效字段，
 * 火漆 / 月色 / 星点这些**点缀**还跟着主题走，将来想做「纪念日特别版星星」有得接。
 */
export function meeLetterParts(theme: LetterTheme | undefined): LetterThemeParts {
  const base = letterParts(theme);
  const cream = LETTER_THEME_PARTS.default;
  return {
    ...base,
    paper: cream.paper,
    envelope: cream.envelope,
    flapFill: cream.flapFill,
    flapStroke: cream.flapStroke,
    ink: cream.ink,
    meta: cream.meta,
  };
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
      {/* V 形封盖：从左上一路压到中间再回到右上 */}
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
            'items-center justify-center rounded-full shadow-sm',
            p.seal,
            sealClass,
          )}
        >
          🫐
        </span>
      )}
    </>
  );
}

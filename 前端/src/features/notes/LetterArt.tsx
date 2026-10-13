import { cn } from '@/lib/utils';

/**
 * 阅读页（拆开一封信）用的信封零件与配色。
 * 信箱列表那头已经是仿文件夹了（见 LetterFolder.tsx），这里只留阅读页需要的部分。
 */

/** 信纸渐变 */
export const PAPER_BG = 'bg-gradient-to-b from-[#fbf7ef] to-[#f1e9d7]';
/** 信封渐变（比信纸深一档，好区分前后） */
export const ENVELOPE_BG = 'bg-gradient-to-b from-[#efe6d5] to-[#e0d5be]';

/** 封盖三角 + 火漆印：铺满父容器，父容器需要 relative + overflow-hidden */
export function EnvelopeFlap({
  seal = true,
  sealClass = 'h-3.5 w-3.5 text-[7px]',
}: {
  seal?: boolean;
  sealClass?: string;
}) {
  return (
    <>
      {/* V 形封盖：从左上一路压到中间再回到右上 */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path d="M0 0 L50 44 L100 0 Z" fill="#dcd0b9" />
        <path
          d="M0 0 L50 44 L100 0 Z"
          fill="none"
          stroke="#c9bca2"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {seal && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2',
            'items-center justify-center rounded-full bg-[#a8443c] text-white shadow-sm',
            sealClass,
          )}
        >
          🫐
        </span>
      )}
    </>
  );
}

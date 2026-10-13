import { cn } from '@/lib/utils';
import { formatNoteDate, type InspirationNote } from './notesData';

/**
 * 信件的三种形态（三处共用同一套配色，改这里就全统一）：
 * 1. `LetterEnvelope`：压缩的朴素信封——高度压扁、只有信封的样子，**不显示内容**；
 * 2. `LetterOpenedMini`：展开的信纸 + 背后露出的信封（已读态小卡）；
 * 3. 阅读页的展开动画（见 LetterReaderLayer）。
 *
 * 视觉：米白信纸 / 米色信封 / 顶部的封盖三角 / 中央蓝莓火漆印。
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

/**
 * 压缩信封（收起态）：就一个最普通的信封，高度压扁，内容一概不显示。
 * 日期是唯一露在外面的信息——否则一摞信完全分不出来。
 */
export function LetterEnvelope({
  note,
  onClick,
  className,
  testId = 'letter-envelope',
}: {
  note: InspirationNote;
  onClick: () => void;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`打开 ${formatNoteDate(note.createdAt)} 的来信`}
      data-testid={testId}
      data-note-id={note.id}
      className={cn(
        'relative flex h-10 w-full items-center overflow-hidden rounded-[3px]',
        ENVELOPE_BG,
        'shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition active:scale-[0.99] hover:brightness-[1.03]',
        className,
      )}
    >
      <EnvelopeFlap />
      <span className="relative z-[1] ml-auto mr-2 text-[9px] text-[#8a7f6d]">
        {formatNoteDate(note.createdAt)}
      </span>
    </button>
  );
}

/**
 * 已读态小卡：展开的信纸 + 背后露出一截的信封（信纸压在信封上半部）。
 * 用 span 而非 div——它在 <button> 里，button 只允许 phrasing content。
 */
export function LetterOpenedMini({
  note,
  onClick,
}: {
  note: InspirationNote;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`重读 ${formatNoteDate(note.createdAt)} 的来信`}
      data-testid="notes-page-letter-opened"
      data-note-id={note.id}
      className="relative block w-full text-left"
    >
      {/* 背后信封：只露出下面一截 */}
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 block h-[54px] overflow-hidden rounded-[3px]',
          ENVELOPE_BG,
          'shadow-[0_2px_8px_rgba(0,0,0,0.28)]',
        )}
      >
        <EnvelopeFlap sealClass="h-3 w-3 text-[6px]" />
      </span>

      {/* 前面信纸 */}
      <span
        className={cn(
          'relative z-10 block h-[106px] overflow-hidden rounded-[3px] px-2.5 py-2',
          'text-[#4a4034] shadow-[0_6px_18px_rgba(0,0,0,0.32)]',
          PAPER_BG,
        )}
      >
        <span className="line-clamp-3 block text-[10px] leading-[16px]">{note.content}</span>
        <span className="mt-1.5 block text-right text-[8px] text-[#8a7f6d]">
          {formatNoteDate(note.createdAt)}
        </span>
      </span>
    </button>
  );
}

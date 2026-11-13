import type { DiaryBook } from './diaryData';
import { BOOK_KIND_LABEL, HAND_FONT } from './diaryData';
import { kindIcon } from './BookSheet';
import { InkBorder } from './InkShapes';
import { Lock } from 'lucide-react';

interface Props {
  book: Pick<DiaryBook, 'name' | 'kind' | 'cover' | 'coverImage' | 'locked'>;
  /** 副信息，例如「3 页 · 已上锁」；不传就不显示 */
  meta?: string;
  /** 大封面（书架）显示封底纸质标签；小封面只留名字 */
  compact?: boolean;
  className?: string;
}

/**
 * 本子封面（2026-11-13 照 Paper 的本子做）：
 * 硬壳 + 布纹 + 左侧书脊 + 底部一块米色纸质标签写名字。
 * 封皮可以是莫兰迪纯色，也可以是图片（图片上压暗角，标签照样读得清）。
 * 书架、设置弹层预览、开本动画共用，三处视觉必须一致。
 */
export function BookCover({ book, meta, compact = false, className = '' }: Props) {
  const Icon = kindIcon(book.kind);
  const hasImg = !!book.coverImage;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      data-testid="diary-book-cover"
      data-cover-kind={hasImg ? 'image' : 'solid'}
      style={{
        background: hasImg ? '#2c2a28' : book.cover,
        borderRadius: compact ? '4px 6px 6px 4px' : '6px 9px 9px 6px',
        boxShadow: compact
          ? '0 18px 40px -22px rgba(0,0,0,0.55)'
          : '0 26px 46px -28px rgba(0,0,0,0.62)',
      }}
    >
      {hasImg && (
        <img src={book.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      )}

      {/* 布纹：两层细密交叉线，纯色封面才看得出来 */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 3px)',
        }}
      />
      {/* 图片封皮压暗角，底部渐深，纸质标签才立得住 */}
      {hasImg && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.42) 100%)',
          }}
        />
      )}

      {/* 书脊：左侧一道暗边 + 一条细高光 */}
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 ${compact ? 'w-[7px]' : 'w-[13px]'}`}
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.38), rgba(0,0,0,0.10) 62%, transparent)',
        }}
      />
      <div
        aria-hidden
        className={`absolute inset-y-0 ${compact ? 'left-[7px]' : 'left-[13px]'} w-px bg-white/15`}
      />
      {/* 右侧纸页断面：一眼看出这是一本装订好的本子 */}
      <div
        aria-hidden
        className={`absolute inset-y-1 right-0 ${compact ? 'w-[3px]' : 'w-[5px]'}`}
        style={{
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.10), rgba(247,242,232,0.9) 55%, rgba(206,198,183,0.95))',
          borderTopRightRadius: compact ? 6 : 9,
          borderBottomRightRadius: compact ? 6 : 9,
        }}
      />
      {/* 顶部高光 + 底部落影 */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-5"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.20), transparent)' }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-8"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.14), transparent)' }}
      />

      {book.locked && (
        <span className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/28 text-white/90 backdrop-blur-[1px]">
          <Lock className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </span>
      )}

      {/* 手画的封皮边 + 内侧压印框：一眼看出是硬壳本，不是一块色块 */}
      <InkBorder
        className="pointer-events-none text-black/35"
        style={{ position: 'absolute', inset: 0 }}
        r={compact ? 5 : 8}
        seed={`cover-edge-${book.name}`}
        amp={1.2}
        strokeWidth={1.2}
        laps={1}
      />
      <InkBorder
        className="pointer-events-none text-white/18"
        style={{ position: 'absolute', inset: compact ? 3 : 7 }}
        r={compact ? 3 : 5}
        seed={`cover-inner-${book.name}`}
        amp={1}
        strokeWidth={1}
        laps={1}
      />

      {/* 内容：纸质标签贴在封面下半部 */}
      <div className={`relative flex h-full flex-col justify-end ${compact ? 'p-2' : 'p-4 pl-5'}`}>
        {!compact && (
          <Icon className="mb-auto h-6 w-6 text-white/55" strokeWidth={1.6} />
        )}
        <InkBorder
          className="w-fit max-w-full -rotate-[1.2deg] text-[#3b3830]/30"
          r={2}
          seed={`label-${book.name}`}
          amp={1.1}
          strokeWidth={1}
          laps={1}
        >
          <div
            className={`bg-[#f4efe3] shadow-[0_2px_6px_rgba(0,0,0,0.22)] ${
              compact ? 'px-1.5 py-1' : 'px-3 py-2'
            }`}
            data-testid="diary-book-label"
          >
            <div
              className={`truncate font-medium leading-tight text-[#3b3830] ${
                compact ? 'text-[10px]' : 'text-[19px]'
              }`}
              style={{ fontFamily: HAND_FONT }}
            >
              {book.name}
            </div>
            {!compact && book.name.trim() !== BOOK_KIND_LABEL[book.kind] && (
              <div className="mt-0.5 truncate text-[9px] tracking-[0.14em] text-[#3b3830]/55">
                {BOOK_KIND_LABEL[book.kind]}
              </div>
            )}
          </div>
        </InkBorder>
        {meta && (
          <div className="mt-1.5 truncate text-[10px] tracking-wide text-white/60">{meta}</div>
        )}
      </div>
    </div>
  );
}

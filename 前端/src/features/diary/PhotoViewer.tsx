import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  /** 这一条时刻的全部照片 */
  images: string[];
  /** 从第几张开始看 */
  start?: number;
  /** 底部小字（时间 / 标签） */
  caption?: string;
  onClose: () => void;
}

/**
 * 点开看大图（2026-11-15）：
 *
 * 手账里贴的照片都很小，看不清就得能点开。
 * 整屏**纯黑不透明**（不留半透明遮罩），左右箭头 / 键盘 ← → 切这一条的其它张，
 * Esc 或点顶部 × 关掉。Esc 挂在 window 的 capture 阶段 —— 免得被下层抽屉先吃掉。
 */
export function PhotoViewer({ images, start = 0, caption, onClose }: Props) {
  const [at, setAt] = useState(Math.min(Math.max(0, start), Math.max(0, images.length - 1)));
  const many = images.length > 1;

  const prev = useCallback(() => setAt((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setAt((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && many) {
        e.stopPropagation();
        prev();
      } else if (e.key === 'ArrowRight' && many) {
        e.stopPropagation();
        next();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [many, next, onClose, prev]);

  const src = images[at];
  if (!src) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1600] flex flex-col bg-black" data-testid="diary-photo-viewer">
      <div className="flex shrink-0 items-center justify-between px-2 py-2">
        <span className="pl-2 text-[11px] tabular-nums text-white/45">
          {many ? `${at + 1} / ${images.length}` : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭大图"
          data-testid="diary-photo-viewer-close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 active:bg-white/10"
        >
          <X className="h-[19px] w-[19px]" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
        />
        {many && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="上一张"
              data-testid="diary-photo-viewer-prev"
              className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="下一张"
              data-testid="diary-photo-viewer-next"
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/80 active:bg-white/20"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      <div className="shrink-0 px-5 pb-8 pt-3 text-center">
        {caption && <p className="text-[11px] leading-4 text-white/40">{caption}</p>}
      </div>
    </div>,
    document.body,
  );
}

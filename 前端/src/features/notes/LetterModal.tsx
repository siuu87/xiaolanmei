import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { NOTE_AUTHOR, formatNoteDate, type InspirationNote } from './notesData';

/**
 * 信件弹窗：点信箱里的信展开成一整张信纸。
 * 原来是便利贴（奶油黄 + 顶部胶带 + 歪着摆），现在按「信件」统一成
 * 米白信纸 + 顶部信封封盖 + 火漆印，摆正不再倾斜。点外部关闭。
 *
 * 必须用 portal 挂到 body：抽屉面板有 `backdrop-blur`，而 backdrop-filter
 * 会让元素成为 position:fixed 的包含块——弹窗不挂出去就会被锁在抽屉内部、
 * 还被滚动容器裁掉，且盖不住抽屉本身。层级给 z-[1400]（抽屉是 1200）。
 */
export function LetterModal({
  note,
  onClose,
}: {
  note: InspirationNote | null;
  onClose: () => void;
}) {
  return createPortal(
    <AnimatePresence>
      {note && (
        <motion.div
          className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            data-testid="letter-modal"
            className="relative w-full max-w-xs overflow-hidden rounded-md bg-gradient-to-b from-[#f7f1e6] to-[#ece2d0] px-6 pb-5 pt-12 text-[#4a4034] shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
          >
            {/* 信封封盖 */}
            <svg
              viewBox="0 0 100 34"
              preserveAspectRatio="none"
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-11 w-full"
            >
              <path d="M0 0 H100 L50 34 Z" fill="#e0d4bf" />
              <path d="M0 0 H100 L50 34 Z" fill="none" stroke="#cdbfa6" strokeWidth="0.7" />
            </svg>
            {/* 火漆印 */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-9 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-[#a8443c] text-[11px] shadow-sm"
            >
              🫐
            </span>

            <p className="text-[15px] leading-7">{note.content}</p>
            <div className="mt-5 flex flex-col items-end gap-0.5">
              <span className="text-[11px] text-[#8a7f6d]">{formatNoteDate(note.createdAt)}</span>
              <span className="text-[11px] text-[#6f6555]">{NOTE_AUTHOR}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

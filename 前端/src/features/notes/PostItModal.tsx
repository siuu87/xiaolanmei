import { AnimatePresence, motion } from 'framer-motion';
import { NOTE_AUTHOR, formatNoteDate, type InspirationNote } from './notesData';

/** 便利贴弹窗：奶油黄纸面 + 顶部胶带 + 轻微倾斜，点外部关闭 */
export function PostItModal({
  note,
  onClose,
}: {
  note: InspirationNote | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {note && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 16, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: -2 }}
            exit={{ scale: 0.8, opacity: 0, y: 16, rotate: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xs rounded-md bg-[#fef9c3] p-6 pb-5 text-slate-800 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
          >
            {/* 顶部胶带 */}
            <div className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-2 rounded-sm bg-white/50 shadow-sm backdrop-blur-[2px]" />
            <p className="text-base leading-7">{note.content}</p>
            <div className="mt-5 flex flex-col items-end gap-0.5">
              <span className="text-[11px] text-slate-500/80">
                {formatNoteDate(note.createdAt)}
              </span>
              <span className="text-[11px] text-slate-500">{NOTE_AUTHOR}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

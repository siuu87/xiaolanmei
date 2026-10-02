import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate } from './notesData';
import { PostItModal } from './PostItModal';

const SWIPE_THRESHOLD = 70;

/** 滑动切换的方向变体：enter/exit 用同一 direction 推算出相反位移 */
const variants = {
  enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -60, opacity: 0 }),
};

/**
 * 蓝莓信箱卡片（独立组件，不依赖首页布局）。
 * - 每日首次打开自动生成一条（幂等、静默）；
 * - 多张便签左右滑动或点两侧箭头切换浏览；
 * - 点便签 → 居中放大成便利贴；点头部「全部」→ 全部便签页。
 */
export function InspirationNoteCard() {
  const navigate = useNavigate();
  const notes = useNotesStore((s) => s.notes);
  const generateToday = useNotesStore((s) => s.generateToday);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 每日首次打开触发（store 内幂等，不会重复生成）
  useEffect(() => {
    generateToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = notes.length;
  const clamped = count ? Math.min(index, count - 1) : 0;
  const note = count ? notes[clamped] : null;

  const paginate = (dir: 1 | -1) => {
    if (count <= 1) return;
    setDirection(dir);
    setIndex((i) => (i + dir + count) % count);
  };

  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) paginate(1);
    else if (info.offset.x > SWIPE_THRESHOLD) paginate(-1);
  };

  return (
    <div className="glass relative z-10 p-2.5">
      {/* 头部：标题 + 全部入口（点击进全部便签页） */}
      <button
        type="button"
        onClick={() => navigate('/notes')}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="font-serif text-xs text-muted-foreground">蓝莓信箱</h2>
        <span className="flex items-center gap-0.5 text-xs text-primary transition hover:opacity-80">
          全部
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* 便签 + 两侧切换箭头（整体缩小，去掉背后堆叠） */}
      <div className="relative mt-4 flex items-center gap-2">
        {count > 1 && (
          <button
            type="button"
            onClick={() => paginate(-1)}
            aria-label="上一张"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div className="relative flex-1">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            {note ? (
              <motion.button
                key={note.id}
                type="button"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 320, damping: 30 },
                  opacity: { duration: 0.16 },
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={onDragEnd}
                onClick={() => setPreviewOpen(true)}
                className="relative flex min-h-[110px] w-full flex-col justify-between rounded-md bg-[#fef9c3] p-3 text-left text-slate-800 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
              >
                <p className="line-clamp-3 text-sm leading-6">{note.content}</p>
                <div className="mt-2 flex items-baseline justify-end gap-2">
                  <span className="text-[10px] text-slate-500/80">
                    {formatNoteDate(note.createdAt)}
                  </span>
                  <span className="text-[10px] text-slate-500">{NOTE_AUTHOR}</span>
                </div>
              </motion.button>
            ) : (
              <div className="flex h-[110px] items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-muted-foreground/50">
                生成中…
              </div>
            )}
          </AnimatePresence>
        </div>

        {count > 1 && (
          <button
            type="button"
            onClick={() => paginate(1)}
            aria-label="下一张"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 页码指示 */}
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1">
          {notes.map((n, i) => (
            <span
              key={n.id}
              className={cn(
                'h-1 rounded-full transition-all',
                i === clamped ? 'w-3 bg-primary' : 'w-1 bg-muted-foreground/30',
              )}
            />
          ))}
        </div>
      )}

      <PostItModal note={previewOpen ? note : null} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}

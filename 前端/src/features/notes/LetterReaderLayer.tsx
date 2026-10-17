import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate, normalizeLetterTheme } from './notesData';
import { EnvelopeFlap, letterParts } from './LetterArt';

/**
 * 一封来信的独立页面：叠在侧边栏（抽屉）之上，居中，点空白处收起。
 *
 * - **为什么是 portal**：抽屉面板有 `backdrop-blur`，而 backdrop-filter 会让元素
 *   成为 position:fixed 的包含块——不挂到 body 上就会被锁在抽屉里、被滚动容器裁掉、
 *   还盖不住抽屉。层级 z-[1400]（抽屉 1200 / 外观浮层 1300）。
 * - **展开动画**：信纸从信封口「抽出来」——origin 落在底部，scaleY 0.03 → 1
 *   配合向上位移，终态是信纸居中、信封在背后露出一截（跟全部页的已读态同一套视觉）。
 * - **信封主题**：信封 / 信纸 / 火漆 / 墨色整套按 `note.letterTheme` 换，
 *   主题配色集中在 `LetterArt.tsx` 的 `LETTER_THEME_PARTS` 一张表里。
 */
export function LetterReaderLayer({ id, onClose }: { id: string; onClose: () => void }) {
  const notes = useNotesStore((s) => s.notes);
  const loaded = useNotesStore((s) => s.loaded);
  const load = useNotesStore((s) => s.load);
  const markRead = useNotesStore((s) => s.markRead);

  // 直达（比如刷新在 /letter/xxx）时先把信拉下来，否则会误判成「信不存在」
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // 打开即已读
  useEffect(() => {
    if (id) markRead(id);
  }, [id, markRead]);

  const note = notes.find((n) => n.id === id) ?? null;
  // 信还没取到时也要有套配色（空态信纸按 default 画），取到后按它自己的主题渲染
  const theme = normalizeLetterTheme(note?.letterTheme);
  const parts = letterParts(theme);

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center p-6"
      data-testid="letter-page"
      data-letter-theme={theme}
    >
      {/* 空白遮罩：点它 = 收起返回 */}
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        data-testid="letter-page-mask"
      />

      {/* 信封 + 信纸 */}
      <div className="relative w-full max-w-[330px]">
        {/* 背后的信封：比信纸宽一点、往下沉一点，只露出一截 */}
        <motion.div
          className={cn(
            'absolute -inset-x-3 bottom-[-16px] h-[96px] overflow-hidden rounded-[4px]',
            parts.envelope,
            'shadow-[0_12px_30px_rgba(0,0,0,0.5)]',
          )}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2 }}
          data-testid="letter-page-envelope"
        >
          <EnvelopeFlap theme={theme} sealClass="h-6 w-6 text-[11px]" />
        </motion.div>

        {/* 信纸：从信封口抽出来 */}
        {note ? (
          <motion.div
            data-testid="letter-paper"
            initial={{ scaleY: 0.03, y: 58, opacity: 0 }}
            animate={{ scaleY: 1, y: 0, opacity: 1 }}
            exit={{ scaleY: 0.03, y: 58, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 190, damping: 26, mass: 0.9 }}
            style={{ transformOrigin: 'bottom center' }}
            className={cn(
              'relative z-10 max-h-[60vh] overflow-y-auto rounded-[4px] px-5 py-6',
              'shadow-[0_16px_44px_rgba(0,0,0,0.5)]',
              parts.paper,
              parts.ink,
            )}
          >
            <p className="whitespace-pre-wrap text-[14px] leading-7">{note.content}</p>
            <div className="mt-6 flex flex-col items-end gap-0.5">
              <span className={cn('text-[11px]', parts.meta)}>
                {formatNoteDate(note.createdAt)}
              </span>
              <span className={cn('text-[11px] opacity-80', parts.meta)}>{NOTE_AUTHOR}</span>
            </div>
          </motion.div>
        ) : (
          <div
            data-testid="letter-paper"
            className={cn(
              'relative z-10 flex h-32 items-center justify-center rounded-[4px] px-5',
              'text-[12px] shadow-[0_16px_44px_rgba(0,0,0,0.5)]',
              parts.paper,
              parts.meta,
            )}
          >
            {loaded ? '这封信找不到了' : '取信中…'}
          </div>
        )}
      </div>

      <span className="pointer-events-none absolute bottom-6 left-0 right-0 text-center text-[10px] text-white/40">
        轻点空白处收起
      </span>
    </div>,
    document.body,
  );
}

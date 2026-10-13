import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate, type InspirationNote } from './notesData';
import { LetterModal } from './LetterModal';

/** 全部来信历史（独立页，2 列信封墙；与抽屉里的信箱卡片同一套信件视觉） */
export function NotesPage() {
  const navigate = useNavigate();
  const notes = useNotesStore((s) => s.notes);
  const generateToday = useNotesStore((s) => s.generateToday);
  const [selected, setSelected] = useState<InspirationNote | null>(null);

  useEffect(() => {
    generateToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-serif text-xs text-muted-foreground">MAILBOX · 蓝莓信箱</h1>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {notes.length === 0 && (
          <div className="col-span-2 py-10 text-center text-xs text-muted-foreground/60">
            还没有来信，稍后再来看看吧
          </div>
        )}

        {notes.map((n, i) => (
          <motion.button
            key={n.id}
            type="button"
            onClick={() => setSelected(n)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.24) }}
            data-testid="notes-page-letter"
            className="relative flex min-h-[128px] flex-col justify-between overflow-hidden rounded-md bg-gradient-to-b from-[#f7f1e6] to-[#ebe1cf] px-3.5 pb-3 pt-7 text-left text-[#4a4034] shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
          >
            {/* 信封封盖：顶部三角 */}
            <svg
              viewBox="0 0 100 26"
              preserveAspectRatio="none"
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-7 w-full"
            >
              <path d="M0 0 H100 L50 26 Z" fill="#e0d4bf" />
              <path d="M0 0 H100 L50 26 Z" fill="none" stroke="#cdbfa6" strokeWidth="0.8" />
            </svg>
            {/* 火漆印 */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-5 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-[#a8443c] text-[8px] shadow-sm"
            >
              🫐
            </span>

            <p className="line-clamp-4 text-[11px] leading-[17px]">{n.content}</p>
            <div className="mt-2 flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-[#8a7f6d]">{formatNoteDate(n.createdAt)}</span>
              <span className="text-[9px] text-[#6f6555]">{NOTE_AUTHOR}</span>
            </div>
          </motion.button>
        ))}
      </div>

      <LetterModal note={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

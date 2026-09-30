import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate, type InspirationNote } from './notesData';
import { PostItModal } from './PostItModal';

/** 全部灵感便签历史（独立页，2×2 便利贴墙） */
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
            initial={{ opacity: 0, y: 8, rotate: i % 2 === 0 ? -2 : 2 }}
            animate={{ opacity: 1, y: 0, rotate: i % 2 === 0 ? -1 : 1 }}
            transition={{ delay: Math.min(i * 0.03, 0.24) }}
            className="relative flex min-h-[128px] flex-col justify-between rounded-md bg-[#fef9c3] p-3.5 text-left text-slate-800 shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
          >
            <p className="line-clamp-4 text-sm leading-6">{n.content}</p>
            <div className="mt-2 flex items-baseline justify-end gap-1.5">
              <span className="text-[10px] text-slate-500/70">{formatNoteDate(n.createdAt)}</span>
              <span className="text-[10px] text-slate-500">{NOTE_AUTHOR}</span>
            </div>
          </motion.button>
        ))}
      </div>

      <PostItModal note={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

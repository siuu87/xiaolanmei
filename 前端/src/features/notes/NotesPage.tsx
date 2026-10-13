import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { LetterEnvelope, LetterOpenedMini } from './LetterArt';

/**
 * 全部来信历史（独立页，单列更像一摞信）。
 * - 没拆过的 → 压扁的朴素信封；
 * - 读过的 → 展开的信纸 + 背后露出一截的信封（跟阅读页同一套视觉）；
 * - 点任意一封 → 进它自己的阅读页 `/letter/:id`。
 */
export function NotesPage() {
  const navigate = useNavigate();
  const notes = useNotesStore((s) => s.notes);
  const loaded = useNotesStore((s) => s.loaded);
  const readIds = useNotesStore((s) => s.readIds);
  const load = useNotesStore((s) => s.load);
  const generateToday = useNotesStore((s) => s.generateToday);

  useEffect(() => {
    if (!loaded) void load();
    generateToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (id: string) => navigate(`/letter/${id}`);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-6">
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

      <div className="mt-4 flex flex-col gap-2.5">
        {notes.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground/60">
            还没有来信，稍后再来看看吧
          </div>
        )}

        {notes.map((n, i) => {
          const read = readIds.includes(n.id);
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.24) }}
            >
              {read ? (
                <LetterOpenedMini note={n} onClick={() => open(n.id)} />
              ) : (
                <LetterEnvelope
                  note={n}
                  onClick={() => open(n.id)}
                  className="h-11"
                  testId="notes-page-letter"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

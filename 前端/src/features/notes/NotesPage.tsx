import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { FolderCardList } from './LetterFolder';

/**
 * 全部来信（独立页）：同样是按月份归档的堆叠信件文件夹，只是不限制数量。
 * 点文件夹展开 → 左右滑动切换信件 → 点单张放大看全文。
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

      <div className="mt-4">
        <FolderCardList
          notes={notes}
          readIds={readIds}
          onOpen={(id) => navigate(`/letter/${id}`)}
          maxSlips={30}
        />
      </div>
    </div>
  );
}

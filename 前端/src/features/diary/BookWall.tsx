import { useState } from 'react';
import { Plus, Pencil, Trash2, BookText, Users2, User2 } from 'lucide-react';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { BOOK_KIND_LABEL, KIND_DEFAULT_COVER, COVER_PALETTE } from './diaryData';

interface Props {
  books: DiaryBook[];
  entries: DiaryEntry[];
  onOpen: (book: DiaryBook) => void;
  onAdd: (b: Omit<DiaryBook, 'id' | 'sortOrder'>) => void;
  onPatch: (id: string, patch: Partial<Pick<DiaryBook, 'name' | 'kind' | 'cover'>>) => void;
  onRemove: (id: string) => void;
}

/** kind → 图标 */
function kindIcon(kind: DiaryBook['kind']) {
  if (kind === 'couple') return Users2;
  if (kind === 'partner') return User2;
  return BookText;
}

/** 一本书的日记页数 */
function countOf(entries: DiaryEntry[], bookId: string): number {
  return entries.filter((e) => (e.bookId ?? 'book-me') === bookId).length;
}

export function BookWall({ books, entries, onOpen, onAdd, onPatch, onRemove }: Props) {
  const [editing, setEditing] = useState<DiaryBook | 'new' | null>(null);

  return (
    <div className="space-y-6">
      {/* 书脊行：平铺的日记本封面 */}
      <div className="flex flex-wrap justify-center gap-5">
        {books.map((b) => {
          const Icon = kindIcon(b.kind);
          return (
            <div key={b.id} className="group relative flex w-[140px] flex-col items-center">
              {/* 封面（点封面打开本子） */}
              <button
                type="button"
                onClick={() => onOpen(b)}
                aria-label={`打开 ${b.name}`}
                className="paper-card relative block h-[200px] w-[130px] overflow-hidden rounded-md text-left shadow-[0_14px_30px_-18px_rgba(0,0,0,0.45)] transition-transform duration-300 hover:-translate-y-1.5 hover:shadow-[0_22px_40px_-20px_rgba(0,0,0,0.5)]"
                style={{ background: b.cover }}
              >
                {/* 封面纸纹 */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 8px)',
                  }}
                />
                {/* 书脊暗边 */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-2"
                  style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.28), transparent)' }}
                />
                {/* 书顶高光 */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-3"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.35), transparent)' }}
                />
                {/* 封面内容 */}
                <div className="relative flex h-full flex-col justify-between p-4">
                  <Icon className="h-7 w-7 text-white/80" />
                  <div>
                    <div className="font-serif text-lg font-semibold leading-tight text-white drop-shadow">
                      {b.name}
                    </div>
                    <div className="mt-1 text-[11px] text-white/70">
                      {BOOK_KIND_LABEL[b.kind]} · {countOf(entries, b.id)} 页
                    </div>
                  </div>
                </div>
              </button>
              {/* 悬浮操作：编辑 */}
              <button
                type="button"
                onClick={() => setEditing(b)}
                aria-label={`编辑 ${b.name}`}
                className="-mt-2 mb-1 flex h-7 w-7 items-center justify-center rounded-full border border-page-line bg-page-bg text-muted-foreground opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        {/* 新建一本 */}
        <button
          type="button"
          onClick={() => setEditing('new')}
          aria-label="新建日记本"
          className="paper-card flex h-[200px] w-[130px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-page-line text-muted-foreground transition hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-7 w-7" />
          <span className="text-sm">新建</span>
        </button>
      </div>

      {editing && (
        <BookSheet
          book={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            if (editing === 'new') onAdd(patch);
            else onPatch(editing.id, patch);
            setEditing(null);
          }}
          onDelete={
            editing !== 'new'
              ? () => {
                  onRemove(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface SheetProps {
  book: DiaryBook | null; // null = 新建
  onClose: () => void;
  onSave: (patch: { name: string; kind: DiaryBook['kind']; cover: string }) => void;
  onDelete?: () => void;
}

/** 新建 / 编辑本子的弹层：名字 + 类型 + 封面色 */
function BookSheet({ book, onClose, onSave, onDelete }: SheetProps) {
  const [name, setName] = useState(book?.name ?? '');
  const [kind, setKind] = useState<DiaryBook['kind']>(book?.kind ?? 'me');
  const [cover, setCover] = useState(book?.cover ?? KIND_DEFAULT_COVER[kind]);

  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave({ name: n, kind, cover });
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-scrim p-2 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-t-2xl border border-border bg-page-bg shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 预览封面 */}
        <div
          className="mx-4 mt-4 h-28 rounded-lg shadow-inner"
          style={{ background: cover }}
        >
          <div className="flex h-full flex-col justify-between p-4">
            <span className="text-2xl font-semibold text-white drop-shadow">
              {name.trim() || '日记本'}
            </span>
            <span className="text-xs text-white/70">{BOOK_KIND_LABEL[kind]}</span>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* 名字 */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">名字</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给这本日记起个名字"
              maxLength={20}
              className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none focus:bg-muted/80"
            />
          </div>
          {/* 类型 */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">类型</label>
            <div className="flex gap-2">
              {(['me', 'partner', 'couple'] as const).map((k) => {
                const Icon = kindIcon(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setCover((c) => (book ? c : KIND_DEFAULT_COVER[k]));
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition ${
                      kind === k
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {BOOK_KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </div>
          {/* 封面色 */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">封面颜色</label>
            <div className="flex flex-wrap gap-2">
              {COVER_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCover(c)}
                  aria-label={`封面色 ${c}`}
                  className={`h-8 w-8 rounded-full transition ${
                    cover === c ? 'ring-2 ring-offset-2 ring-offset-page-bg ring-foreground' : 'hover:scale-110'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 操作 */}
        <div className="flex gap-2 border-t border-border/60 px-4 py-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-rose-500 transition hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

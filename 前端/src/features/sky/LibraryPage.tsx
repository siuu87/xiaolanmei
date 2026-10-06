import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock,
  Library,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookStore, type Book } from './bookStore';
import { BookDetailModal } from './BookDetailModal';
import { AiImportDialog } from './AiImportDialog';
import { aiSummarizeToc } from './aiImport';

const PALETTE = [
  '#9f3b3b', '#2f5d50', '#2f3e63', '#7a2e3a',
  '#6b4a2f', '#3f6f6b', '#5b3a6e', '#3e5a7a',
];

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-white/30';

const GOAL_KEY = 'blueberry.reading.goal';

interface EditorState {
  id: string | null;
  title: string;
  author: string;
  paletteIdx: number;
  cover: string;
  desc: string;
  content: string;
  toc: string[];
  fileName: string;
}

const EMPTY: EditorState = { id: null, title: '', author: '', paletteIdx: 0, cover: '', desc: '', content: '', toc: [], fileName: '' };

const INSIGHT = { text: '我们读书，而后知道自己并不孤单。', author: '威廉·萨默塞特·毛姆' };

type View = 'home' | 'shelf' | 'reading';

/** 环形进度（本周目标进度） */
function Ring({ value, display, sub, label, size = 72, stroke = 6 }: { value: number; display: string; sub: string; label: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2A2A" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#C9A96A"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold text-[#E0E0E0]">{display}</span>
          <span className="text-[10px] text-[#8A8A8A]">{sub}</span>
        </div>
      </div>
      <span className="text-[11px] text-[#8A8A8A]">{label}</span>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, onClick }: { icon: LucideIcon; value: string; label: string; onClick?: () => void }) {
  const cls = 'rounded-2xl bg-[#1E1E1E] p-4 text-center';
  const inner = (
    <>
      <Icon className="mx-auto h-4 w-4 text-[#C9A96A]" />
      <p className="mt-2 text-xl font-semibold text-[#E0E0E0]">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#8A8A8A]">{label}</p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'transition hover:bg-[#262626]')}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** 平铺封面：一本书的「封面」卡片（有图片用图片，否则用色块） */
function FlatCover({ book, onOpen, onEdit, onDelete }: { book: Book; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-lg text-left shadow-[0_10px_24px_rgba(0,0,0,0.5)] transition-transform duration-200 hover:-translate-y-1"
        style={{ background: book.cover ? undefined : `linear-gradient(140deg, ${book.color}, ${book.color} 62%, rgba(0,0,0,0.35))` }}
      >
        {book.cover ? (
          <img src={book.cover} alt={book.title} className="aspect-[3/4] w-full object-cover" />
        ) : (
          <div className="flex aspect-[3/4] flex-col justify-between p-3">
            <span className="text-[10px] font-medium tracking-wider text-white/70">{book.author}</span>
            <span className="text-sm font-bold leading-snug text-[#f6efe6]">{book.title}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-black/30">
              <span className="block h-full bg-emerald-400/90" style={{ width: `${Math.round(book.progress * 100)}%` }} />
            </span>
          </div>
        )}
      </button>

      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button type="button" onClick={onEdit} aria-label="编辑" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/45 text-white/90 hover:bg-black/70">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} aria-label="删除" className="flex h-6 w-6 items-center justify-center rounded-md bg-black/45 text-white/90 hover:bg-rose-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** READ · 阅读仪表盘：每日一句 + 在读状态 + 统计 + 时间线；藏书/在读可点入对应视图 */
export function LibraryPage() {
  const navigate = useNavigate();
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const addBook = useBookStore((s) => s.addBook);
  const updateBook = useBookStore((s) => s.updateBook);
  const removeBook = useBookStore((s) => s.removeBook);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [view, setView] = useState<View>('home');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [tocBusy, setTocBusy] = useState(false);
  const [tocError, setTocError] = useState('');

  // 本周目标（分钟，可编辑，localStorage 持久化）
  const [goal, setGoal] = useState<number>(() => {
    const v = Number(localStorage.getItem(GOAL_KEY));
    return Number.isFinite(v) && v > 0 ? v : 90;
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState<number>(goal);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detail = books.find((b) => b.id === detailId) ?? null;

  const set = (patch: Partial<EditorState>) => setEditor((f) => (f ? { ...f, ...patch } : f));

  const openNew = () => setEditor(EMPTY);
  const openEdit = (b: Book) =>
    setEditor({
      id: b.id,
      title: b.title,
      author: b.author,
      paletteIdx: Math.max(0, PALETTE.indexOf(b.color)),
      cover: b.cover ?? '',
      desc: b.desc,
      content: b.content,
      toc: b.toc,
      fileName: '',
    });

  const onCoverFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ cover: String(reader.result ?? '') });
    reader.readAsDataURL(file);
  };

  const onContentFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ content: String(reader.result ?? ''), fileName: file.name });
    reader.readAsText(file);
  };

  const genToc = async () => {
    if (!editor || !editor.content.trim()) return;
    setTocBusy(true);
    setTocError('');
    try {
      const toc = await aiSummarizeToc(editor.content);
      set({ toc });
    } catch (e) {
      setTocError((e as Error).message || '目录生成失败');
    } finally {
      setTocBusy(false);
    }
  };

  const save = () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) return;
    const patch = {
      title,
      author: editor.author.trim() || '佚名',
      cover: editor.cover.trim() || undefined,
      desc: editor.desc.trim(),
      content: editor.content,
      toc: editor.toc,
    };
    if (editor.id) {
      updateBook(editor.id, { ...patch, color: PALETTE[editor.paletteIdx] });
    } else {
      addBook({ title, author: editor.author, paletteIdx: editor.paletteIdx, cover: patch.cover, desc: patch.desc, content: patch.content, toc: patch.toc });
    }
    setEditor(null);
  };

  const onAiResult = (data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const title = String(d.title ?? '').trim();
    if (!title) {
      setAiOpen(false);
      return;
    }
    const toc = Array.isArray(d.toc) ? d.toc.map((x: unknown) => String(x ?? '').trim()).filter(Boolean) : [];
    addBook({
      title,
      author: String(d.author ?? '').trim() || '佚名',
      paletteIdx: Math.floor(Math.random() * PALETTE.length),
      cover: String(d.cover ?? '').trim() || undefined,
      desc: String(d.desc ?? '').trim(),
      content: String(d.content ?? ''),
      toc,
    });
    setAiOpen(false);
  };

  const aiSystem =
    '你是一个读书整理助手。根据用户提供的信息（书名/作者/链接/描述），整理出一本书的结构化数据，只输出一个 JSON 对象，不要任何其它文字或 markdown。字段：title(书名)、author(作者)、cover(封面图片链接，可为空字符串)、desc(一句话详情)、toc(目录章节标题数组)、content(正文内容，用 \\n\\n 分段；若没有正文，给一段简短原创试读)。';

  const current = useMemo(() => {
    const active = books.find((b) => b.progress > 0 && b.progress < 1);
    return active ?? books[0] ?? null;
  }, [books]);

  const progressPct = Math.round((current?.progress ?? 0) * 100);
  const todayMin = Math.round((current?.progress ?? 0) * 90);
  const ringPct = Math.min(100, Math.round((todayMin / goal) * 100));
  const activeCount = books.filter((b) => b.progress > 0).length;
  const inProgress = books.filter((b) => b.progress > 0 && b.progress < 1);

  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const week = useMemo(() => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const k = Math.min(5, activeCount);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      return { label: days[d.getDay()], today: i === 6, active: i === 6 || i >= 6 - k };
    });
  }, [activeCount]);

  const commitGoal = () => {
    const v = Math.round(goalDraft);
    if (Number.isFinite(v) && v > 0) {
      setGoal(v);
      localStorage.setItem(GOAL_KEY, String(v));
    }
    setEditingGoal(false);
  };

  const title = view === 'home' ? 'READ' : view === 'shelf' ? '书架' : '正在读';
  const back = () => (view === 'home' ? navigate('/sky') : setView('home'));

  return (
    <div className="relative min-h-full bg-[#121212] pb-16 text-[#E0E0E0]">
      {/* 顶部 */}
      <header className="flex items-center justify-between px-5 pb-3 pt-6">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={back} aria-label="返回" className="text-[#8A8A8A] transition hover:text-[#E0E0E0]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-serif text-lg font-semibold tracking-wide text-[#E0E0E0]">{title}</h1>
        </div>
        {view === 'home' && <span className="text-sm text-[#8A8A8A]">{dateLabel}</span>}
        {view === 'shelf' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="flex h-8 items-center gap-1 rounded-full bg-[#C9A96A]/15 px-3 text-xs text-[#C9A96A] transition hover:bg-[#C9A96A]/25"
            >
              <Sparkles className="h-3.5 w-3.5" /> AI
            </button>
            <button
              type="button"
              onClick={openNew}
              aria-label="导入"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1E1E1E] text-[#E0E0E0] transition hover:bg-[#2A2A2A]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <div className="mx-auto w-full max-w-md">
        {view === 'home' && (
          <div className="space-y-4 px-5">
            {/* 每日一句 */}
            <section className="rounded-2xl bg-[#1E1E1E] p-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#C9A96A]">Daily Insight</p>
              <p className="mt-3 font-serif text-lg leading-relaxed text-[#E0E0E0]">“{INSIGHT.text}”</p>
              <p className="mt-2 text-xs text-[#8A8A8A]">— {INSIGHT.author}</p>
            </section>

            {/* 当前在读 */}
            <section className="rounded-2xl bg-[#1E1E1E] p-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#8A8A8A]">Current Reading</p>
              {current ? (
                <div className="mt-4">
                  <div className="flex items-center gap-4">
                    {current.cover ? (
                      <img src={current.cover} alt={current.title} className="h-28 w-20 shrink-0 rounded-md object-cover grayscale" />
                    ) : (
                      <div
                        className="flex h-28 w-20 shrink-0 flex-col justify-between rounded-md p-2 grayscale"
                        style={{ background: `linear-gradient(160deg, ${current.color}, ${current.color} 60%, rgba(0,0,0,0.5))` }}
                      >
                        <span className="text-[9px] text-white/60">{current.author}</span>
                        <span className="text-xs font-semibold leading-snug text-white/90">{current.title}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-serif text-lg font-semibold text-[#E0E0E0]">{current.title}</h2>
                      <p className="truncate text-sm text-[#8A8A8A]">{current.author}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2A2A2A]">
                        <div className="h-full rounded-full bg-[#C9A96A]" style={{ width: `${progressPct}%` }} />
                      </div>
                      <p className="mt-1.5 text-[11px] text-[#8A8A8A]">{progressPct}% 已读</p>
                      <button
                        type="button"
                        onClick={() => navigate(`/read/${current.id}`)}
                        className="mt-2 text-xs font-medium text-[#C9A96A] transition hover:text-[#E0C79A]"
                      >
                        继续阅读 →
                      </button>
                    </div>
                  </div>

                  {/* 本周目标环 + 可编辑目标 */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#2A2A2A] pt-4">
                    <Ring value={ringPct} display={String(todayMin)} sub="分钟" label="本周已读" />
                    <div className="text-right">
                      <p className="text-[11px] text-[#8A8A8A]">本周目标</p>
                      {editingGoal ? (
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            min={1}
                            value={Number.isFinite(goalDraft) ? goalDraft : ''}
                            onChange={(e) => setGoalDraft(Number(e.target.value))}
                            onKeyDown={(e) => e.key === 'Enter' && commitGoal()}
                            className="w-16 rounded bg-[#2A2A2A] px-2 py-1 text-right font-serif text-lg font-semibold text-[#E0E0E0] outline-none"
                            autoFocus
                          />
                          <button type="button" onClick={commitGoal} aria-label="保存目标" className="text-[#C9A96A]">
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setGoalDraft(goal);
                            setEditingGoal(true);
                          }}
                          className="group inline-flex items-center gap-1"
                        >
                          <p className="font-serif text-lg font-semibold text-[#E0E0E0]">{goal} 分钟</p>
                          <Pencil className="h-3 w-3 text-[#8A8A8A] transition group-hover:text-[#C9A96A]" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-[#1A1A1A] px-4 py-8 text-center">
                  <BookOpen className="mx-auto h-6 w-6 text-[#8A8A8A]" />
                  <p className="mt-2 text-sm text-[#8A8A8A]">还没有在读的书</p>
                  <button type="button" onClick={() => setView('shelf')} className="mt-3 text-xs font-medium text-[#C9A96A]">
                    去书架看看 →
                  </button>
                </div>
              )}
            </section>

            {/* 统计 */}
            <section className="grid grid-cols-3 gap-3">
              <StatCard icon={Clock} value={String(todayMin)} label="今日分钟" />
              <StatCard icon={Library} value={String(books.length)} label="藏书" onClick={() => setView('shelf')} />
              <StatCard icon={BookOpen} value={String(activeCount)} label="在读" onClick={() => setView('reading')} />
            </section>

            {/* 阅读时间线 */}
            <section className="rounded-2xl bg-[#1E1E1E] p-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#8A8A8A]">Reading Timeline</p>
              <div className="mt-4 flex justify-between">
                {week.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <span
                      className={cn(
                        'h-3 w-3 rounded-full',
                        d.active ? 'bg-[#C9A96A] shadow-[0_0_10px_rgba(201,169,106,0.9)]' : 'bg-[#2A2A2A]',
                      )}
                    />
                    <span className={cn('text-[10px]', d.today ? 'font-medium text-[#C9A96A]' : 'text-[#8A8A8A]')}>{d.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === 'shelf' && (
          <div className="px-5">
            {books.length === 0 ? (
              <div className="rounded-2xl bg-[#1E1E1E] py-16 text-center text-sm text-[#8A8A8A]">书架上还没有书，点右上角 + 放上第一本吧。</div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {books.map((b) => (
                  <FlatCover key={b.id} book={b} onOpen={() => setDetailId(b.id)} onEdit={() => openEdit(b)} onDelete={() => removeBook(b.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'reading' && (
          <div className="px-5">
            {inProgress.length === 0 ? (
              <div className="rounded-2xl bg-[#1E1E1E] py-16 text-center text-sm text-[#8A8A8A]">还没有在读的书</div>
            ) : (
              <div className="space-y-3">
                {inProgress.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => navigate(`/read/${b.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-[#1E1E1E] p-4 text-left transition hover:bg-[#262626]"
                  >
                    {b.cover ? (
                      <img src={b.cover} alt={b.title} className="h-16 w-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div
                        className="flex h-16 w-12 shrink-0 flex-col justify-between rounded-md p-1.5"
                        style={{ background: `linear-gradient(160deg, ${b.color}, ${b.color} 60%, rgba(0,0,0,0.5))` }}
                      >
                        <span className="text-[8px] text-white/50">{b.author}</span>
                        <span className="text-[9px] font-semibold leading-tight text-white/80">{b.title}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-sm font-semibold text-[#E0E0E0]">{b.title}</p>
                      <p className="truncate text-xs text-[#8A8A8A]">{b.author}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#2A2A2A]">
                        <div className="h-full rounded-full bg-[#C9A96A]" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-[#8A8A8A]">{Math.round(b.progress * 100)}% 已读</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {detail && <BookDetailModal book={detail} onClose={() => setDetailId(null)} />}

      {/* 导入 / 编辑弹窗 */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditor(null)}>
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[#1b1626] p-5 shadow-xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-100">{editor.id ? '编辑这本书' : '导入一本书'}</h3>
              <button type="button" onClick={() => setEditor(null)} aria-label="关闭" className="text-slate-400 hover:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="relative h-28 w-[72px] shrink-0 overflow-hidden rounded-md ring-1 ring-white/15"
                  title="点击导入封面图片"
                >
                  {editor.cover ? (
                    <img src={editor.cover} alt="封面" className="h-full w-full object-cover" />
                  ) : (
                    <div
                      className="flex h-full w-full flex-col items-center justify-center gap-1 text-center"
                      style={{ background: `linear-gradient(140deg, ${PALETTE[editor.paletteIdx]}, ${PALETTE[editor.paletteIdx]} 62%, rgba(0,0,0,0.35))` }}
                    >
                      <Upload className="h-4 w-4 text-white/70" />
                      <span className="px-1 text-[9px] text-white/70">导入封面</span>
                    </div>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[9px] text-white">换封面</span>
                </button>

                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">书名</label>
                    <input value={editor.title} onChange={(e) => set({ title: e.target.value })} placeholder="如 小王子" className={inputCls} autoFocus />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">作者</label>
                    <input value={editor.author} onChange={(e) => set({ author: e.target.value })} placeholder="如 圣埃克苏佩里" className={inputCls} />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">封面颜色（无图片时）</label>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set({ paletteIdx: i })}
                      aria-label={`颜色 ${i + 1}`}
                      className={cn('h-7 w-7 rounded-md transition', editor.paletteIdx === i && 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#1b1626]')}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">详情</label>
                <textarea value={editor.desc} onChange={(e) => set({ desc: e.target.value })} rows={2} placeholder="一句话介绍这本书…" className={cn(inputCls, 'resize-none')} />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">正文（导入文件即正文）</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-3 text-sm text-slate-300 transition hover:bg-white/10"
                >
                  <BookOpen className="h-4 w-4" /> {editor.fileName || '选择文本文件（.txt / .md）'}
                </button>
                {editor.content && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {editor.fileName || '已导入正文'} · {editor.content.length} 字
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs text-slate-400">目录（AI 总结，无需手写）</label>
                  <button
                    type="button"
                    onClick={genToc}
                    disabled={tocBusy || !editor.content.trim()}
                    className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-40"
                  >
                    {tocBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    AI 生成目录
                  </button>
                </div>
                {editor.toc.length > 0 ? (
                  <ol className="space-y-1 rounded-lg bg-white/5 px-3 py-2">
                    {editor.toc.map((t, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-sm text-slate-300">
                        <span className="text-xs text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                        {t}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-500">
                    <ListOrdered className="h-3.5 w-3.5" /> 导入正文后，点「AI 生成目录」自动总结
                  </p>
                )}
                {tocError && <p className="mt-1 text-[11px] text-rose-300">{tocError}</p>}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setEditor(null)} className="h-10 flex-1 rounded-xl bg-white/5 text-sm font-medium text-slate-300 transition hover:bg-white/10">
                取消
              </button>
              <button type="button" onClick={save} disabled={!editor.title.trim()} className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 导入 */}
      {aiOpen && (
        <AiImportDialog
          title="AI 导入书籍"
          placeholder="粘贴书名、作者，或一个书籍链接…"
          systemPrompt={aiSystem}
          onResult={onAiResult}
          onClose={() => setAiOpen(false)}
        />
      )}

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onCoverFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain"
        className="hidden"
        onChange={(e) => {
          onContentFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

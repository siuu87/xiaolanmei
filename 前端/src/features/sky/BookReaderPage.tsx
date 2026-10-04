import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ListOrdered,
  Highlighter,
  MessageSquareText,
  X,
  BookOpen,
  Trash2,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBackdrop } from './StarBackdrop';
import { useBookStore } from './bookStore';
import { useProfileStore } from '@/stores/profileStore';
import {
  getProgress,
  getAnnotations,
  createAnnotation,
  deleteAnnotation,
  createAnnotationNote,
  saveProgress,
  type AnnotationColor,
  type Reader,
  type ReadingAnnotation,
} from '@/lib/api/reading';

interface Sel {
  chapter: number;
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
}

const HIGHLIGHT_COLORS: Record<AnnotationColor, { cls: string; hex: string; label: string }> = {
  yellow: { cls: 'bg-yellow-200/70 dark:bg-yellow-500/25', hex: '#eab308', label: '柔黄' },
  green: { cls: 'bg-green-200/70 dark:bg-green-500/25', hex: '#22c55e', label: '青绿' },
  blue: { cls: 'bg-sky-200/70 dark:bg-sky-500/25', hex: '#38bdf8', label: '天蓝' },
  pink: { cls: 'bg-pink-200/70 dark:bg-pink-500/25', hex: '#ec4899', label: '樱粉' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

/** 把某段正文按标画区间切片（非重叠，按最后一条标画取样式） */
function segments(text: string, anns: ReadingAnnotation[]) {
  const pts = new Set<number>([0, text.length]);
  anns.forEach((a) => {
    pts.add(Math.min(Math.max(a.startOffset, 0), text.length));
    pts.add(Math.min(Math.max(a.endOffset, 0), text.length));
  });
  const sorted = [...pts].sort((a, b) => a - b);
  const out: { text: string; ann: ReadingAnnotation | null }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const cover = anns.filter((a) => a.startOffset <= s && a.endOffset >= e);
    out.push({ text: text.slice(s, e), ann: cover.length ? cover[cover.length - 1] : null });
  }
  return out;
}

/** 计算选区内文本相对某段落的字符区间 */
function getParagraphOffsets(para: HTMLElement, selection: Selection): Omit<Sel, 'x' | 'y'> | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!para.contains(range.commonAncestorContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(para);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = range.toString();
  if (!text.trim()) return null;
  return { chapter: Number(para.getAttribute('data-paragraph') ?? 0), start, end: start + text.length, text };
}

/** 一起读 · 阅读器：双人进度 + 衬线正文 + 长按/选中划线 + 双人留言气泡 */
export function BookReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);

  const myAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const myName = useProfileStore((s) => s.name) || '我';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';

  const book = books.find((b) => b.id === id);

  const [progress, setProgress] = useState<{ me: number; ta: number }>({ me: 0, ta: 0 });
  const [annotations, setAnnotations] = useState<ReadingAnnotation[]>([]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [menuColor, setMenuColor] = useState<AnnotationColor>('yellow');
  const [showToc, setShowToc] = useState(false);

  // 留纸条弹窗
  const [noteDlg, setNoteDlg] = useState<Sel | null>(null);
  const [noteAuthor, setNoteAuthor] = useState<Reader>('me');
  const [noteDraft, setNoteDraft] = useState('');

  // 批注留言 popover
  const [notesTarget, setNotesTarget] = useState<ReadingAnnotation | null>(null);
  const [quickAuthor, setQuickAuthor] = useState<Reader>('me');
  const [quickText, setQuickText] = useState('');

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [progs, anns] = await Promise.all([getProgress(id), getAnnotations(id)]);
      const me = progs.find((p) => p.reader === 'me');
      const ta = progs.find((p) => p.reader === 'partner');
      setProgress({ me: me?.percent ?? 0, ta: ta?.percent ?? 0 });
      setAnnotations(anns);
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const paragraphs = useMemo(
    () => (book?.content ?? '').split(/\n+/).map((p) => p.trim()).filter(Boolean),
    [book?.content],
  );

  // 自动滚动到上次位置
  useEffect(() => {
    if (!book || paragraphs.length === 0) return;
    const main = document.querySelector('main');
    if (!main || progress.me <= 0) return;
    const timer = setTimeout(() => {
      main.scrollTo({ top: (progress.me / 100) * main.scrollHeight, behavior: 'auto' });
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

  // 选中文本 → 悬浮菜单
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) return;
      const para = s.getRangeAt(0).startContainer.parentElement?.closest?.('[data-paragraph]') as HTMLElement | null;
      if (!para) return;
      const off = getParagraphOffsets(para, s);
      if (!off) return;
      const r = s.getRangeAt(0).getBoundingClientRect();
      setSel({ ...off, x: r.left + r.width / 2, y: r.top });
    };
    const onClear = () => {
      if (window.getSelection()?.isCollapsed) setSel(null);
    };
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('mouseup', onClear);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      document.removeEventListener('mouseup', onClear);
    };
  }, []);

  // 进度：监听 <main> 滚动，节流保存「我」的进度
  useEffect(() => {
    if (!book) return;
    const main = document.querySelector('main');
    if (!main) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      const max = main.scrollHeight - main.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((main.scrollTop / max) * 100))) : 0;
      setProgress((p) => ({ ...p, me: pct }));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const chapter = Math.min(paragraphs.length, Math.max(1, Math.floor((pct / 100) * paragraphs.length) + 1));
        void saveProgress({ bookId: book.id, reader: 'me', currentChapter: chapter, currentPosition: pct, percent: pct }).catch(() => {});
      }, 1200);
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      main.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [book, paragraphs.length]);

  if (!book) {
    return (
      <div className="relative min-h-full bg-night px-4 py-16 text-center text-slate-400">
        <StarBackdrop />
        加载中…
        <button type="button" onClick={() => navigate('/library')} className="mt-3 block text-primary hover:underline">返回书房</button>
      </div>
    );
  }

  const annsByChapter = (chapter: number) => annotations.filter((a) => a.chapter === chapter);

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  const doHighlight = async (color: AnnotationColor) => {
    if (!sel) return;
    try {
      const created = await createAnnotation({
        bookId: book.id,
        chapter: sel.chapter,
        startOffset: sel.start,
        endOffset: sel.end,
        selectedText: sel.text,
        color,
      });
      setAnnotations((a) => [...a, created]);
    } catch {
      /* ignore */
    }
    clearSelection();
  };

  const openNote = () => {
    if (!sel) return;
    setNoteAuthor('me');
    setNoteDraft('');
    setNoteDlg(sel);
  };

  const saveNote = async () => {
    if (!noteDlg) return;
    const content = noteDraft.trim();
    if (!content) {
      setNoteDlg(null);
      return;
    }
    try {
      // 先确保有一条划线，再把纸条挂上去
      const created = await createAnnotation({
        bookId: book.id,
        chapter: noteDlg.chapter,
        startOffset: noteDlg.start,
        endOffset: noteDlg.end,
        selectedText: noteDlg.text,
        color: menuColor,
      });
      const note = await createAnnotationNote(created.id, { author: noteAuthor, content });
      setAnnotations((a) => a.map((x) => (x.id === created.id ? { ...x, notes: [...x.notes, note] } : x)));
    } catch {
      /* ignore */
    }
    setNoteDlg(null);
    clearSelection();
  };

  const sendQuickNote = async () => {
    if (!notesTarget) return;
    const content = quickText.trim();
    if (!content) return;
    try {
      const note = await createAnnotationNote(notesTarget.id, { author: quickAuthor, content });
      setAnnotations((a) => a.map((x) => (x.id === notesTarget.id ? { ...x, notes: [...x.notes, note] } : x)));
      setNotesTarget((t) => (t ? { ...t, notes: [...t.notes, note] } : t));
      setQuickText('');
    } catch {
      /* ignore */
    }
  };

  const removeAnnotation = async () => {
    if (!notesTarget) return;
    try {
      await deleteAnnotation(notesTarget.id);
      setAnnotations((a) => a.filter((x) => x.id !== notesTarget.id));
    } catch {
      /* ignore */
    }
    setNotesTarget(null);
  };

  const jumpTo = (idx: number, total: number) => {
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: (idx / total) * main.scrollHeight, behavior: 'smooth' });
    setShowToc(false);
  };

  return (
    <div className="relative min-h-full bg-paper text-ink dark:bg-night dark:text-ink-night">
      <StarBackdrop />

      {/* 顶部：返回 + 书名 + 双人进度 */}
      <div className="sticky top-0 z-30 border-b border-black/10 bg-paper/95 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-night/95">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/library')}
            aria-label="返回"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink/60 transition hover:bg-black/5 dark:text-ink-night/60 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{book.title}</div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-ink/60 dark:text-ink-night/60">
              <span className="inline-flex items-center gap-1">
                <span>{myAvatar}</span> 我 <b className="text-sky-500">{progress.me}%</b>
              </span>
              <span className="inline-flex items-center gap-1">
                <span>{taAvatar}</span> TA <b className="text-pink-500">{progress.ta}%</b>
              </span>
            </div>
            <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="absolute left-0 top-0 h-full rounded-full bg-sky-400 transition-all" style={{ width: `${progress.me}%` }} />
              <div className="absolute left-0 top-0 h-full rounded-full bg-pink-400 opacity-70 transition-all" style={{ width: `${progress.ta}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowToc((v) => !v)}
            aria-label="目录"
            className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition', showToc ? 'bg-black/10 dark:bg-white/15' : 'text-ink/60 hover:bg-black/5 dark:text-ink-night/60 dark:hover:bg-white/10')}
          >
            <ListOrdered className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 目录抽屉 */}
      {showToc && (
        <div className="absolute inset-x-0 top-[60px] z-20 mx-auto w-full max-w-2xl px-4">
          <div className="rounded-2xl border border-black/10 bg-paper/95 p-3 shadow-xl backdrop-blur dark:border-white/10 dark:bg-night/95">
            <div className="flex items-center justify-between px-1 pb-1 text-xs font-medium text-ink/50 dark:text-ink-night/50">
              <span>目录</span>
              <button type="button" onClick={() => setShowToc(false)} className="hover:opacity-70"><X className="h-3.5 w-3.5" /></button>
            </div>
            <ol className="max-h-72 space-y-1 overflow-y-auto">
              {book.toc.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => jumpTo(i, Math.max(1, book.toc.length))}
                    className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <span className="text-[10px] opacity-50">{String(i + 1).padStart(2, '0')}</span>
                    {t}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* 正文 */}
      <div ref={contentRef} className="reading-body mx-auto w-full max-w-2xl px-5 pb-24 pt-6 text-[17px] leading-[1.9] tracking-wide">
        {book.desc && (
          <p className="mb-6 rounded-xl bg-black/[0.03] px-4 py-3 text-xs leading-6 text-ink/60 dark:bg-white/[0.04] dark:text-ink-night/60">{book.desc}</p>
        )}

        {paragraphs.length === 0 ? (
          <div className="py-16 text-center text-sm text-ink/50 dark:text-ink-night/50">
            <BookOpen className="mx-auto mb-2 h-6 w-6 opacity-40" />
            还没有正文，去「书房 · 管理」编辑这本书，粘贴文章即可阅读标画。
          </div>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} data-paragraph={i} className="mb-4 text-justify">
              {segments(p, annsByChapter(i)).map((seg, j) =>
                seg.ann ? (
                  <mark
                    key={j}
                    className={cn('relative rounded-[2px] text-inherit', HIGHLIGHT_COLORS[seg.ann.color].cls)}
                  >
                    {seg.text}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotesTarget(seg.ann!);
                      }}
                      className="absolute -right-1 top-0 h-1.5 w-1.5 cursor-pointer rounded-full"
                      style={{ backgroundColor: HIGHLIGHT_COLORS[seg.ann.color].hex }}
                    />
                    {seg.ann.notes.length > 0 && (
                      <span className="absolute -right-5 top-0 rounded-full bg-black/60 px-1 text-[9px] leading-4 text-white dark:bg-white/70 dark:text-black">
                        {seg.ann.notes.length}
                      </span>
                    )}
                  </mark>
                ) : (
                  <span key={j}>{seg.text}</span>
                ),
              )}
            </p>
          ))
        )}

        <p className="mt-8 text-center text-[11px] text-ink/40 dark:text-ink-night/40">
          长按 / 选中文字可划线 · 留言会同步给 TA
        </p>
      </div>

      {/* 悬浮菜单（划线 / 留纸条） */}
      {sel && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full"
          style={{ left: Math.min(Math.max(sel.x, 130), window.innerWidth - 130), top: Math.max(sel.y - 6, 8) }}
        >
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-popover px-1 py-1 text-popover-foreground shadow-lg">
            {(['yellow', 'green', 'blue', 'pink'] as AnnotationColor[]).map((c) => (
              <button
                key={c}
                type="button"
                title={HIGHLIGHT_COLORS[c].label}
                onClick={() => {
                  setMenuColor(c);
                  void doHighlight(c);
                }}
                className={cn('h-5 w-5 rounded-full transition', menuColor === c && 'ring-2 ring-offset-1 ring-offset-popover')}
                style={{ backgroundColor: HIGHLIGHT_COLORS[c].hex }}
              />
            ))}
            <span className="mx-0.5 h-5 w-px bg-border" />
            <button
              type="button"
              onClick={openNote}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:bg-accent"
            >
              <MessageSquareText className="h-4 w-4" /> 留纸条
            </button>
            <button type="button" onClick={clearSelection} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 留纸条弹窗 */}
      {noteDlg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setNoteDlg(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-popover p-5 text-popover-foreground shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">留张纸条</h3>
              <button type="button" onClick={() => setNoteDlg(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-3 line-clamp-2 rounded-xl bg-muted px-3 py-2.5 text-sm leading-6">「{noteDlg.text}」</p>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">署名</span>
              {([['me', `${myAvatar} ${myName}`], ['partner', `${taAvatar} TA`]] as [Reader, string][]).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNoteAuthor(v)}
                  className={cn('rounded-full px-3 py-1 text-xs transition', noteAuthor === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70 hover:bg-muted/80')}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              autoFocus
              placeholder="写下你的想法…"
              className="mt-3 w-full resize-none rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-ring"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setNoteDlg(null)} className="h-10 flex-1 rounded-xl bg-muted text-sm font-medium text-foreground/80 transition hover:bg-muted/80">取消</button>
              <button type="button" onClick={saveNote} disabled={!noteDraft.trim()} className="h-10 flex-[1.4] rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 批注留言 popover（双人气泡） */}
      {notesTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNotesTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-popover text-popover-foreground shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Highlighter className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="line-clamp-2 flex-1 text-sm">「{notesTarget.selectedText}」</p>
              <button
                type="button"
                onClick={removeAnnotation}
                aria-label="删除划线"
                className="shrink-0 text-muted-foreground transition hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-72 space-y-3 overflow-y-auto p-3">
              {notesTarget.notes.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">还没有留言，写下第一张纸条吧</p>
              )}
              {notesTarget.notes.map((n) => (
                <div key={n.id} className={cn('flex gap-2', n.author === 'me' ? 'flex-row' : 'flex-row-reverse')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                      n.author === 'me' ? 'rounded-tl-sm bg-muted' : 'rounded-tr-sm bg-primary text-primary-foreground',
                    )}
                  >
                    <div className="mb-0.5 text-[10px] opacity-70">{n.author === 'me' ? `${myAvatar} ${myName}` : `${taAvatar} TA`}</div>
                    {n.content}
                    <div className="mt-1 text-right text-[9px] opacity-50">{formatTime(n.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t p-2">
              <div className="flex shrink-0 gap-1">
                {([['me', myAvatar], ['partner', taAvatar]] as [Reader, string][]).map(([v, avatar]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setQuickAuthor(v)}
                    aria-label={v}
                    className={cn('flex h-7 w-7 items-center justify-center rounded-full text-sm transition', quickAuthor === v ? 'bg-primary/20 ring-1 ring-primary' : 'bg-muted hover:bg-muted/80')}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
              <input
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="说点什么…"
                className="h-9 min-w-0 flex-1 rounded-full bg-muted px-3 text-sm outline-none"
                onKeyDown={(e) => e.key === 'Enter' && sendQuickNote()}
              />
              <button type="button" onClick={sendQuickNote} disabled={!quickText.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

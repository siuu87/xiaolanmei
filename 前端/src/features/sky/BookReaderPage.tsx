import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ListOrdered,
  Highlighter,
  Underline,
  MessageCircle,
  X,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBackdrop } from './StarBackdrop';
import { useBookStore, type Annotation, type AnnotationKind } from './bookStore';
import { useProfileStore } from '@/stores/profileStore';

interface Sel {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
}

/** 计算选区内文本相对正文的字符区间 */
function getOffsets(container: HTMLElement, selection: Selection): Omit<Sel, 'x' | 'y'> | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = range.toString();
  if (!text.trim()) return null;
  return { start, end: start + text.length, text };
}

/** 把正文按标画区间切段（非重叠、按最后一条标画取样式） */
function segments(content: string, anns: Annotation[]) {
  const pts = new Set<number>([0, content.length]);
  anns.forEach((a) => {
    pts.add(a.start);
    pts.add(a.end);
  });
  const sorted = [...pts].sort((a, b) => a - b);
  const out: { text: string; ann: Annotation | null }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    if (e <= s) continue;
    const cover = anns.filter((a) => a.start <= s && a.end >= e);
    out.push({ text: content.slice(s, e), ann: cover.length ? cover[cover.length - 1] : null });
  }
  return out;
}

/** 一起读 · 阅读器：正文标画（荧光笔/下划线）+ 留言，实时同步进度给 TA */
export function BookReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const book = useBookStore((s) => s.books.find((b) => b.id === id));
  const setProgress = useBookStore((s) => s.setProgress);
  const addAnnotation = useBookStore((s) => s.addAnnotation);
  const setAnnotationComment = useBookStore((s) => s.setAnnotationComment);
  const removeAnnotation = useBookStore((s) => s.removeAnnotation);
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';

  const [showToc, setShowToc] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [commentTarget, setCommentTarget] = useState<{ annId?: string; start?: number; end?: number; text: string } | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [syncing, setSyncing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onSel = () => {
      const c = containerRef.current;
      const s = window.getSelection();
      if (!c || !s) return;
      const off = getOffsets(c, s);
      if (off) {
        const r = s.getRangeAt(0).getBoundingClientRect();
        setSel({ ...off, x: r.left + r.width / 2, y: r.top });
      } else {
        setSel(null);
      }
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  useEffect(() => () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
  }, []);

  if (!book) {
    return (
      <div className="relative min-h-full bg-[#070b1a] px-4 py-16 text-center text-slate-400">
        <StarBackdrop />
        找不到这本书，<button type="button" onClick={() => navigate('/library')} className="text-primary hover:underline">返回书房</button>
      </div>
    );
  }

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, (el.scrollTop + el.clientHeight) / el.scrollHeight)) : 0;
    setProgress(book.id, p);
    setSyncing(true);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => setSyncing(false), 1200);
  };

  const mark = (kind: AnnotationKind) => {
    if (!sel) return;
    addAnnotation(book.id, { start: sel.start, end: sel.end, kind, text: sel.text, author: 'me' });
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  const openNewComment = () => {
    if (!sel) return;
    setCommentDraft('');
    setCommentTarget({ start: sel.start, end: sel.end, text: sel.text });
  };
  const openEditComment = (a: Annotation) => {
    setCommentDraft(a.comment ?? '');
    setCommentTarget({ annId: a.id, text: a.text });
  };
  const saveComment = () => {
    if (!commentTarget) return;
    const t = commentDraft.trim();
    if (!t) {
      setCommentTarget(null);
      return;
    }
    if (commentTarget.annId) {
      setAnnotationComment(book.id, commentTarget.annId, t);
    } else if (commentTarget.start != null && commentTarget.end != null) {
      addAnnotation(book.id, { start: commentTarget.start, end: commentTarget.end, kind: 'highlight', text: commentTarget.text, comment: t, author: 'me' });
      window.getSelection()?.removeAllRanges();
      setSel(null);
    }
    setCommentTarget(null);
  };

  const jumpTo = (idx: number, total: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: (idx / total) * el.scrollHeight, behavior: 'smooth' });
    setShowToc(false);
  };

  const pct = Math.round(book.progress * 100);
  const anns = book.annotations;

  return (
    <div className="relative min-h-screen bg-[#070b1a] text-slate-200">
      <StarBackdrop />

      {/* 顶部栏 */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#070b1a]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => navigate('/library')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-100">{book.title}</div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className={cn('h-1.5 w-1.5 rounded-full transition', syncing ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/70')} />
              已实时同步 · TA 可见
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowToc((v) => !v)}
            aria-label="目录"
            className={cn('flex h-8 w-8 items-center justify-center rounded-full transition', showToc ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/10')}
          >
            <ListOrdered className="h-4 w-4" />
          </button>
        </div>
        {/* 进度条 */}
        <div className="h-0.5 w-full bg-white/5">
          <div className="h-full bg-gradient-to-r from-indigo-400 to-sky-400 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 目录抽屉 */}
      {showToc && (
        <div className="absolute inset-x-0 top-[57px] z-20 mx-auto w-full max-w-md">
          <div className="mx-4 rounded-2xl border border-white/10 bg-[#16121f]/95 p-3 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between px-1 pb-1 text-xs font-medium text-slate-400">
              <span>目录</span>
              <button type="button" onClick={() => setShowToc(false)} className="text-slate-500 hover:text-slate-300"><X className="h-3.5 w-3.5" /></button>
            </div>
            <ol className="max-h-72 space-y-1 overflow-y-auto">
              {book.toc.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => jumpTo(i, Math.max(1, book.toc.length))}
                    className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 transition hover:bg-white/10"
                  >
                    <span className="text-[10px] text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                    {t}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* 正文滚动区 */}
      <div ref={scrollRef} onScroll={onScroll} className="mx-auto w-full max-w-md px-5 pb-24 pt-6">
        {book.desc && <p className="mb-6 rounded-xl bg-white/[0.04] px-4 py-3 text-xs leading-6 text-slate-400">{book.desc}</p>}

        {book.content.trim() ? (
          <div
            ref={containerRef}
            className="select-text whitespace-pre-wrap text-[15px] leading-8 text-slate-200"
          >
            {segments(book.content, anns).map((seg, i) =>
              seg.ann ? (
                <span
                  key={i}
                  className={cn(
                    'rounded-[2px]',
                    seg.ann.kind === 'highlight' ? 'bg-amber-300/30 text-amber-50' : 'underline decoration-amber-400/80 decoration-2 underline-offset-2',
                  )}
                >
                  {seg.text}
                  {seg.ann.comment && (
                    <button
                      type="button"
                      onClick={() => openEditComment(seg.ann!)}
                      title={seg.ann.comment}
                      className="ml-1 inline-flex translate-y-[-4px] items-center justify-center rounded-full bg-rose-500/90 text-white"
                    >
                      <MessageCircle className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-slate-500">
            <BookOpen className="mx-auto mb-2 h-6 w-6 text-slate-600" />
            还没有正文，去「书房 · 管理」编辑这本书，粘贴文章即可阅读标画。
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-slate-500">
          {taAvatar} 长按 / 选中文字可标画 · 留言会实时同步给 TA
        </p>
      </div>

      {/* 标画工具栏 */}
      {sel && (
        <div
          className="fixed z-40 -translate-x-1/2"
          style={{ left: Math.min(Math.max(sel.x, 60), window.innerWidth - 60), top: Math.max(sel.y - 52, 8) }}
        >
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#1e293b] px-1.5 py-1 shadow-2xl">
            <button type="button" onClick={() => mark('highlight')} title="荧光笔" className="flex h-8 w-8 items-center justify-center rounded-full text-amber-300 transition hover:bg-white/10">
              <Highlighter className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => mark('underline')} title="下划线" className="flex h-8 w-8 items-center justify-center rounded-full text-sky-300 transition hover:bg-white/10">
              <Underline className="h-4 w-4" />
            </button>
            <button type="button" onClick={openNewComment} title="留言" className="flex h-8 w-8 items-center justify-center rounded-full text-rose-300 transition hover:bg-white/10">
              <MessageCircle className="h-4 w-4" />
            </button>
            <span className="mx-0.5 h-5 w-px bg-white/10" />
            <button type="button" onClick={() => { window.getSelection()?.removeAllRanges(); setSel(null); }} title="关闭" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 留言弹窗 */}
      {commentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCommentTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#1b1626] p-5 shadow-xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-100">给这句话留言</h3>
              <button type="button" onClick={() => setCommentTarget(null)} className="text-slate-400 hover:text-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-3 rounded-xl bg-white/5 px-3 py-2.5 text-sm leading-6 text-slate-300">「{commentTarget.text}」</p>
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={3}
              autoFocus
              placeholder="写下想对 TA 说的话…"
              className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-white/30"
            />
            <div className="mt-4 flex gap-2">
              {commentTarget.annId && (
                <button
                  type="button"
                  onClick={() => { removeAnnotation(book.id, commentTarget.annId!); setCommentTarget(null); }}
                  className="h-10 flex-1 rounded-xl bg-rose-500/15 text-sm font-medium text-rose-300 transition hover:bg-rose-500/25"
                >
                  删除标画
                </button>
              )}
              <button type="button" onClick={() => setCommentTarget(null)} className="h-10 flex-1 rounded-xl bg-white/5 text-sm font-medium text-slate-300 transition hover:bg-white/10">
                取消
              </button>
              <button type="button" onClick={saveComment} disabled={!commentDraft.trim()} className="h-10 flex-[1.4] rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

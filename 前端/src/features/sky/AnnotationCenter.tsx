import { useState } from 'react';
import {
  BookOpen,
  FileText,
  Lightbulb,
  MessageCircle,
  PenLine,
  Send,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChat } from '@/lib/api/chatStream';
import { type ReadingAnnotation, type AnnotationColor } from '@/lib/api/reading';
import type { Book } from './bookStore';

type Tab = 'original' | 'thoughts' | 'discuss' | 'book';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'original', label: '原文', icon: FileText },
  { key: 'thoughts', label: '想法', icon: Lightbulb },
  { key: 'discuss', label: '讨论', icon: MessageCircle },
  { key: 'book', label: '书籍', icon: BookOpen },
];

const COLOR_HEX: Record<AnnotationColor, string> = {
  yellow: '#d8c39a',
  green: '#a3b8a0',
  blue: '#9fb4c4',
  pink: '#cba3ad',
  violet: '#b3a3c4',
  amber: '#cfae8f',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

function Pill({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] transition',
        active ? 'bg-rose-400/15 text-rose-300' : 'bg-white/[0.04] text-slate-300 hover:bg-white/10',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

interface Props {
  book: Book;
  annotations: ReadingAnnotation[];
  progress: { me: number; ta: number };
  onJumpToc: (idx: number) => void;
  onJumpParagraph: (idx: number) => void;
  onDeleteAnnotation: (ann: ReadingAnnotation) => void;
  onClose: () => void;
}

/** 一起读 · 批注中心：原文 / 想法 / 讨论 / 书籍 四 Tab + AI 讨论（移动端底部弹窗，lg 右侧边栏） */
export function AnnotationCenter({
  book,
  annotations,
  progress,
  onJumpToc,
  onJumpParagraph,
  onDeleteAnnotation,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('discuss');
  const [favorite, setFavorite] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const notes = annotations.flatMap((a) => a.notes.map((n) => ({ ...n, selectedText: a.selectedText })));

  const askAi = async (question: string) => {
    const q = question.trim();
    if (!q || aiLoading) return;
    setAiMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '' }]);
    setAiInput('');
    setAiLoading(true);
    const context = `用户正在读《${book.title}》${book.author ? `（${book.author}）` : ''}。${book.desc ? `简介：${book.desc}` : ''}\n\n用户的问题：${q}\n\n请用温柔自然的口吻回答，先中文，再附一句英文翻译。控制在 3 句以内。`;
    let acc = '';
    const setLast = (t: string) =>
      setAiMessages((m) => {
        const n = [...m];
        n[n.length - 1] = { role: 'assistant', text: t };
        return n;
      });
    await streamChat([{ role: 'user', content: context }], {
      onDelta: (t) => {
        acc += t;
        setLast(acc);
      },
      onError: (msg) => setLast(`（AI 暂时不可用：${msg}）`),
    });
    setAiLoading(false);
  };

  const deleteLast = () => {
    if (annotations.length) onDeleteAnnotation(annotations[annotations.length - 1]);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl bg-[#14121d] shadow-2xl ring-1 ring-white/10 lg:left-auto lg:top-0 lg:max-h-none lg:w-[400px] lg:rounded-l-2xl lg:rounded-t-none"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">批注中心</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 四等分 */}
        <div className="grid grid-cols-4 border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex flex-col items-center gap-1 py-2.5 text-[11px] transition',
                tab === t.key ? 'text-rose-300' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {tab === t.key && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-rose-400" />}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'original' && (
            <div className="h-full overflow-y-auto p-3">
              {annotations.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">还没有划线，长按正文选中文字即可。</p>
              ) : (
                <div className="space-y-1.5">
                  {annotations.map((a) => (
                    <div key={a.id} className="group flex items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLOR_HEX[a.color] }} />
                      <button
                        type="button"
                        onClick={() => onJumpParagraph(a.chapter)}
                        className="min-w-0 flex-1 text-left text-sm leading-6 text-slate-300 transition hover:text-slate-100"
                      >
                        {a.selectedText}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAnnotation(a)}
                        aria-label="删除划线"
                        className="shrink-0 text-slate-500 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'thoughts' && (
            <div className="h-full overflow-y-auto p-3">
              {notes.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">还没有想法，选中文字后留张纸条吧。</p>
              ) : (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                      <p className="line-clamp-2 text-xs text-slate-500">「{n.selectedText}」</p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">{n.content}</p>
                      <p className="mt-1 text-right text-[10px] text-slate-500">
                        {n.author === 'me' ? '我' : 'TA'} · {formatTime(n.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'discuss' && (
            <div className="flex h-full flex-col p-3">
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
                {aiMessages.length === 0 && (
                  <div className="flex items-start gap-2 rounded-xl bg-white/[0.04] p-3 text-xs leading-5 text-slate-400">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
                    和 AI 聊聊这本书，或点击「问伙伴」让它帮你解读。
                  </div>
                )}
                {aiMessages.map((m, i) => (
                  <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6',
                        m.role === 'user' ? 'rounded-br-sm bg-rose-400/20 text-slate-100' : 'rounded-bl-sm bg-white/[0.06] text-slate-200',
                      )}
                    >
                      {m.role === 'assistant' && <span className="mb-1 block text-[10px] text-rose-300">🫐 AI</span>}
                      {m.text || (aiLoading && m.role === 'assistant' ? '…' : '')}
                    </div>
                  </div>
                ))}
              </div>

              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  askAi(aiInput);
                }}
              >
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="问 AI 这本书…"
                  className="min-w-0 flex-1 rounded-full bg-white/10 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-1 ring-white/10 focus:ring-rose-400/50"
                />
                <button
                  type="submit"
                  disabled={aiLoading || !aiInput.trim()}
                  aria-label="发送"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-400 text-white transition hover:bg-rose-500 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-2 grid grid-cols-4 gap-2">
                <Pill icon={UserRound} label="问伙伴" onClick={() => askAi('这本书想表达什么？帮我用几句话讲讲。')} />
                <Pill icon={PenLine} label="写想法" onClick={() => setTab('thoughts')} />
                <Pill icon={Star} label={favorite ? '已收藏' : '收藏'} active={favorite} onClick={() => setFavorite((v) => !v)} />
                <Pill icon={Trash2} label="删除划线" onClick={deleteLast} />
              </div>
            </div>
          )}

          {tab === 'book' && (
            <div className="h-full space-y-3 overflow-y-auto p-3">
              <div className="flex items-center gap-3">
                {book.cover ? (
                  <img src={book.cover} alt={book.title} className="h-16 w-11 shrink-0 rounded-md object-cover" />
                ) : (
                  <div
                    className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md px-1"
                    style={{ background: `linear-gradient(135deg, ${book.color}, ${book.color} 70%, rgba(0,0,0,0.25))` }}
                  >
                    <span className="text-[10px] font-semibold leading-snug text-[#f6efe6]" style={{ writingMode: 'vertical-rl' }}>
                      {book.title}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">{book.title}</p>
                  <p className="truncate text-xs text-slate-400">{book.author}</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${progress.me}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    我 {progress.me}% · TA {progress.ta}%
                  </p>
                </div>
              </div>

              {book.desc && <p className="rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs leading-6 text-slate-400">{book.desc}</p>}

              {book.toc.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-400">目录</p>
                  <ol className="space-y-1">
                    {book.toc.map((t, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onJumpToc(i)}
                          className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-300 transition hover:bg-white/5"
                        >
                          <span className="text-[10px] text-slate-500">{String(i + 1).padStart(2, '0')}</span>
                          {t}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

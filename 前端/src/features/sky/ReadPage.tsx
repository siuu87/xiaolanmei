import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Quote,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBackdrop } from './StarBackdrop';

type Tab = 'read' | 'quotes';

/** 一起读：逐段朗读 + 摘录笔记 */
export function ReadPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('read');

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8 md:max-w-3xl">
        <header className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/sky')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-slate-100">READ</h1>
          </div>
          <span className="w-8" />
        </header>

        <div className="mb-6 flex justify-center gap-2">
          {(
            [
              { key: 'read', label: '阅读', icon: BookOpen },
              { key: 'quotes', label: '摘录', icon: Quote },
            ] as { key: Tab; label: string; icon: typeof BookOpen }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition',
                tab === t.key ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
          {tab === 'read' ? <ReaderPanel /> : <QuotesPanel />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 阅读 ------------------------------ */

function ReaderPanel() {
  const [text, setText] = useState('');
  const [paras, setParas] = useState<string[]>([]);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);

  const prepare = () => {
    const list = text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    setParas(list);
    setCurrent(-1);
    window.speechSynthesis.cancel();
  };

  const readPara = (idx: number) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(paras[idx]);
    u.lang = 'zh-CN';
    u.onend = () => {
      if (idx + 1 < paras.length) {
        setCurrent(idx + 1);
        readPara(idx + 1);
      } else {
        setCurrent(-1);
        setPlaying(false);
      }
    };
    setCurrent(idx);
    window.speechSynthesis.speak(u);
  };

  const play = () => {
    if (paras.length === 0) return;
    setPlaying(true);
    readPara(current >= 0 ? current : 0);
  };
  const pause = () => {
    window.speechSynthesis.pause();
    setPlaying(false);
  };
  const stop = () => {
    window.speechSynthesis.cancel();
    setCurrent(-1);
    setPlaying(false);
  };
  const step = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(paras.length - 1, current + dir));
    setPlaying(true);
    readPara(next);
  };

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-white/30';

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="粘贴一篇文章，逐段朗读…"
        className={cn(inputCls, 'resize-none')}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={prepare} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15">
          <BookOpen className="mr-1 inline h-4 w-4" /> 分段
        </button>
        <button type="button" onClick={play} disabled={paras.length === 0} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15 disabled:opacity-40">
          <Play className="mr-1 inline h-4 w-4" /> 开始
        </button>
        <button type="button" onClick={pause} disabled={!playing} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15 disabled:opacity-40">
          <Pause className="mr-1 inline h-4 w-4" /> 暂停
        </button>
        <button type="button" onClick={stop} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15">
          <Square className="mr-1 inline h-4 w-4" /> 停止
        </button>
        <button type="button" onClick={() => step(-1)} disabled={paras.length === 0} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15 disabled:opacity-40">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => step(1)} disabled={paras.length === 0} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/15 disabled:opacity-40">
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {paras.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setPlaying(true);
              readPara(i);
            }}
            className={cn(
              'block w-full rounded-lg px-3 py-2 text-left text-sm leading-6 transition',
              current === i ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-white/5 text-slate-300 hover:bg-white/10',
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ 摘录 ------------------------------ */

const LS_QUOTES = 'blueberry.bookhouse.quotes';

function QuotesPanel() {
  const [quotes, setQuotes] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_QUOTES);
      if (raw) setQuotes(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: string[]) => {
    setQuotes(next);
    localStorage.setItem(LS_QUOTES, JSON.stringify(next));
  };

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    persist([t, ...quotes]);
    setDraft('');
  };

  const remove = (idx: number) => persist(quotes.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="写下一句想留住的话…"
          className="h-10 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={add}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-slate-100 hover:bg-white/20"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {quotes.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">还没有摘录，写下一句吧。</p>
      ) : (
        <div className="space-y-2">
          {quotes.map((q, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
              <Quote className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <p className="min-w-0 flex-1 text-sm leading-6 text-slate-200">{q}</p>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="删除"
                className="shrink-0 text-slate-500 transition hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

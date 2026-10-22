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
    <div className="relative min-h-full bg-page-bg text-foreground">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8 md:max-w-3xl">
        <header className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold text-foreground">READ</h1>
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
                tab === t.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="paper-card p-4">
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
    'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/50';

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
        <button type="button" onClick={prepare} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-3">
          <BookOpen className="mr-1 inline h-4 w-4" /> 分段
        </button>
        <button type="button" onClick={play} disabled={paras.length === 0} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-3 disabled:opacity-40">
          <Play className="mr-1 inline h-4 w-4" /> 开始
        </button>
        <button type="button" onClick={pause} disabled={!playing} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-3 disabled:opacity-40">
          <Pause className="mr-1 inline h-4 w-4" /> 暂停
        </button>
        <button type="button" onClick={stop} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-3">
          <Square className="mr-1 inline h-4 w-4" /> 停止
        </button>
        <button type="button" onClick={() => step(-1)} disabled={paras.length === 0} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-3 disabled:opacity-40">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => step(1)} disabled={paras.length === 0} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-foreground hover:bg-surface-3 disabled:opacity-40">
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
              current === i ? 'bg-gold/10 text-foreground ring-1 ring-gold/40' : 'bg-surface-2 text-foreground/80 hover:bg-surface-3',
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
          className="h-10 flex-1 rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/50"
        />
        <button
          type="button"
          onClick={add}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-foreground hover:bg-surface-3"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {quotes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">还没有摘录，写下一句吧。</p>
      ) : (
        <div className="space-y-2">
          {quotes.map((q, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <Quote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-sm leading-6 text-foreground">{q}</p>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="删除"
                className="shrink-0 text-muted-foreground transition hover:text-destructive"
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

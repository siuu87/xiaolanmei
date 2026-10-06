import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChat } from '@/lib/api/chatStream';
import type { LyricLine } from './neteaseMcpConnector';

interface Props {
  progressMs: number;
  lines: LyricLine[];
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
}

/** 歌词面板（无框、居中）+ 点击歌词展开 AI 歌词伴侣对话 */
export function LyricsPanel({ progressMs, lines }: Props) {
  const [activeLyric, setActiveLyric] = useState<LyricLine | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // 当前高亮行：最后一条 timeMs <= progressMs 的行
  const activeIdx = lines.reduce((acc, line, i) => (line.timeMs <= progressMs ? i : acc), 0);

  const openLyric = (line: LyricLine) => {
    setActiveLyric(line);
    setMessages([]);
    setInput('');
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading || !activeLyric) return;
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '' }]);
    setInput('');
    setLoading(true);
    const context = `用户正在听歌，点选了这句歌词想聊聊：\n「${activeLyric.text}」${activeLyric.translation ? `\n（翻译：${activeLyric.translation}）` : ''}\n\n用户的问题：${q}\n\n请围绕这句歌词作答，语气温柔自然，控制在 3 句以内，直接回答即可。`;
    let acc = '';
    const setLast = (t: string) => {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', text: t };
        return next;
      });
    };
    await streamChat([{ role: 'user', content: context }], {
      onDelta: (t) => {
        acc += t;
        setLast(acc);
      },
      onError: (msg) => setLast(`（AI 暂时不可用：${msg}）`),
    });
    setLoading(false);
  };

  if (lines.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">暂无歌词</p>;
  }

  return (
    <div className="space-y-4">
      {/* 歌词：无框、居中 */}
      <div className="space-y-3">
        {lines.map((line, i) => (
          <div
            key={i}
            onClick={() => openLyric(line)}
            role="button"
            tabIndex={0}
            className={cn(
              'cursor-pointer text-center transition-colors duration-300',
              i === activeIdx ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            <p className={cn('text-sm leading-6', i === activeIdx && 'font-medium')}>{line.text}</p>
            {line.translation && <p className="text-xs leading-5 text-slate-500/80">{line.translation}</p>}
          </div>
        ))}
      </div>

      {/* AI 歌词伴侣（点击歌词展开） */}
      {activeLyric && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 text-xs text-rose-300/90">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="truncate">AI 歌词伴侣 · 「{activeLyric.text}」</span>
          </div>

          <div className="mt-3 space-y-2">
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => send('这句歌词的意境是什么？')}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/20"
                >
                  解读意境
                </button>
                <button
                  type="button"
                  onClick={() => send('帮我分析这句歌词的修辞手法')}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/20"
                >
                  分析修辞
                </button>
              </div>
            )}
            {messages.map((m, i) => (
              <p key={i} className={cn('text-sm leading-6', m.role === 'user' ? 'text-slate-200' : 'text-slate-300')}>
                {m.role === 'user' && <span className="mr-1 text-slate-500">你：</span>}
                {m.text || (loading && m.role === 'assistant' ? '…' : '')}
              </p>
            ))}
          </div>

          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="点评或问问这句歌词…"
              className="min-w-0 flex-1 rounded-full bg-white/10 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-1 ring-white/10 focus:ring-rose-400/50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="发送"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-400 text-white transition hover:bg-rose-500 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

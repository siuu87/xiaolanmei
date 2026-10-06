import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { StarBackdrop } from './StarBackdrop';
import { VinylPlayer } from './VinylPlayer';

interface ListenMsg {
  id: string;
  role: 'me' | 'ta';
  content: string;
  createdAt: number;
}

const LS_LISTEN = 'blueberry.listen.chat';

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 气泡下方的时间戳：HH:MM */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * 一起听（占位）：黑胶唱片一起听 + 边听边聊。
 * 气泡样式沿用聊天（我=右侧白、TA=左侧浅蓝），时间戳在气泡外侧右下角。
 */
export function ListenPage() {
  const navigate = useNavigate();
  const meAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';

  const [messages, setMessages] = useState<ListenMsg[]>(() => {
    try {
      const raw = localStorage.getItem(LS_LISTEN);
      if (raw) {
        const list = JSON.parse(raw) as ListenMsg[];
        if (Array.isArray(list) && list.length) return list;
      }
    } catch {
      /* ignore */
    }
    return [{ id: 'seed-ta', role: 'ta', content: '一起听歌吧，点上面的播放键 🎧', createdAt: Date.now() }];
  });
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { id: uid(), role: 'me' as const, content: text, createdAt: Date.now() }];
    setMessages(next);
    setInput('');
    try {
      localStorage.setItem(LS_LISTEN, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />

      <div className="relative mx-auto w-full max-w-md px-4 py-6 md:max-w-3xl">
        <header className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/sky')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-xs tracking-[0.3em] text-slate-400/80">LISTEN</p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-100">一起听</h1>
          </div>
          <span className="w-8" />
        </header>

        <VinylPlayer />

        {/* 边听边聊 */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col">
                <div className={cn('flex items-start gap-2', m.role === 'me' ? 'flex-row-reverse' : 'flex-row')}>
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-base">
                    {m.role === 'me' ? meAvatar : taAvatar}
                  </div>
                  <div className={cn('flex min-w-0 max-w-[72%] flex-col', m.role === 'me' ? 'items-end' : 'items-start')}>
                    <div
                      className={cn(
                        'relative whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-6',
                        m.role === 'me'
                          ? 'rounded-tr-[4px] bg-white text-slate-800'
                          : 'rounded-tl-[4px] bg-[#a8c7f0] text-slate-900',
                      )}
                    >
                      {m.content}
                    </div>
                    <span className="mt-1 self-end text-[10px] leading-none text-slate-500">{fmtTime(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* 输入框 */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="一起听歌，说点什么…"
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={send}
              aria-label="发送"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-400 text-white transition hover:opacity-90"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Beer, Send, Wifi, WifiOff, Loader2, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBackdrop } from '@/features/sky/StarBackdrop';
import {
  getTavernStatus,
  listCharacters,
  sendMessage,
  type TavernCharacter,
  type TavernStatus,
} from './tavernMcpConnector';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * 酒馆（SillyTavern 角色扮演）功能页：
 * 连接状态 + 角色卡列表 + 进入角色聊天（占位数据，真实接入走酒馆 MCP）。
 */
export function TavernPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TavernStatus | null>(null);
  const [characters, setCharacters] = useState<TavernCharacter[]>([]);
  const [active, setActive] = useState<TavernCharacter | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void getTavernStatus().then(setStatus);
    void listCharacters().then(setCharacters);
  }, []);

  const openCharacter = (c: TavernCharacter) => {
    setActive(c);
    setMessages([{ role: 'assistant', text: c.greeting }]);
  };

  const back = () => {
    if (active) {
      setActive(null);
      setMessages([]);
    } else {
      navigate('/sky');
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !active || sending) return;
    setDraft('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const reply = await sendMessage(active, text);
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8">
        {/* 顶部：返回 + 标题 */}
        <header className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2 text-center">
            <Beer className="h-4 w-4 text-amber-300" />
            <h1 className="text-xl font-bold text-slate-100">酒馆</h1>
          </div>
          <span className="w-8" />
        </header>

        {/* 连接状态 */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs backdrop-blur-sm">
          {status?.connected ? (
            <Wifi className="h-4 w-4 text-emerald-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-slate-500" />
          )}
          <span className="text-slate-300">{status?.connected ? '酒馆已连接' : '酒馆未连接'}</span>
          <span className="flex-1" />
          <span className="text-slate-500">{status?.source ?? 'sillytavern-mcp'}</span>
        </div>

        {active ? (
          <ChatPanel
            character={active}
            messages={messages}
            draft={draft}
            sending={sending}
            onDraft={setDraft}
            onSend={send}
            onBackList={() => {
              setActive(null);
              setMessages([]);
            }}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              在「MCP 管理」页接入 SillyTavern 后即可真实对话（当前为占位数据）。
            </p>
            <div className="grid grid-cols-2 gap-3">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCharacter(c)}
                  className="group flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">
                    {c.avatar}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-slate-100">{c.name}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-400">
                      {c.description}
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400"
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 与单个角色的聊天面板 */
function ChatPanel({
  character,
  messages,
  draft,
  sending,
  onDraft,
  onSend,
  onBackList,
}: {
  character: TavernCharacter;
  messages: Msg[];
  draft: string;
  sending: boolean;
  onDraft: (v: string) => void;
  onSend: () => void;
  onBackList: () => void;
}) {
  return (
    <div className="flex h-[62vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
      {/* 角色头部 */}
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5">
        <button
          type="button"
          onClick={onBackList}
          aria-label="返回角色列表"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl">
          {character.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{character.name}</p>
          <p className="truncate text-[11px] text-slate-500">{character.description}</p>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-6',
                m.role === 'user'
                  ? 'rounded-br-sm bg-amber-400/90 text-slate-900'
                  : 'rounded-bl-sm bg-white/10 text-slate-200',
              )}
            >
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white/10 px-3 py-2 text-sm text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在输入…
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="flex items-center gap-2 border-t border-white/10 p-2.5">
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
          placeholder={`和 ${character.name} 说点什么…`}
          className="h-10 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-white/30"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim() || sending}
          aria-label="发送"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/90 text-slate-900 transition hover:bg-amber-400 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

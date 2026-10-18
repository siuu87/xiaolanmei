import { useState } from 'react';
import { Check, Loader2, MessageSquareText, Rows3 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { CHAT_STYLE_META, useChatStyle, type ChatStyleMode } from '@/stores/chatStyleStore';
import { cn } from '@/lib/utils';

/** 展示顺序按用户描述：① 即兴聊天 ② 沉浸陪伴 */
const ORDER: ChatStyleMode[] = ['improv', 'immersive'];

const ICON: Record<ChatStyleMode, typeof Rows3> = {
  improv: Rows3,
  immersive: MessageSquareText,
};

/**
 * 说话风格选择（底部弹层）。
 *
 * 两个档位对应后端两套提示词规范（`后端/src/persona/chatStyle.ts`）：
 * 即兴 = 一行一句、多气泡；沉浸 = 整段连贯、只说话。
 * 切换写进 `settings.chat.styleMode`，**下一条回复立刻生效**。
 */
export function ChatStyleSheet({
  open,
  onOpenChange,
  onError,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onError?: (msg: string) => void;
}) {
  const { mode, saving, setMode } = useChatStyle();
  const [pending, setPending] = useState<ChatStyleMode | null>(null);

  const pick = async (next: ChatStyleMode) => {
    if (next === mode) {
      onOpenChange(false);
      return;
    }
    setPending(next);
    try {
      await setMode(next);
      onOpenChange(false);
    } catch {
      onError?.('切换失败，检查一下后端有没有起来');
    } finally {
      setPending(null);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="说话风格" testid="chat-style-sheet">
      <div className="px-4 pb-2 text-center text-[12px] leading-relaxed text-chat-meta">
        换个说话的方式。切换后，下一条回复就变口吻。
      </div>

      <div className="flex flex-col gap-2 px-4 pb-1">
        {ORDER.map((m) => {
          const meta = CHAT_STYLE_META[m];
          const Icon = ICON[m];
          const active = mode === m;
          const busy = pending === m;
          return (
            <button
              key={m}
              type="button"
              data-testid={`chat-style-option-${m}`}
              aria-pressed={active}
              disabled={saving}
              onClick={() => void pick(m)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99]',
                active
                  ? 'border-chat-accent/60 bg-chat-pill shadow-sm'
                  : 'border-chat-line bg-chat-bg hover:bg-chat-pill',
                saving && !busy && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  active ? 'bg-chat-accent/20 text-chat-accent' : 'bg-chat-line/70 text-chat-meta',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold text-chat-ai-fg">{meta.title}</span>
                  {active && !busy ? (
                    <span className="rounded-full bg-chat-accent/10 px-1.5 py-[1px] text-[10px] leading-none text-chat-accent">
                      正在用
                    </span>
                  ) : null}
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-chat-meta" /> : null}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-chat-meta">{meta.desc}</span>
              </span>
              {active && !busy ? <Check className="mt-1 h-4 w-4 shrink-0 text-chat-accent" /> : null}
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4 pt-2 text-center text-[11px] leading-relaxed text-chat-meta">
        只影响之后的新回复，已经聊过的消息不会重写。
        <br />
        即兴模式下，一句话会拆成一条条气泡蹦出来。
      </div>
    </BottomSheet>
  );
}

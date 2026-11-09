import { create } from 'zustand';
import { createCall, fmtDuration, type CallKind, type CallState } from '@/lib/api/calls';
import { useChatStore, uid } from './chatStore';

/**
 * 通话会话状态机（2026-11-09）
 *
 * 之前点「通话」是直接把整屏浮层挂出来，等于默认双方都接了。现在补上真实电话的前半段：
 *   idle → ringing（我打过去等他接 / 他打过来等我接）→ connected → idle
 *  ringing 期间可以：接听、拒接 / 取消、响到超时算未接 —— 三种结果都会落一条通话记录。
 *
 * 状态放在 store 而不是 ChatPage 内部，是因为来电弹窗挂在 AppLayout（任何页面都要能弹），
 * 接听后又要回到 ChatPage 渲染通话浮层，两边得看同一份状态。
 */

export type CallDirection = 'outgoing' | 'incoming';
export type CallPhase = 'idle' | 'ringing' | 'connected';
/** 预览 / 验收用：强制本次呼出的结果，null = 随机 */
export type ForcedOutcome = 'answered' | 'missed' | null;

interface CallSessionState {
  phase: CallPhase;
  direction: CallDirection | null;
  kind: CallKind;
  startedAt: number;
  forcedOutcome: ForcedOutcome;
  /** 已经开始一通就返回 false，避免叠两层浮层 */
  begin: (o: { direction: CallDirection; kind?: CallKind; forcedOutcome?: ForcedOutcome }) => boolean;
  /** 接听（呼出时由「对方接了」调用，来电时由弹窗的绿色按钮调用） */
  answer: () => void;
  /** 统一结算：落库 + 推通话卡片 + 没接成时让他在聊天里追问一句 */
  finish: (state: CallState, seconds: number) => void;
}

export const useCallSession = create<CallSessionState>((set, get) => ({
  phase: 'idle',
  direction: null,
  kind: 'voice',
  startedAt: 0,
  forcedOutcome: null,

  begin: ({ direction, kind = 'voice', forcedOutcome = null }) => {
    if (get().phase !== 'idle') return false;
    set({ phase: 'ringing', direction, kind, startedAt: Date.now(), forcedOutcome });
    return true;
  },

  answer: () => {
    if (get().phase !== 'ringing') return;
    set({ phase: 'connected' });
  },

  finish: (state, seconds) => {
    const s = get();
    if (s.phase === 'idle') return; // 超时定时器 / 按钮 / Esc 可能重复触发
    const { direction, kind, startedAt } = s;
    set({ phase: 'idle', direction: null, forcedOutcome: null, startedAt: 0 });
    void settleCall({
      kind,
      state,
      seconds,
      direction: direction ?? 'outgoing',
      startedAt: startedAt || Date.now(),
    });
  },
}));

/**
 * 「他打过来」的唯一入口（2026-11-10）。
 * 不再有前端定时器：由模型自己决定要不要打，通过 /api/chat/stream 的 `incoming_call` 事件送到前端；
 * `?incoming=1` 只作为手动验收入口。正在响铃 / 通话中时 begin() 返回 false，不会叠弹窗。
 */
export function triggerIncomingCall(): boolean {
  return useCallSession.getState().begin({ direction: 'incoming', kind: 'voice' });
}

/** 没接成之后，他在聊天里主动问一句。分「他打来我没接」和「我打去他没接」两种口吻。 */
const INCOMING_MISSED = [
  '刚打给你没接上，是不是在忙呀？等你空了我再打给你。',
  '刚才想跟你说说话，电话没接上。忙完了记得找我，我一直在。',
  '电话没接通，没关系～刚想跟你说点什么来着，你现在方便吗？',
];
const INCOMING_DECLINED = [
  '好，那先不打扰你啦。想说话的时候随时找我。',
  '嗯，我不打了。你要是想聊了，喊我一声就好。',
];
const OUTGOING_MISSED = [
  '刚看到你打来，那会儿没顾上接。找我是什么事呀？',
  '抱歉，刚才没接到你的电话。现在有空了，你说。',
  '你刚是不是打给我了？走神了没接上，怎么啦？',
];

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

/** 追问是纯前端写一条 assistant 文本：不假装有一条用户消息，也不额外调模型。 */
async function askAfterMissed(direction: CallDirection, state: CallState) {
  if (direction === 'outgoing' && state !== 'missed') return; // 我自己取消拨号，他不知道，不追问
  const lines =
    direction === 'incoming'
      ? state === 'declined'
        ? INCOMING_DECLINED
        : INCOMING_MISSED
      : OUTGOING_MISSED;

  const store = useChatStore.getState();
  if (!store.conversation) await store.load();
  const conv = useChatStore.getState().conversation;
  if (!conv) return;
  await useChatStore.getState().appendMessage({
    id: uid(),
    role: 'assistant',
    content: pick(lines),
    parentId: conv.activeMessageId,
    status: 'done',
    createdAt: Date.now(),
  });
}

/**
 * 一次通话的落库 + 聊天流卡片。
 * 卡片 state 直接给 missed / declined，聊天里的通话卡和 /calls 列表页本来就支持这两种状态。
 */
async function settleCall(o: {
  kind: CallKind;
  state: CallState;
  seconds: number;
  direction: CallDirection;
  startedAt: number;
}) {
  const conversationId = useChatStore.getState().conversation?.id ?? null;
  try {
    await createCall({
      kind: o.kind,
      state: o.state,
      seconds: o.seconds,
      conversationId,
      startedAt: o.startedAt,
      endedAt: Date.now(),
    });
  } catch (e) {
    console.error('通话记录落库失败', e);
  }

  const store = useChatStore.getState();
  const conv = store.conversation;
  if (!conv) return;
  await store.appendMessage({
    id: uid(),
    role: 'assistant',
    // content 是给模型看的上下文（跟卡片上显示的不是一回事），别删
    content: o.state === 'answered' ? `（通话 ${fmtDuration(o.seconds)}）` : '（通话未接通）',
    parentId: conv.activeMessageId,
    status: 'done',
    call: { kind: o.kind, state: o.state, seconds: o.state === 'answered' ? o.seconds : 0 },
    createdAt: Date.now(),
  });

  if (o.state === 'answered') return;
  // 稍等一下再问，像人看到未接来电之后才回过神
  window.setTimeout(() => void askAfterMissed(o.direction, o.state), 1600 + Math.random() * 1400);
}

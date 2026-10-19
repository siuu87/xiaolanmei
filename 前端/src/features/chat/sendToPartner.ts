import { useChatStore, pathTo, uid, type ChatMessage } from './chatStore';
import { streamChat, type ChatPayloadMessage } from '@/lib/api/chatStream';

function toPayload(m: ChatMessage): ChatPayloadMessage {
  // 只把内存里的 base64 data URL 发给模型（重载后的消息没有 dataUrl，退化纯文本）
  const images = m.images?.map((i) => i.dataUrl).filter((x): x is string => !!x);
  return {
    role: m.role,
    content: m.content,
    // 后端据此渲染消息时间戳（存档不写）
    createdAt: m.createdAt,
    ...(images && images.length ? { images } : {}),
  };
}

/**
 * 把一段文字作为「用户消息」发进当前唯一的会话，并触发 AI 回复。
 *
 * 供「今天吃什么」用：recipe-nook 以 iframe 内嵌，用户点「发给 AI 打分 / 让 AI 教我做」时
 * 通过 postMessage 把文字递过来，这里接住并送进和小蓝莓**同一个对话**（不新开一条）。
 *
 * 这是与 ChatPage 的 send 等价的最小实现：不触发识图分流 / 工具确认弹窗 / 记忆提取等展示层副流程
 * （那些是聊天页的 UI 逻辑）。纯文本场景下足够。
 */
export async function sendToPartner(text: string): Promise<void> {
  const store = useChatStore.getState();
  if (!store.conversation) await store.load();
  const conv = useChatStore.getState().conversation;
  if (!conv) return;

  const parentId = conv.activeMessageId;
  const userMsg: ChatMessage = {
    id: uid(),
    role: 'user',
    content: text,
    parentId,
    status: 'done',
    createdAt: Date.now(),
  };
  await store.appendMessage(userMsg);

  const base = parentId ? pathTo(conv, parentId).map(toPayload) : [];
  const assistantId = uid();
  await store.appendMessage({
    id: assistantId,
    role: 'assistant',
    content: '',
    parentId: userMsg.id,
    status: 'streaming',
    createdAt: Date.now(),
  });

  const convId = conv.id;
  await streamChat([...base, toPayload(userMsg)], {
    conversationId: convId,
    // 同样是「和 TA 的一轮」：后端情绪前置分析用它做幂等键
    userMessageId: userMsg.id,
    onDelta: (d) => store.updateMessage(assistantId, (p) => ({ content: p.content + d })),
    onReasoning: (r) => store.updateMessage(assistantId, (p) => ({ reasoning: (p.reasoning ?? '') + r })),
    onDone: () => void store.finalizeMessage(assistantId, { status: 'done' }),
    onError: (msg) => {
      const cur = useChatStore.getState().conversation?.messages.find((m) => m.id === assistantId);
      void store.finalizeMessage(assistantId, {
        content: (cur?.content ? cur.content + '\n\n' : '') + `⚠️ ${msg}`,
        status: 'error',
      });
    },
  });
}

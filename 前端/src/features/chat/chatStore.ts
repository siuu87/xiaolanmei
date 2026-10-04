import { create } from 'zustand';
import * as api from '@/lib/api/conversations';

export type MessageStatus = 'streaming' | 'done' | 'error';

/** 发图附件（阶段 7）：url 持久化（后端 /api/files），dataUrl 仅内存用于发给模型 */
export interface ChatImage {
  url: string;
  dataUrl?: string;
  name?: string;
  mime?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parentId: string | null; // 树形链（null = 根）
  status?: MessageStatus;
  images?: ChatImage[];
  sticker?: string; // 表情包贴图（emoji key；content 同步存 emoji 供模型理解）
  reasoning?: string; // 思考链：模型的推理内容（阶段 12），仅展示不回传模型
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[]; // 所有分支的全部消息
  activeMessageId: string | null; // 当前分支的叶子
}

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 从消息 meta JSON 解析图片引用 + 贴图 + 思考链（持久化只存 url/name/mime，不存 base64） */
function parseMeta(meta?: string | null): { images: ChatImage[]; sticker?: string; reasoning?: string } {
  if (!meta) return { images: [] };
  try {
    const obj = JSON.parse(meta) as {
      images?: { url: string; name?: string; mime?: string }[];
      sticker?: string;
      reasoning?: string;
    };
    const images = Array.isArray(obj.images)
      ? obj.images
          .filter((i) => i && typeof i.url === 'string')
          .map((i) => ({ url: i.url, name: i.name, mime: i.mime }))
      : [];
    return {
      images,
      sticker: typeof obj.sticker === 'string' ? obj.sticker : undefined,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : undefined,
    };
  } catch {
    return { images: [] };
  }
}

/** 把图片引用 / 贴图 / 思考链序列化进消息 meta（丢弃 base64，只留后端 URL） */
function serializeMeta(msg: { images?: ChatImage[]; sticker?: string; reasoning?: string }): string | null {
  const images =
    msg.images && msg.images.length
      ? msg.images.map((i) => ({ url: i.url, name: i.name, mime: i.mime }))
      : undefined;
  const reasoning = msg.reasoning && msg.reasoning.trim() ? msg.reasoning : undefined;
  if (!images && !msg.sticker && !reasoning) return null;
  return JSON.stringify({
    ...(images ? { images } : {}),
    ...(msg.sticker ? { sticker: msg.sticker } : {}),
    ...(reasoning ? { reasoning } : {}),
  });
}

// ---- 纯函数：树形派生 ----

function byId(conv: Conversation): Map<string, ChatMessage> {
  return new Map(conv.messages.map((m) => [m.id, m]));
}

/** 从 msgId 沿 parentId 回溯到根，返回根 → msgId 的线性路径（含 msgId）。 */
export function pathTo(conv: Conversation, msgId: string): ChatMessage[] {
  const map = byId(conv);
  const path: ChatMessage[] = [];
  let cur: ChatMessage | undefined = map.get(msgId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
  }
  return path;
}

/** 当前活跃分支：从 activeMessageId 回溯（根 → 叶）。 */
export function activePath(conv: Conversation): ChatMessage[] {
  return conv.activeMessageId ? pathTo(conv, conv.activeMessageId) : [];
}

/** 某消息的所有直接子节点（保持插入顺序）。 */
export function childrenOf(conv: Conversation, msgId: string): ChatMessage[] {
  return conv.messages.filter((m) => m.parentId === msgId);
}

/** 从 msgId 沿「最后创建的子节点」一路走到叶子，返回叶子 id。 */
export function leafOf(conv: Conversation, msgId: string): string {
  let cur = msgId;
  for (;;) {
    const kids = childrenOf(conv, cur);
    if (kids.length === 0) return cur;
    cur = kids[kids.length - 1].id;
  }
}

/** 以 msgId 为根的整棵子树 id 集合（含根），用于批量删除。 */
export function subtreeIds(conv: Conversation, msgId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const m of conv.messages) {
    if (m.parentId) {
      const arr = byParent.get(m.parentId) ?? [];
      arr.push(m.id);
      byParent.set(m.parentId, arr);
    }
  }
  const out: string[] = [];
  const stack = [msgId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const c of byParent.get(id) ?? []) stack.push(c);
  }
  return out;
}

// ---- store ----

interface ChatState {
  conversation: Conversation | null; // 唯一会话（单窗口）
  loaded: boolean;
  load: () => Promise<void>;
  appendMessage: (msg: ChatMessage) => Promise<void>;
  updateMessage: (
    msgId: string,
    patch: Partial<ChatMessage> | ((prev: ChatMessage) => Partial<ChatMessage>),
  ) => void;
  finalizeMessage: (msgId: string, patch: Partial<ChatMessage>) => Promise<void>;
  setActiveMessage: (msgId: string) => Promise<void>;
  removeSubtree: (msgId: string) => Promise<void>;
}

const DEFAULT_TITLE = '小蓝莓';

/**
 * 单窗口聊天 store（阶段 3 精简）：取消多会话，只保留一个会话，
 * 仍保留树形分支（重新生成 / 编辑 / 删除 / 回滚可回溯）。
 * 前端是树的唯一事实来源，后端做哑存储。
 */
export const useChatStore = create<ChatState>((set, get) => ({
  conversation: null,
  loaded: false,

  load: async () => {
    try {
      let conv = (await api.listConversations())[0];
      if (!conv) {
        conv = await api.createConversation(uid(), DEFAULT_TITLE);
      }
      const msgs = await api.listMessages(conv.id);
      set({
        conversation: {
          id: conv.id,
          title: conv.title,
          activeMessageId: conv.activeMessageId ?? null,
          messages: msgs.map<ChatMessage>((m) => {
            const meta = parseMeta(m.meta);
            return {
              id: m.id,
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
              parentId: m.parentId,
              status: (m.status ?? 'done') as MessageStatus,
              images: meta.images,
              sticker: meta.sticker,
              reasoning: meta.reasoning,
            };
          }),
        },
        loaded: true,
      });
    } catch (err) {
      console.error('加载会话失败', err);
      set({ loaded: true });
    }
  },

  appendMessage: async (msg) => {
    const conv = get().conversation;
    if (!conv) return;
    set({
      conversation: { ...conv, messages: [...conv.messages, msg], activeMessageId: msg.id },
    });
    try {
      await api.createMessage(conv.id, {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        parentId: msg.parentId,
        status: msg.status ?? 'done',
        meta: serializeMeta(msg),
      });
      await api.patchConversation(conv.id, { activeMessageId: msg.id });
    } catch (err) {
      console.error('保存消息失败', err);
    }
  },

  updateMessage: (msgId, patch) => {
    set((s) => {
      const conv = s.conversation;
      if (!conv) return s;
      return {
        conversation: {
          ...conv,
          messages: conv.messages.map((m) => {
            if (m.id !== msgId) return m;
            const p = typeof patch === 'function' ? patch(m) : patch;
            return { ...m, ...p };
          }),
        },
      };
    });
  },

  finalizeMessage: async (msgId, patch) => {
    const conv = get().conversation;
    if (!conv) return;
    const existing = conv.messages.find((m) => m.id === msgId);
    const content = patch.content !== undefined ? patch.content : (existing?.content ?? '');
    const merged = { ...existing, ...patch, content } as ChatMessage;

    set({
      conversation: {
        ...conv,
        messages: conv.messages.map((m) => (m.id === msgId ? merged : m)),
      },
    });

    try {
      await api.patchMessage(msgId, {
        content,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        // 终稿把思考链一并写进 meta（含图片/贴图），保证刷新后仍可展开
        meta: serializeMeta(merged),
      });
    } catch (err) {
      console.error('保存消息终稿失败', err);
    }
  },

  setActiveMessage: async (msgId) => {
    const conv = get().conversation;
    if (!conv) return;
    set({ conversation: { ...conv, activeMessageId: msgId } });
    try {
      await api.patchConversation(conv.id, { activeMessageId: msgId });
    } catch (err) {
      console.error('切换分支失败', err);
    }
  },

  removeSubtree: async (msgId) => {
    const conv = get().conversation;
    if (!conv) return;
    const ids = subtreeIds(conv, msgId);
    const target = conv.messages.find((m) => m.id === msgId);
    const fallback = target?.parentId ?? null;
    const activeChanged = conv.activeMessageId != null && ids.includes(conv.activeMessageId);

    set({
      conversation: {
        ...conv,
        messages: conv.messages.filter((m) => !ids.includes(m.id)),
        activeMessageId: activeChanged ? fallback : conv.activeMessageId,
      },
    });

    try {
      await api.batchDeleteMessages(ids);
      if (activeChanged) await api.patchConversation(conv.id, { activeMessageId: fallback });
    } catch (err) {
      console.error('删除消息失败', err);
    }
  },
}));

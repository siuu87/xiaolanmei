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

/**
 * 语音消息时长（毫秒）。参考图里语音气泡要显示 mm:ss，
 * 但后端只存 meta JSON，所以和 images/sticker/reasoning 一样走 meta 往返。
 */
export interface ChatQuote {
  /** 引用卡里的那行斜体标题（参考图里是「Inside」） */
  label: string;
}

/** 通话记录卡：接听 / 拒接 / 未接来电（已回拨） */
export type CallRecordState = 'answered' | 'declined' | 'missed';

export interface ChatCall {
  kind: 'voice' | 'video';
  state: CallRecordState;
  /** 已接通时的通话时长（秒） */
  seconds?: number;
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
  createdAt?: number; // 发送时间戳（气泡上方时间戳）
  /** 可折叠引用卡（参考图的 ❝ + 竖线 + 标题 + 折叠箭头） */
  quote?: ChatQuote;
  /** 内心独白注解：气泡下方那行灰色斜体小字（参考图的「写了内心」） */
  inner?: string;
  /** 语音消息时长（毫秒）；有值就渲染成「▶ 波形 mm:ss ⤓」气泡 */
  voiceMs?: number;
  /** 通话记录卡；有值就渲染成卡片而不是气泡 */
  call?: ChatCall;
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

/** meta JSON 里能往返的所有可选字段（除 images 外都是标量） */
interface MessageMeta {
  images?: { url: string; name?: string; mime?: string }[];
  sticker?: string;
  reasoning?: string;
  quote?: ChatQuote;
  inner?: string;
  voiceMs?: number;
  call?: ChatCall;
}

/** 从消息 meta JSON 解析图片引用 + 贴图 + 思考链 + 参考图里的新形态 */
function parseMeta(meta?: string | null): Omit<ChatMessage, 'id' | 'role' | 'content' | 'parentId' | 'status' | 'createdAt'> {
  const empty = { images: [] as ChatImage[] };
  if (!meta) return empty;
  try {
    const obj = JSON.parse(meta) as MessageMeta;
    const images = Array.isArray(obj.images)
      ? obj.images
          .filter((i) => i && typeof i.url === 'string')
          .map((i) => ({ url: i.url, name: i.name, mime: i.mime }))
      : [];
    const call =
      obj.call && typeof obj.call === 'object' && obj.call.kind
        ? obj.call
        : undefined;
    return {
      images,
      sticker: typeof obj.sticker === 'string' ? obj.sticker : undefined,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : undefined,
      quote: obj.quote && typeof obj.quote.label === 'string' ? obj.quote : undefined,
      inner: typeof obj.inner === 'string' && obj.inner.trim() ? obj.inner : undefined,
      voiceMs: typeof obj.voiceMs === 'number' && obj.voiceMs > 0 ? obj.voiceMs : undefined,
      call,
    };
  } catch {
    return empty;
  }
}

/** 把图片引用 / 贴图 / 思考链 / 新形态序列化进消息 meta（丢弃 base64，只留后端 URL） */
function serializeMeta(msg: Partial<ChatMessage>): string | null {
  const images =
    msg.images && msg.images.length
      ? msg.images.map((i) => ({ url: i.url, name: i.name, mime: i.mime }))
      : undefined;
  const reasoning = msg.reasoning && msg.reasoning.trim() ? msg.reasoning : undefined;
  const inner = msg.inner && msg.inner.trim() ? msg.inner : undefined;
  const hasAny =
    !!images || !!msg.sticker || !!reasoning || !!msg.quote || !!inner || !!msg.voiceMs || !!msg.call;
  if (!hasAny) return null;
  return JSON.stringify({
    ...(images ? { images } : {}),
    ...(msg.sticker ? { sticker: msg.sticker } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(msg.quote ? { quote: msg.quote } : {}),
    ...(inner ? { inner } : {}),
    ...(msg.voiceMs ? { voiceMs: msg.voiceMs } : {}),
    ...(msg.call ? { call: msg.call } : {}),
  } satisfies MessageMeta);
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
      /**
       * 「换窗」已彻底移除：整个 App 只有这一条会话，永不断裂。
       *
       * 永远认**最早**的那一条，而不是列表的第一条——
       * 后端排序一变（pinned、updatedAt 之类），取 [0] 就会跳到另一条会话上，
       * 那跟换窗没区别：等于换了一个人。按 createdAt 取最早，才真的是同一条。
       */
      const all = await api.listConversations();
      const conv = all.length
        ? [...all].sort((a, b) => a.createdAt - b.createdAt)[0]
        : await api.createConversation(uid(), DEFAULT_TITLE);
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
              ...meta,
              createdAt: m.createdAt,
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

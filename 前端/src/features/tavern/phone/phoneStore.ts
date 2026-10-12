/**
 * 酒馆「小手机」模块 —— 状态管理
 *
 * 完全独立于 TavernPage 原有 state：
 *  - 卡片（角色卡 + 人设卡合并）
 *  - 会话（单聊 / 群聊）
 *  - 联系人
 *  - 朋友圈
 * 全部落 localStorage，不影响其他页面。
 *
 * 群聊 AI：把群里其他角色的发言也纳入上下文，角色既会回应我，
 * 也会回应其他 AI 的消息（逐角色顺序生成，复用 streamTavernChat）。
 */
import { create } from 'zustand';
import { newId } from '@/lib/id';
import { listTavernCharacters, listTavernPersonas, streamTavernChat } from '@/lib/api/tavern';
import type { ChatMessage, Contact, Moment, MomentComment, PhoneCard, Session } from './types';
import {
  composeContext,
  evaluateTrigger,
  catchUpArchive,
  parseSummary,
  editShort,
  loadStore,
  SUMMARY_SYSTEM,
} from './datacore/windowEngine';
import type { ChatMode } from './datacore/windowEngine';
import {
  SAMPLE_CHARACTER_CARDS,
  SAMPLE_CONTACTS,
  SAMPLE_MOMENTS,
  SAMPLE_PERSONA_CARDS,
} from './sampleData';

/* ----------------------------- 持久化工具 ----------------------------- */

const STORAGE_KEY = 'tavern.phone.v1';

interface PersistedShape {
  cards: PhoneCard[];
  contacts: Contact[];
  sessions: Session[];
  moments: Moment[];
  activePersonaId: string | null;
}

function loadPersisted(): Partial<PersistedShape> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<PersistedShape>;
    // 防御：结构不对时整体丢弃，回退到示例数据
    if (data && typeof data === 'object') {
      if (data.sessions && !Array.isArray(data.sessions)) delete data.sessions;
      if (data.cards && !Array.isArray(data.cards)) delete data.cards;
      if (data.contacts && !Array.isArray(data.contacts)) delete data.contacts;
      if (data.moments && !Array.isArray(data.moments)) delete data.moments;
    }
    return data;
  } catch {
    return {};
  }
}

let saveTimer: number | null = null;
/** 去抖写入 localStorage，避免流式生成时每次 set 都序列化 */
function scheduleSave(get: () => PhoneState) {
  if (typeof window === 'undefined') return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    try {
      const s = get();
      const payload: PersistedShape = {
        cards: s.cards,
        contacts: s.contacts,
        // 流式中的半成品消息不落盘，避免刷新后残留 "streaming" 状态
        sessions: s.sessions.map((x) => ({
          ...x,
          messages: x.messages.filter((m) => !m.streaming),
        })),
        moments: s.moments,
        activePersonaId: s.activePersonaId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* 配额满 / 隐私模式：静默忽略 */
    }
  }, 400);
}

/* ------------------------------- Store ------------------------------- */

interface PhoneState {
  cards: PhoneCard[];
  contacts: Contact[];
  sessions: Session[];
  moments: Moment[];
  activePersonaId: string | null;
  loaded: boolean;

  /** 初始化：示例数据 + 后端已有卡片合并（后端优先，按名字去重） */
  init: () => Promise<void>;

  // —— 卡片 ——
  addCard: (card: Omit<PhoneCard, 'id'>) => void;
  updateCard: (id: string, patch: Partial<PhoneCard>) => void;
  removeCard: (id: string) => void;
  setActivePersona: (id: string | null) => void;

  // —— 会话 ——
  openSingleSession: (contact: Contact) => string;
  createGroup: (name: string, avatar: string | null, memberIds: string[]) => string;
  updateGroup: (sessionId: string, patch: { title?: string; avatar?: string | null; memberIds?: string[]; pinned?: boolean }) => void;
  removeSession: (id: string) => void;
  markRead: (id: string) => void;
  togglePin: (id: string) => void;
  /** 切换会话的线上/线下模式：两种模式的记忆互不污染 */
  setSessionMode: (id: string, mode: 'online' | 'offline') => void;

  /** 发送一条普通消息（含群聊多角色 AI 回应） */
  sendMessage: (sessionId: string, content: string) => Promise<void>;
  /** 中止指定会话正在进行的生成 */
  stopSession: (sessionId: string) => void;
  /** 某会话是否生成中 */
  isBusy: (sessionId: string) => boolean;

  // —— 朋友圈 ——
  publishMoment: (content: string, images: Moment['images'], location?: string) => void;
  toggleLike: (momentId: string) => void;
  addComment: (momentId: string, content: string) => void;
  removeMoment: (momentId: string) => void;

  resetAll: () => void;
}

/** 把联系人转换成 AI 侧的角色卡 id（示例联系人对应 sample-* 角色卡） */
function contactCard(contacts: Contact[], cards: PhoneCard[], contactId: string): PhoneCard | undefined {
  const c = contacts.find((x) => x.id === contactId);
  if (!c) return undefined;
  return cards.find((card) => card.id === c.characterId);
}

/** 每个会话独立的 AbortController */
const controllers = new Map<string, AbortController>();

export const usePhoneStore = create<PhoneState>((set, get) => ({
  cards: [],
  contacts: SAMPLE_CONTACTS,
  sessions: [],
  moments: SAMPLE_MOMENTS,
  activePersonaId: null,
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    const persisted = loadPersisted();

    // 示例卡片 + 后端真实卡片合并
    let cards: PhoneCard[] = [...SAMPLE_CHARACTER_CARDS, ...SAMPLE_PERSONA_CARDS];
    try {
      const [chars, personas] = await Promise.all([listTavernCharacters(), listTavernPersonas()]);
      const normChars: PhoneCard[] = chars.map((c) => ({
        id: c.id,
        kind: 'character',
        name: c.name,
        avatar: c.avatar,
        intro: c.description,
        description: c.description,
        personality: c.personality,
        scenario: c.scenario,
        firstMessage: c.firstMessage,
        systemPrompt: c.systemPrompt,
        tags: c.tags ?? [],
      }));
      const normPersonas: PhoneCard[] = personas.map((p) => ({
        id: p.id,
        kind: 'persona',
        name: p.name,
        avatar: p.avatar,
        intro: p.description,
        description: p.description,
        personality: null,
        scenario: null,
        firstMessage: null,
        systemPrompt: null,
        tags: [],
      }));
      // 后端优先；同名示例卡剔除，避免重复
      const realNames = new Set([...normChars, ...normPersonas].map((c) => `${c.kind}:${c.name}`));
      cards = [
        ...normChars,
        ...normPersonas,
        ...cards.filter((c) => !realNames.has(`${c.kind}:${c.name}`)),
      ];
    } catch {
      /* 后端不可用时用示例数据兜底 */
    }

    // 联系人：后端角色卡补齐（示例联系人对应的角色被删则保留示例）
    let contacts = persisted.contacts?.length ? persisted.contacts : [...SAMPLE_CONTACTS];
    const knownCharIds = new Set(cards.filter((c) => c.kind === 'character').map((c) => c.id));
    for (const card of cards) {
      if (card.kind !== 'character') continue;
      if (contacts.some((c) => c.characterId === card.id)) continue;
      contacts = [
        ...contacts,
        {
          id: `c-${card.id}`,
          name: card.name,
          avatar: card.avatar,
          characterId: card.id,
          signature: card.intro ?? '',
        },
      ];
    }
    // 剔除已被删除的角色联系人（保留示例联系人，示例卡在 cards 中始终存在）
    contacts = contacts.filter((c) => knownCharIds.has(c.characterId));

    const activePersonaId =
      persisted.activePersonaId !== undefined
        ? persisted.activePersonaId
        : (cards.find((c) => c.kind === 'persona')?.id ?? null);

    set({
      cards,
      contacts,
      sessions: persisted.sessions ?? [],
      moments: persisted.moments?.length ? persisted.moments : SAMPLE_MOMENTS,
      activePersonaId,
      loaded: true,
    });
  },

  /* ----------------------------- 卡片 ----------------------------- */

  addCard: (card) => {
    set((s) => ({ cards: [...s.cards, { ...card, id: newId() }] }));
    scheduleSave(get);
  },

  updateCard: (id, patch) => {
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      // 角色卡改名后同步联系人显示
      contacts: s.contacts.map((ct) => {
        const card = s.cards.find((c) => c.id === id);
        if (!card || card.kind !== 'character' || ct.characterId !== id) return ct;
        return { ...ct, name: patch.name ?? ct.name, avatar: patch.avatar !== undefined ? patch.avatar : ct.avatar };
      }),
    }));
    scheduleSave(get);
  },

  removeCard: (id) => {
    set((s) => {
      const cards = s.cards.filter((c) => c.id !== id);
      const contacts = s.contacts.filter((ct) => ct.characterId !== id);
      // 群聊里移除该成员；若群聊只剩 1 人也保留（用户可以自己解散）
      const sessions = s.sessions.map((x) =>
        x.kind === 'group'
          ? { ...x, memberIds: x.memberIds.filter((m) => contacts.some((ct) => ct.id === m)) }
          : x,
      );
      return {
        cards,
        contacts,
        sessions,
        activePersonaId: s.activePersonaId === id ? null : s.activePersonaId,
      };
    });
    scheduleSave(get);
  },

  setActivePersona: (id) => {
    set({ activePersonaId: id });
    scheduleSave(get);
  },

  /* ----------------------------- 会话 ----------------------------- */

  openSingleSession: (contact) => {
    const existing = get().sessions.find((s) => s.kind === 'single' && s.targetId === contact.id);
    if (existing) {
      get().markRead(existing.id);
      return existing.id;
    }
    const session: Session = {
      id: `s-${contact.id}`,
      kind: 'single',
      targetId: contact.id,
      title: contact.name,
      avatar: contact.avatar,
      memberIds: [],
      messages: [],
      unread: 0,
      lastActiveAt: Date.now(),
    };
    set((s) => ({ sessions: [session, ...s.sessions] }));
    scheduleSave(get);
    return session.id;
  },

  createGroup: (name, avatar, memberIds) => {
    const session: Session = {
      id: `g-${newId()}`,
      kind: 'group',
      targetId: '',
      title: name,
      avatar,
      memberIds,
      messages: [
        {
          id: newId(),
          sender: 'system',
          content: '群聊已创建',
          createdAt: Date.now(),
        },
      ],
      unread: 0,
      lastActiveAt: Date.now(),
    };
    session.targetId = session.id;
    set((s) => ({ sessions: [session, ...s.sessions] }));
    scheduleSave(get);
    return session.id;
  },

  updateGroup: (sessionId, patch) => {
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, ...patch } : x)),
    }));
    scheduleSave(get);
  },

  removeSession: (id) => {
    get().stopSession(id);
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
    scheduleSave(get);
  },

  markRead: (id) => {
    const target = get().sessions.find((s) => s.id === id);
    if (!target || target.unread === 0) return;
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, unread: 0 } : x)) }));
    scheduleSave(get);
  },

  togglePin: (id) => {
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)) }));
    scheduleSave(get);
  },

  setSessionMode: (id, mode) => {
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, mode } : x)) }));
    scheduleSave(get);
  },

  sendMessage: async (sessionId, content) => {
    const text = content.trim();
    if (!text) return;
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (controllers.has(sessionId)) return; // 生成中不允许重复发送

    const myMsg: ChatMessage = { id: newId(), sender: 'me', content: text, createdAt: Date.now() };
    appendMessage(set, get, sessionId, myMsg);
    scheduleSave(get);

    // 群聊：群里所有角色依次回应（每个都能看到此前的发言）
    const responders: Contact[] =
      session.kind === 'group'
        ? session.memberIds
            .map((id) => state.contacts.find((c) => c.id === id))
            .filter((c): c is Contact => !!c)
        : (() => {
            const c = state.contacts.find((x) => x.id === session.targetId);
            return c ? [c] : [];
          })();

    if (responders.length === 0) {
      appendMessage(set, get, sessionId, {
        id: newId(),
        sender: 'system',
        content: '（没有可回应的对象）',
        createdAt: Date.now(),
      });
      return;
    }

    const controller = new AbortController();
    controllers.set(sessionId, controller);

    try {
      for (const responder of responders) {
        if (controller.signal.aborted) break;
        await runResponder(set, get, sessionId, responder, controller.signal);
      }
    } finally {
      controllers.delete(sessionId);
      scheduleSave(get);
    }
  },

  stopSession: (sessionId) => {
    const c = controllers.get(sessionId);
    if (!c) return;
    c.abort();
    controllers.delete(sessionId);
    // 把仍在 streaming 的消息定格为已完成
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId
          ? { ...x, messages: x.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)) }
          : x,
      ),
    }));
    scheduleSave(get);
  },

  isBusy: (sessionId) => controllers.has(sessionId),

  /* ---------------------------- 朋友圈 ---------------------------- */

  publishMoment: (content, images, location) => {
    const text = content.trim();
    if (!text && images.length === 0) return;
    const moment: Moment = {
      id: newId(),
      authorName: '我',
      authorAvatar: '🫐',
      content: text,
      images,
      createdAt: Date.now(),
      likes: [],
      comments: [],
      mine: true,
      location: location || undefined,
    };
    set((s) => ({ moments: [moment, ...s.moments] }));
    scheduleSave(get);
  },

  toggleLike: (momentId) => {
    set((s) => ({
      moments: s.moments.map((m) => {
        if (m.id !== momentId) return m;
        const liked = m.likes.includes('我');
        return { ...m, likes: liked ? m.likes.filter((x) => x !== '我') : [...m.likes, '我'] };
      }),
    }));
    scheduleSave(get);
  },

  addComment: (momentId, content) => {
    const text = content.trim();
    if (!text) return;
    const comment: MomentComment = {
      id: newId(),
      author: '我',
      authorAvatar: '🫐',
      content: text,
      createdAt: Date.now(),
      mine: true,
    };
    set((s) => ({
      moments: s.moments.map((m) => (m.id === momentId ? { ...m, comments: [...m.comments, comment] } : m)),
    }));
    scheduleSave(get);
  },

  removeMoment: (momentId) => {
    set((s) => ({ moments: s.moments.filter((m) => m.id !== momentId) }));
    scheduleSave(get);
  },

  resetAll: () => {
    for (const id of controllers.keys()) get().stopSession(id);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({
      cards: [...SAMPLE_CHARACTER_CARDS, ...SAMPLE_PERSONA_CARDS],
      contacts: [...SAMPLE_CONTACTS],
      sessions: [],
      moments: SAMPLE_MOMENTS,
      activePersonaId: 'sample-me-1',
      loaded: false,
    });
    void get().init();
  },
}));

/* --------------------------- 内部辅助函数 --------------------------- */

type SetFn = (fn: (s: PhoneState) => Partial<PhoneState>) => void;
type GetFn = () => PhoneState;

function appendMessage(set: SetFn, _get: GetFn, sessionId: string, msg: ChatMessage) {
  set((s) => ({
    sessions: s.sessions.map((x) =>
      x.id === sessionId
        ? {
            ...x,
            messages: [...x.messages, msg],
            lastActiveAt: msg.createdAt,
            // 非我发的消息且不是当前活跃会话 → 未读 +1（这里简化为都 +1，进入会话即清零）
            unread: msg.sender === 'me' ? x.unread : x.unread + 1,
          }
        : x,
    ),
  }));
}

function patchMessage(set: SetFn, sessionId: string, msgId: string, patch: Partial<ChatMessage>) {
  set((s) => ({
    sessions: s.sessions.map((x) =>
      x.id === sessionId
        ? { ...x, messages: x.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }
        : x,
    ),
  }));
}

/**
 * 让某个联系人回应。
 * 关键：上下文包含该会话的全部历史消息（含其他 AI 的发言、以「角色名：内容」标注），
 * 因此群聊里角色既会回应我，也会回应其他 AI 的消息。
 */
/**
 * 一轮结束后检查要不要归档。
 *
 * 先立刻用本地抽取式摘要兜底（免费、瞬时、不依赖模型可用性），
 * 再在后台异步用模型把这条摘要改写成更规整的「起因/经过/结果/关系进展」。
 * 这样即使模型挂了、被限流、或用户关掉了 AI，记忆链路也不会断。
 */
async function maybeArchiveAfterTurn(get: GetFn, sessionId: string, characterId: string, personaId: string | null) {
  try {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const mode: ChatMode = session.mode ?? 'online';
    const trigger = evaluateTrigger({ sessionId, messages: session.messages, mode });
    if (!trigger.should || trigger.count === 0) return;

    // 先取一次 pending 用作 AI 改写的素材（归档之后 pending 就变了，必须提前拿）
    const sample = composeContext({ sessionId, messages: session.messages, mode }).stats.pending;

    // 按 autoTurns 分批追平，避免一次性压成一条粗摘要
    const made = catchUpArchive({
      sessionId,
      messages: session.messages,
      mode,
      by: trigger.reason === 'gap' ? 'auto-gap' : 'auto-turns',
    });
    if (made.length === 0) return;

    // 只把最新那条交给模型改写：一次一轮，避免批量调用把额度烧穿
    const target = made[made.length - 1];
    if (!loadStore().cfg.useAi || sample.length === 0) return;

    void (async () => {
      try {
        let text = '';
        await streamTavernChat(
          {
            characterId,
            personaId,
            messages: [
              { role: 'user', content: SUMMARY_SYSTEM },
              { role: 'user', content: sample.map((m) => `${m.sender === 'me' ? '我' : m.senderName ?? '对方'}：${m.content}`).join('\n') },
            ],
          },
          (ev) => {
            if (ev.type === 'delta') text += ev.content;
          },
        );
        const fields = parseSummary(text);
        if (fields) editShort(target.id, fields);
      } catch {
        /* 改写失败就保留本地摘要，不打扰用户 */
      }
    })();
  } catch {
    /* 归档失败绝不能影响对话本身 */
  }
}

async function runResponder(
  set: SetFn,
  get: GetFn,
  sessionId: string,
  responder: Contact,
  signal: AbortSignal,
) {
  const state = get();
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;

  // 示例联系人没有后端角色卡，用一张内存卡（后端不可用时也能演示）
  const card = contactCard(state.contacts, state.cards, responder.id);
  const isSample = !card || card.id.startsWith('sample-');
  const characterId = card?.id ?? responder.characterId;

  // ── 上下文：滚动窗口 + 短期/长期记忆，代替「把整条会话全塞进去」 ──
  // 为什么不再全量发送：会话聊几天后上下文无限膨胀，服务端会强制压缩，
  // 于是细节变模糊、标点崩坏、人格漂移，最终只能"换窗"——而换窗等于换人。
  // 这里始终保持恒定体积：最近 N 条原文 + 被切下来的摘要，永不断裂。
  const mode = session.mode ?? 'online';
  const composed = composeContext({
    sessionId,
    messages: session.messages,
    mode,
  });
  const history: { role: 'user' | 'assistant'; content: string }[] = [...composed.rolling];

  // 记忆前言：拼成一条 user 消息放最前（跟着下面群聊说明、角色设定一起打包）
  if (composed.preamble.trim()) {
    history.unshift({ role: 'user', content: composed.preamble });
  }

  // 上下文里补一条群聊规则，让角色知道自己在群里、会看到别人说话
  if (session.kind === 'group') {
    const names = session.memberIds
      .map((id) => state.contacts.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join('、');
    history.unshift({
      role: 'user',
      content: `（这是群聊，成员有：${names}。你在群里，可以直接回应我，也可以回应其他成员刚才说的话。保持你自己的说话风格，发言简短自然。）`,
    });
  }

  const placeholder: ChatMessage = {
    id: newId(),
    sender: responder.id,
    senderName: responder.name,
    senderAvatar: responder.avatar,
    content: '',
    createdAt: Date.now(),
    streaming: true,
  };
  appendMessage(set, get, sessionId, placeholder);
  // 自己生成的流不计未读
  set((s) => ({
    sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, unread: Math.max(0, x.unread - 1) } : x)),
  }));

  // 示例卡片：后端没有对应角色 → 本地生成一句占位回复，保证交互链路完整
  if (isSample) {
    await delay(420 + Math.random() * 380, signal);
    const fallback =
      characterId.startsWith('sample-')
        ? sampleReply(responder.name, session.messages[session.messages.length - 1]?.content ?? '')
        : `（${responder.name} 暂时没有回应）`;
    patchMessage(set, sessionId, placeholder.id, { content: fallback, streaming: false });
    return;
  }

  try {
    let acc = '';
    await streamTavernChat(
      {
        characterId,
        personaId: state.activePersonaId,
        messages: history,
      },
      (ev) => {
        if (signal.aborted) return;
        if (ev.type === 'delta') {
          acc += ev.content;
          patchMessage(set, sessionId, placeholder.id, { content: acc });
        } else if (ev.type === 'error') {
          patchMessage(set, sessionId, placeholder.id, { content: `（出错了）${ev.message}`, streaming: false, error: true });
        }
      },
    );
    patchMessage(set, sessionId, placeholder.id, {
      content: acc || '（没有回应）',
      streaming: false,
    });
    // 一轮结束：判断要不要把溢出窗口的部分归档进短期记忆
    void maybeArchiveAfterTurn(get, sessionId, characterId, state.activePersonaId);
  } catch (e) {
    if (signal.aborted) {
      patchMessage(set, sessionId, placeholder.id, { streaming: false });
      return;
    }
    patchMessage(set, sessionId, placeholder.id, {
      content: `（出错了）${(e as Error).message}`,
      streaming: false,
      error: true,
    });
  }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(t);
      resolve();
    });
  });
}

/** 示例角色的本地占位回复：让 demo 有"活人感"，同时明确是占位文案 */
const SAMPLE_LINES: Record<string, string[]> = {
  苏晚晴: ['……嗯，我在听。', '风有点大，你那边呢？', '你先说，我听着。'],
  林墨: ['这个说法有意思，让我想想。', '我刚在书里见过类似的观点。', '你继续说，我记一下。'],
  陈屿: ['等我摘下耳机——你说什么？', '这段适合配个和弦。', '行，听你的。'],
  祁遥: ['信号收到了，延迟大约 4.2 年。', '观测舱这边很安静。', '嗯，我明白。'],
  余小满: ['来来来，坐下说！', '要不要来块蛋糕？', '好呀好呀～'],
  安和: ['嗯。', '我在。', '不着急，慢慢说。'],
};

function sampleReply(name: string, lastContent: string): string {
  const lines = SAMPLE_LINES[name];
  if (!lines) return '（示例角色，暂未接入模型）';
  // 简单轮换，避免每次都一样
  const idx = Math.abs(hash(lastContent)) % lines.length;
  return lines[idx];
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** 供组件读取：某会话当前是否生成中（订阅式） */
export function useSessionBusy(sessionId: string | null): boolean {
  return usePhoneStore((s) => {
    if (!sessionId) return false;
    const session = s.sessions.find((x) => x.id === sessionId);
    if (!session) return false;
    return session.messages.some((m) => m.streaming);
  });
}

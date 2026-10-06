import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowUp,
  Square,
  Trash2,
  Pencil,
  RefreshCw,
  Undo2,
  Reply,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  MoreHorizontal,
  Copy,
  Menu,
  Globe,
  Phone,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { matchLocalIntent } from './assistant';
import { streamChat, type ChatPayloadMessage } from '@/lib/api/chatStream';
import { matchSkills } from '@/lib/api/skills';
import { uploadImage, urlToDataUrl } from '@/lib/api/attachments';
import { getSettings } from '@/lib/api/settings';
import { describeImage } from '@/lib/api/vision';
import { extractMemories, generateSummary } from '@/lib/api/memories';
import { confirmAgent } from '@/lib/api/agent';
import {
  useChatStore,
  activePath,
  childrenOf,
  leafOf,
  pathTo,
  uid,
  type ChatMessage,
  type ChatImage,
} from './chatStore';
import { Markdown } from '@/components/Markdown';
import { SearchOverlay } from './SearchOverlay';
import { ChatDrawer } from './ChatDrawer';
import { ModelPicker } from './ModelPicker';
import { StickerPanel } from './StickerPanel';
import { CallOverlay } from './CallOverlay';
import { resolveSticker } from './stickers';
import { useTimetableStore } from '@/features/schedule/timetableStore';

const WELCOME_TEXT =
  '我是小蓝莓 🫐 可以陪你聊天，也能帮你管理待办、经期和日记。\n\n试试：\n· 「添加待办：买牛奶」\n· 「来了」记经期\n· 「记日记：今天……」写进日记本\n· 或者随便聊聊';

function toPayload(m: ChatMessage): ChatPayloadMessage {
  // 只把内存里的 base64 data URL 发给模型（重载后的消息没有 dataUrl，退化纯文本）
  const images = m.images?.map((i) => i.dataUrl).filter((x): x is string => !!x);
  return { role: m.role, content: m.content, ...(images && images.length ? { images } : {}) };
}

/** 记忆提取节流：每 3 次模型回复才触发一次，避免每轮都调一次小模型。 */
let extractCounter = 0;

/** 回复完成后的后台消化：模型提取记忆 + 到阈值时滚动摘要（fire-and-forget，失败静默）。 */
function autoDigest(): void {
  const conv = useChatStore.getState().conversation;
  if (!conv) return;
  const path = activePath(conv);

  extractCounter += 1;
  if (extractCounter % 3 === 0) {
    const recent = path.slice(-4);
    if (recent.length) {
      const text = recent
        .map((m) => `${m.role === 'user' ? '用户' : '小蓝莓'}：${m.content}`)
        .join('\n');
      void extractMemories(text).catch(() => {});
    }
  }

  if (path.length >= 16 && path.length % 8 === 0) {
    const endIdx = path.length - 9; // 保留最近 8 条不摘要
    if (endIdx > 0) void generateSummary(conv.id, path[0].id, path[endIdx].id).catch(() => {});
  }
}

function MenuAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg bg-muted/80 px-2.5 py-1.5 text-xs text-foreground/90 transition hover:bg-muted',
        danger && 'text-destructive',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** 贴图气泡：显示大贴图，未知贴图回退为 emoji 字符 */
function StickerBubble({ emoji }: { emoji: string }) {
  const img = resolveSticker(emoji);
  return img ? (
    <img src={img} alt="表情" draggable={false} className="h-24 w-24 select-none object-contain" />
  ) : (
    <span className="text-6xl leading-none">{emoji}</span>
  );
}

/** Claude 星形 Logo（陶土橙），近似 Claude.ai 的八芒星标志 */
function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g fill="currentColor">
        <path d="M12 1.6c.32 3.2.4 6.4 0 9.6-.4 3.2-.32 6.4 0 9.6.32-3.2.4-6.4 0-9.6-.4-3.2-.32-6.4 0-9.6Z" />
        <path d="M1.6 12c3.2.32 6.4.4 9.6 0 3.2-.4 6.4-.32 9.6 0-3.2.32-6.4.4-9.6 0-3.2-.4-6.4-.32-9.6 0Z" />
        <path d="M4.6 4.6c2.6 2.6 4.6 4.6 7.4 7.4 2.8 2.8 4.8 4.8 7.4 7.4-2.6-2.6-4.6-4.6-7.4-7.4-2.8-2.8-4.8-4.8-7.4-7.4Z" />
        <path d="M19.4 4.6c-2.6 2.6-4.6 4.6-7.4 7.4-2.8 2.8-4.8 4.8-7.4 7.4 2.6-2.6 4.6-4.6 7.4-7.4 2.8-2.8 4.8-4.8 7.4-7.4Z" />
      </g>
    </svg>
  );
}

/** 气泡下方的时间戳：HH:MM */
function fmtTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** 思考链入口胶囊：三个淡紫圆点（思考中弹动，完成后 ✓）+ 文案 + 箭头 */
function ThoughtEntry({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs text-muted-foreground transition hover:bg-card"
    >
      {active ? (
        <span className="flex items-center gap-1">
          <span className="think-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
          <span className="think-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
          <span className="think-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
        </span>
      ) : (
        <Check className="h-3.5 w-3.5 text-primary" />
      )}
      <span>思考过程</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

/** 思考链底部弹窗：占屏幕 1/3 高，只收顶边圆角，完整思维链文本 */
function ThoughtSheet({ reasoning, onClose }: { reasoning: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-border bg-popover p-4 shadow-2xl"
        style={{ height: '33.333vh', minHeight: 200 }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">思考过程</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{reasoning}</p>
        </div>
      </div>
    </div>
  );
}

/** 允许在 style 上写 CSS 变量（--xxx）的主题对象 */
type CSSVars = CSSProperties & Record<`--${string}`, string>;

/** 浅色配色（HSL）—— 微信风，跟随系统 prefers-color-scheme */
const LIGHT_VARS: CSSVars = {
  '--background': '0 0% 93%',
  '--foreground': '0 0% 10%',
  '--card': '0 0% 100%',
  '--card-foreground': '0 0% 10%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '0 0% 10%',
  '--primary': '255 92% 76%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '0 0% 90%',
  '--secondary-foreground': '0 0% 10%',
  '--muted': '0 0% 90%',
  '--muted-foreground': '0 0% 45%',
  '--accent': '0 0% 90%',
  '--accent-foreground': '0 0% 10%',
  '--destructive': '0 72% 51%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '0 0% 85%',
  '--input': '0 0% 85%',
  '--ring': '255 92% 76%',
  '--bubble-ai': '210 100% 89%',
  '--bubble-me': '0 0% 100%',
};

/** 深色配色（HSL）—— 纯黑底，跟随系统 */
const DARK_VARS: CSSVars = {
  '--background': '0 0% 0%',
  '--foreground': '235 235 235',
  '--card': '44 44 46',
  '--card-foreground': '235 235 235',
  '--popover': '44 44 46',
  '--popover-foreground': '235 235 235',
  '--primary': '255 92% 76%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '44 44 46',
  '--secondary-foreground': '235 235 235',
  '--muted': '44 44 46',
  '--muted-foreground': '150 150 150',
  '--accent': '44 44 46',
  '--accent-foreground': '235 235 235',
  '--destructive': '0 72% 51%',
  '--destructive-foreground': '0 0% 98%',
  '--border': '50 50 50',
  '--input': '50 50 50',
  '--ring': '255 92% 76%',
  '--bubble-ai': '240 2% 18%',
  '--bubble-me': '240 2% 23%',
};

/** 读取系统深浅色偏好（跟随设备，无手动切换） */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function ChatPage() {
  const navigate = useNavigate();
  const conversation = useChatStore((s) => s.conversation);
  const loaded = useChatStore((s) => s.loaded);
  const load = useChatStore((s) => s.load);
  const setActiveMessage = useChatStore((s) => s.setActiveMessage);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const finalizeMessage = useChatStore((s) => s.finalizeMessage);
  const removeSubtree = useChatStore((s) => s.removeSubtree);

  // 深浅色跟随系统（无手动切换）
  const dark = useSystemDark();
  const vars: CSSProperties = dark ? DARK_VARS : LIGHT_VARS;

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ confirmId: string; toolName: string; summary: string } | null>(
    null,
  );
  const [web, setWeb] = useState(true);
  const [stationId, setStationId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [vision, setVision] = useState<{ model: string | null } | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [thoughtReasoning, setThoughtReasoning] = useState<string | null>(null);
  const [memoAdded, setMemoAdded] = useState<
    Record<string, { id?: string; title: string; fromWho?: string; toWho?: string }[]>
  >({});
  // 预留：对方状态提示（后续接入经期/身体状态数据后由后端注入，前端这里预留展示位）
  const [partnerStateNote] = useState<string | null>(null);
  const [activeSkills, setActiveSkills] = useState<
    { id: string; name: string; slug: string; reason: string; confidence: number }[]
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const streamMsgRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getSettings()
      .then((s) => setVision({ model: s.visionModel ?? null }))
      .catch(() => {});
  }, []);

  // 输入变化时（防抖）预判当前会激活哪些技能，显示在输入框上方
  useEffect(() => {
    const q = input.trim();
    if (!q) {
      setActiveSkills([]);
      return;
    }
    const t = setTimeout(() => {
      matchSkills(q)
        .then((r) => setActiveSkills(r.matches))
        .catch(() => setActiveSkills([]));
    }, 400);
    return () => clearTimeout(t);
  }, [input]);

  const path = useMemo(() => (conversation ? activePath(conversation) : []), [conversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [path]);

  // 点菜单外任意处关闭
  useEffect(() => {
    if (!menuForId) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('[data-menu]')) setMenuForId(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuForId]);

  // 长按弹出菜单
  const startPress = (id: string) => {
    pressTimerRef.current = window.setTimeout(() => setMenuForId(id), 450);
  };
  const cancelPress = () => {
    if (pressTimerRef.current != null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const toggleMenu = (id: string) => setMenuForId((cur) => (cur === id ? null : id));
  const closeMenu = () => setMenuForId(null);

  const copyText = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
    } catch {
      /* ignore */
    }
  };

  // 生成回复：本地意图优先 → 模型流式。context 为模型所见线性历史（以 user 结尾）。
  const produceReply = async (
    userText: string,
    parentId: string,
    context: ChatPayloadMessage[],
  ) => {
    const local = matchLocalIntent(userText);
    if (local !== null) {
      await appendMessage({
        id: uid(),
        role: 'assistant',
        content: local,
        parentId,
        status: 'done',
        createdAt: Date.now(),
      });
      return;
    }

    const assistantId = uid();
    await appendMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      parentId,
      status: 'streaming',
      createdAt: Date.now(),
    });
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    streamMsgRef.current = assistantId;
    setToolStatus(null);

    const convId = useChatStore.getState().conversation?.id;
    const trimmed = context.length > 16 ? context.slice(-16) : context;
    let didSaveCourses = false;
    await streamChat(trimmed, {
      signal: controller.signal,
      conversationId: convId,
      model: model ?? undefined,
      stationId: stationId ?? undefined,
      web,
      onDelta: (delta) => {
        updateMessage(assistantId, (prev) => ({ content: prev.content + delta }));
      },
      onReasoning: (delta) => {
        updateMessage(assistantId, (prev) => ({ reasoning: (prev.reasoning ?? '') + delta }));
      },
      onToolCall: (name) => {
        if (name === 'save_courses') didSaveCourses = true;
        setToolStatus(
          name === 'web_search'
            ? '正在联网搜索…'
            : name === 'save_courses'
              ? '正在识别课表…'
              : `正在调用 ${name}…`,
        );
      },
      onMemoAdded: (id, title, fromWho, toWho) => {
        setMemoAdded((prev) => ({
          ...prev,
          [assistantId]: [...(prev[assistantId] ?? []), { id, title, fromWho, toWho }],
        }));
      },
      onNeedsConfirm: (confirmId, toolName, summary) => {
        setToolStatus(null);
        setConfirming({ confirmId, toolName, summary });
      },
      onDone: () => {
        setToolStatus(null);
        void finalizeMessage(assistantId, { status: 'done' });
      },
      onError: (msg) => {
        setToolStatus(null);
        const cur = useChatStore.getState().conversation?.messages.find((m) => m.id === assistantId);
        const content = (cur?.content ? cur.content + '\n\n' : '') + `⚠️ ${msg}`;
        void finalizeMessage(assistantId, { content, status: 'error' });
      },
    });

    // 图片识别已写入课程 → 同步课表
    if (didSaveCourses) void useTimetableStore.getState().reload();

    const cur = useChatStore.getState().conversation?.messages.find((m) => m.id === assistantId);
    if (cur?.status === 'streaming') {
      await finalizeMessage(assistantId, { status: 'done' });
    }

    abortRef.current = null;
    streamMsgRef.current = null;
    setBusy(false);

    // 阶段 6：回复完成后后台消化（提取记忆 + 到阈值滚动摘要）
    autoDigest();
  };

  // 选择图片 → 上传（读 base64 供模型/展示 + 落盘后端拿 URL）
  const pickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files).slice(0, 4)) {
      try {
        const img = await uploadImage(f);
        setPendingImages((prev) => [...prev, img]);
      } catch (e) {
        setToolStatus(`图片上传失败：${(e as Error).message}`);
        setTimeout(() => setToolStatus(null), 3000);
      }
    }
  };

  // 发图分流（仿 Operit）：配置了识图模型且当前模型不是它时，先用视觉模型把图转文字；否则直发图
  const describeIfNeeded = async (
    dataUrls: string[],
  ): Promise<{ text: string; direct: boolean }> => {
    const useVision = !!vision?.model && vision.model !== model;
    if (!useVision) return { text: '', direct: true };
    const parts = await Promise.all(
      dataUrls.map(async (d) => {
        try {
          return (await describeImage(d)).text.trim();
        } catch (e) {
          return `识图失败：${(e as Error).message}`;
        }
      }),
    );
    const valid = parts.filter(Boolean);
    return { text: valid.length ? `\n\n[图片内容]：${valid.join('；')}` : '', direct: false };
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || busy) return;
    setInput('');

    const conv = useChatStore.getState().conversation;
    if (!conv) return;

    // 若正在「回复某条」，就从那条分支；否则接在当前叶子后
    const parentId =
      replyToId && conv.messages.some((m) => m.id === replyToId)
        ? replyToId
        : conv.activeMessageId;
    // 识图分流：direct=true 直发图；否则图转文字、消息里只留 url 展示（不把 base64 给主模型）
    const dataUrls = pendingImages
      .map((i) => i.dataUrl ?? i.url)
      .filter((x): x is string => !!x);
    const { text: imgText, direct } = dataUrls.length
      ? await describeIfNeeded(dataUrls)
      : { text: '', direct: true };

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text + imgText,
      parentId,
      status: 'done',
      createdAt: Date.now(),
      images: pendingImages.length
        ? pendingImages.map((i) => (direct ? i : { ...i, dataUrl: undefined }))
        : undefined,
    };
    setPendingImages([]);
    await appendMessage(userMsg);
    setReplyToId(null);

    const base = parentId ? pathTo(conv, parentId).map(toPayload) : [];
    await produceReply(text, userMsg.id, [...base, toPayload(userMsg)]);
  };

  // 发送表情包：内置贴图只展示不触发回复；自定义图片贴图拉回 base64 发给模型，让模型看图接话
  const sendSticker = async (key: string) => {
    if (busy) return;
    const conv = useChatStore.getState().conversation;
    if (!conv) return;
    const isImageUrl = key.startsWith('/') || key.startsWith('http');

    // 内置 emoji：content 存 emoji，模型按文字理解，不主动回复
    if (!isImageUrl) {
      await appendMessage({
        id: uid(),
        role: 'user',
        content: key,
        parentId: conv.activeMessageId,
        status: 'done',
        sticker: key,
        createdAt: Date.now(),
      });
      return;
    }

    // 自定义图片贴图：拉回 base64，再按识图分流（直发图 or 转文字）
    let dataUrl: string | undefined;
    try {
      dataUrl = await urlToDataUrl(key);
    } catch (e) {
      setToolStatus(`表情包读取失败：${(e as Error).message}`);
      setTimeout(() => setToolStatus(null), 3000);
    }

    const { text: imgText, direct } = dataUrl
      ? await describeIfNeeded([dataUrl])
      : { text: '', direct: true };

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: '[表情包]' + imgText,
      parentId: conv.activeMessageId,
      status: 'done',
      sticker: key,
      createdAt: Date.now(),
      images: dataUrl ? [{ url: key, ...(direct ? { dataUrl } : {}) }] : undefined,
    };
    await appendMessage(userMsg);

    const base = conv.activeMessageId ? pathTo(conv, conv.activeMessageId).map(toPayload) : [];
    await produceReply('[表情包]', userMsg.id, [...base, toPayload(userMsg)]);
  };

  // 重新生成：为该 assistant 建 sibling（同 parentId），旧回复保留。
  const regenerate = async (assistantMsg: ChatMessage) => {
    if (busy || !conversation) return;
    const parentId = assistantMsg.parentId;
    if (!parentId) return;
    const parentMsg = conversation.messages.find((m) => m.id === parentId);
    if (!parentMsg) return;
    await produceReply(
      parentMsg.content,
      parentId,
      pathTo(conversation, parentId).map(toPayload),
    );
  };

  // 回滚到此处：从这条 user 消息重新生成回复（新分支，旧分支保留）。
  const rollback = async (userMsg: ChatMessage) => {
    if (busy || !conversation) return;
    await produceReply(
      userMsg.content,
      userMsg.id,
      pathTo(conversation, userMsg.id).map(toPayload),
    );
  };

  // 回复：从这条 assistant 消息往下开新分支，聚焦输入框。
  const startReply = (assistantMsg: ChatMessage) => {
    setReplyToId(assistantMsg.id);
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyToId(null);

  const startEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // 编辑：user 消息 = 就地改写 + 重新生成（编辑并重发）；assistant 消息 = 只改内容。
  const saveEdit = async (msg: ChatMessage) => {
    const text = editText.trim();
    if (!text || !conversation) return;
    setEditingId(null);
    setEditText('');

    await finalizeMessage(msg.id, { content: text });

    if (msg.role === 'assistant') return;

    const base = msg.parentId ? pathTo(conversation, msg.parentId).map(toPayload) : [];
    await produceReply(text, msg.id, [...base, { role: 'user', content: text }]);
  };

  // 分支切换：把 activeMessageId 指到相邻兄弟分支的叶子。
  const switchBranch = (msg: ChatMessage, direction: 1 | -1) => {
    if (!conversation) return;
    const siblings = msg.parentId
      ? childrenOf(conversation, msg.parentId)
      : conversation.messages.filter((x) => x.parentId === null);
    if (siblings.length <= 1) return;
    const curIdx = siblings.findIndex((s) => s.id === msg.id);
    if (curIdx < 0) return;
    const nextIdx = (curIdx + direction + siblings.length) % siblings.length;
    void setActiveMessage(leafOf(conversation, siblings[nextIdx].id));
  };

  const stop = () => {
    abortRef.current?.abort();
    if (streamMsgRef.current) {
      void finalizeMessage(streamMsgRef.current, { status: 'done' });
    }
    setToolStatus(null);
    setBusy(false);
  };

  const answerConfirm = async (decision: 'allow' | 'deny') => {
    if (!confirming) return;
    const id = confirming.confirmId;
    setConfirming(null);
    try {
      await confirmAgent(id, decision);
    } catch (e) {
      console.error(e);
    }
  };

  const showWelcome = !conversation || conversation.messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-background text-foreground" style={vars}>
      {/* 顶栏：抽屉 + Logo + 衬线标题 + 模型/联网/搜索/通话 */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="工具箱"
          title="插件 / 角色 / 世界书 / 工作区 / 技能"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
        >
          <Menu className="h-4 w-4" />
        </button>
        <ClaudeMark className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-center font-serif text-[15px] text-foreground">
          {conversation?.title ?? '小蓝莓'}
        </span>
        <ModelPicker
          stationId={stationId}
          model={model}
          onChange={(sid, m) => {
            setStationId(sid);
            setModel(m);
          }}
        />
        <button
          type="button"
          onClick={() => setWeb((v) => !v)}
          aria-label="联网"
          title="联网搜索"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
            web ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Globe className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="搜索记录"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCallOpen(true)}
          aria-label="语音通话"
          title="语音通话"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:text-foreground"
        >
          <Phone className="h-4 w-4" />
        </button>
      </div>

      {/* 消息列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-3xl space-y-6">
        {!loaded ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            加载中…
          </div>
        ) : showWelcome ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] text-sm leading-6 text-foreground/90">
              <Markdown>{WELCOME_TEXT}</Markdown>
            </div>
          </div>
        ) : (
          path.map((m) => {
            const siblings = m.parentId
              ? childrenOf(conversation!, m.parentId)
              : conversation!.messages.filter((x) => x.parentId === null);
            const showSwitch = siblings.length > 1;
            const myIdx = siblings.findIndex((s) => s.id === m.id);
            const isEditing = editingId === m.id;
            const menuOpen = menuForId === m.id;

            return (
              <div key={m.id} className="flex flex-col">
                {/* 消息行：微信式气泡（你=右侧，小蓝莓=左侧，带尖角指向头像） */}
                <div
                  className={cn(
                    'flex items-start gap-2',
                    m.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                  )}
                  {...(!isEditing
                    ? {
                        onPointerDown: () => startPress(m.id),
                        onPointerUp: cancelPress,
                        onPointerMove: cancelPress,
                        onPointerLeave: cancelPress,
                        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
                      }
                    : {})}
                >
                  {m.role === 'user' ? (
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <User className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <ClaudeMark className="h-5 w-5" />
                    </div>
                  )}
                  <div className={cn('flex min-w-0 max-w-[72%] flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                    {m.role === 'assistant' && m.reasoning && (
                      <ThoughtEntry
                        active={m.status === 'streaming' && !m.content}
                        onClick={() => setThoughtReasoning(m.reasoning ?? '')}
                      />
                    )}
                    <div
                      className={cn(
                        'relative text-sm leading-6',
                        !isEditing && 'select-none',
                        m.role === 'user'
                          ? 'whitespace-pre-wrap rounded-xl rounded-tr-[4px] border border-border/60 bg-[hsl(var(--bubble-me))] px-3 py-2 text-foreground shadow-sm'
                          : 'rounded-xl rounded-tl-[4px] bg-[hsl(var(--bubble-ai))] px-3 py-2 text-foreground shadow-sm',
                        m.sticker && 'bg-transparent p-0 shadow-none',
                      )}
                    >
                      {!m.sticker && (
                        <span
                          className={
                            m.role === 'user' ? 'bubble-tail bubble-tail--me' : 'bubble-tail bubble-tail--ai'
                          }
                        />
                      )}
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                          rows={3}
                          className="w-full resize-none select-text rounded-lg bg-background/60 px-2 py-1 text-sm text-foreground outline-none"
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            aria-label="取消编辑"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEdit(m)}
                            aria-label="保存编辑"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : m.role === 'assistant' ? (
                      <>
                        {m.status === 'streaming' && !m.content && !m.reasoning && (
                          <span className="text-muted-foreground">思考中…</span>
                        )}
                        {m.content && <Markdown>{m.content}</Markdown>}
                      </>
                    ) : m.sticker ? (
                      <StickerBubble emoji={m.sticker} />
                    ) : (
                      <>
                        {m.images && m.images.length > 0 && (
                          <div className="mb-1.5 flex flex-wrap gap-1.5">
                            {m.images.map((img, i) => (
                              <img
                                key={i}
                                src={img.dataUrl ?? img.url}
                                alt={img.name ?? '图片'}
                                className="max-h-44 max-w-full rounded-lg object-cover"
                              />
                            ))}
                          </div>
                        )}
                        {m.content}
                      </>
                    )}
                    </div>
                    <span className="mt-1 text-[10px] text-muted-foreground/60">{fmtTime(m.createdAt)}</span>
                  </div>
                </div>

                {/* 已记入备忘录提示 */}
                {m.role === 'assistant' && (memoAdded[m.id]?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-11">
                    {memoAdded[m.id].map((mm, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => navigate(mm.id ? `/memo?highlight=${mm.id}` : '/memo')}
                        title="查看备忘录"
                        className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary transition hover:bg-primary/20"
                      >
                        {!mm.toWho ? (
                          <>📝 已记入备忘录：{mm.title}</>
                        ) : mm.fromWho && mm.fromWho !== mm.toWho ? (
                          <>
                            📝 {mm.fromWho}为<span className="font-medium">{mm.toWho}</span>记下：
                            <span className="text-pink-500">{mm.title}</span>
                          </>
                        ) : (
                          <>
                            📝 已为<span className="font-medium">{mm.toWho}</span>记下：
                            <span className="text-pink-500">{mm.title}</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* 气泡下方：分支切换 + ⋯ */}
                <div
                  className={cn(
                    'mt-1 flex items-center gap-1.5',
                    m.role === 'user' ? 'justify-end pr-11' : 'pl-11',
                  )}
                >
                  {showSwitch && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <button
                        type="button"
                        onClick={() => switchBranch(m, -1)}
                        aria-label="上一个分支"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="min-w-7 text-center">
                        {myIdx + 1}/{siblings.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => switchBranch(m, 1)}
                        aria-label="下一个分支"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    data-menu
                    onClick={() => toggleMenu(m.id)}
                    aria-label="更多操作"
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition hover:bg-muted hover:text-foreground"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* 长按 / ⋯ 弹出的操作菜单 */}
                {menuOpen && (
                  <div
                    data-menu
                    className={cn(
                      'mt-1 flex flex-wrap gap-1.5',
                      m.role === 'user' ? 'justify-end pr-11' : 'pl-11',
                    )}
                  >
                    <MenuAction
                      icon={<Copy className="h-3.5 w-3.5" />}
                      label="复制"
                      onClick={() => {
                        closeMenu();
                        void copyText(m);
                      }}
                    />
                    {m.role === 'user' ? (
                      <>
                        <MenuAction
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          label="编辑并重发"
                          onClick={() => {
                            closeMenu();
                            startEdit(m);
                          }}
                        />
                        <MenuAction
                          icon={<Undo2 className="h-3.5 w-3.5" />}
                          label="回滚到此处"
                          onClick={() => {
                            closeMenu();
                            void rollback(m);
                          }}
                        />
                      </>
                    ) : m.status !== 'streaming' ? (
                      <>
                        <MenuAction
                          icon={<Reply className="h-3.5 w-3.5" />}
                          label="回复"
                          onClick={() => {
                            closeMenu();
                            startReply(m);
                          }}
                        />
                        <MenuAction
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          label="编辑"
                          onClick={() => {
                            closeMenu();
                            startEdit(m);
                          }}
                        />
                        <MenuAction
                          icon={<RefreshCw className="h-3.5 w-3.5" />}
                          label="重新生成"
                          onClick={() => {
                            closeMenu();
                            void regenerate(m);
                          }}
                        />
                      </>
                    ) : null}
                    <MenuAction
                      danger
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      label="删除"
                      onClick={() => {
                        closeMenu();
                        void removeSubtree(m.id);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入框（Claude 深色） */}
      <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3">
        {partnerStateNote && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300">
            {partnerStateNote}
          </div>
        )}
        {activeSkills.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {activeSkills.map((s) => (
              <span
                key={s.id}
                title={`触发：${s.reason}`}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
              >
                {s.name}
              </span>
            ))}
          </div>
        )}
        {toolStatus && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 animate-pulse" />
            <span>{toolStatus}</span>
          </div>
        )}
        {replyToId && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <span className="flex-1 truncate">正在回复这条消息…</span>
            <button
              type="button"
              onClick={cancelReply}
              aria-label="取消回复"
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {pendingImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.dataUrl} alt={img.name ?? '待发图片'} className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="移除图片"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {confirming && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground/90">
            <span className="min-w-0 flex-1 truncate">⏸ 需要确认：{confirming.summary}</span>
            <button
              type="button"
              onClick={() => void answerConfirm('allow')}
              className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              <Check className="h-3 w-3" /> 允许
            </button>
            <button
              type="button"
              onClick={() => void answerConfirm('deny')}
              className="flex shrink-0 items-center gap-1 rounded-md bg-card px-2 py-1 text-xs text-foreground/80"
            >
              <X className="h-3 w-3" /> 拒绝
            </button>
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 transition-colors focus-within:border-primary">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => {
                void pickImages(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && send()}
              placeholder={replyToId ? '回复这条消息…' : ''}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="button"
              onClick={busy ? stop : send}
              aria-label={busy ? '停止' : '发送'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
            >
              {busy ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* 微信式全屏搜索 */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChatDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* 表情包面板 */}
      {stickerOpen && (
        <StickerPanel
          onPick={(emoji) => {
            setStickerOpen(false);
            void sendSticker(emoji);
          }}
          onClose={() => setStickerOpen(false)}
        />
      )}

      {/* 语音通话（占位界面，后续接 WebRTC） */}
      {callOpen && <CallOverlay name="哥哥" onClose={() => setCallOpen(false)} />}

      {/* 思考链底部弹窗 */}
      {thoughtReasoning !== null && (
        <ThoughtSheet reasoning={thoughtReasoning} onClose={() => setThoughtReasoning(null)} />
      )}
    </div>
  );
}

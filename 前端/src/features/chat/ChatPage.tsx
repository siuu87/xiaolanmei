import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUp,
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
  Puzzle,
  Globe,
  Phone,
  User,
  Plus,
  Image,
  Camera,
  FileText,
  Smile,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { matchLocalIntent } from './assistant';
import { streamChat, type ChatPayloadMessage } from '@/lib/api/chatStream';
import { buildSupportContext } from '@/features/tavern/phone/datacore/contextBridge';
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
import { useShellStore } from '@/stores/shellStore';
import { useProfileStore } from '@/stores/profileStore';
import { loveDays } from '@/features/shell/loveDays';

/**
 * 顶栏右侧连接指示器：只给一个 6px 小灯，不占宽度。
 * 绿=模型通道正常，黄=检测/重连中，红=不可达；点一下立即重探。
 */
function ConnDot() {
  const [state, setState] = useState<'probing' | 'ok' | 'bad'>('probing');

  const probe = async () => {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch('/api/chat/health', { signal: ctrl.signal });
      window.clearTimeout(t);
      setState(res.ok ? 'ok' : 'bad');
    } catch {
      setState('bad');
    }
  };

  useEffect(() => {
    setState('probing');
    void probe();
    const timer = window.setInterval(() => void probe(), 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color =
    state === 'ok' ? 'bg-emerald-400' : state === 'probing' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500';

  return (
    <button
      type="button"
      onClick={() => void probe()}
      aria-label="连接状态"
      title={state === 'ok' ? '模型通道正常 · 点击重探' : state === 'probing' ? '检测中…' : '通道不可达 · 点击重探'}
      data-testid="conn-dot"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/[0.08]"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
    </button>
  );
}

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
        'flex items-center gap-1.5 rounded-full bg-[#1c2338] px-2.5 py-1.5 text-xs text-[#c3cad9] transition hover:bg-[#2a3350]',
        danger && 'text-[#FF3B30]',
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

/** 气泡前的圆形头像（iMessage 风格）：你=灰色，小蓝莓=蓝色 */
function BubbleAvatar({ mine }: { mine: boolean }) {
  return (
    <span
      className={cn(
        'mb-[18px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white',
        mine ? 'bg-[#8e8e93]' : 'bg-[#007AFF]',
      )}
    >
      {mine ? <User className="h-4 w-4" /> : <ClaudeMark className="h-4 w-4" />}
    </span>
  );
}

/** 气泡下方的时间戳：HH:MM */
function fmtTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** 居中日期分隔文案：今天 / 昨天 / M月D日 / YYYY年M月D日 */
function fmtDateLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDay = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (diffDay === 0) return '今天';
  if (diffDay === 1) return '昨天';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 两条消息是否同一天（决定是否插入日期分隔） */
function isSameDay(a?: number, b?: number): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** iMessage 时间：上午/下午 h:mm */
function fmtClock(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const h = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${h < 12 ? '上午' : '下午'}${h % 12 === 0 ? 12 : h % 12}:${mm}`;
}

/** 思考链入口胶囊：三个圆点（思考中弹动，完成后 ✓）+ 文案 */
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
      <span>Thought process</span>
    </button>
  );
}

/** Claude 风「Thought process」弹窗：白色大圆角卡片 + 半透明灰蒙版 + 左上角黑色× */
function ThoughtModal({ reasoning, onClose }: { reasoning: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[72vh] w-full max-w-md flex-col rounded-3xl bg-[#141a2b] p-5 shadow-2xl">
        <div className="relative mb-4 flex items-center justify-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute left-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#e8ecf6] transition hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold text-[#e8ecf6]">Thought process</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">{reasoning}</p>
        </div>
      </div>
    </div>
  );
}

/** 附件面板里的单个入口（图标 + 文案） */
function AttachButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs text-[#c3cad9] transition hover:bg-[#1c2338]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1c2338] text-[#7aa2ff]">{icon}</span>
      <span>{label}</span>
    </button>
  );
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

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // 工具箱改由外壳 store 控制：顶栏汉堡让位给主抽屉，工具箱入口搬进抽屉里
  const toolboxOpen = useShellStore((s) => s.toolboxOpen);
  const closeToolbox = useShellStore((s) => s.closeToolbox);
  const openDrawer = useShellStore((s) => s.openDrawer);
  const openToolbox = useShellStore((s) => s.openToolbox);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const loveDayCount = useMemo(() => loveDays(), []);
  const [confirming, setConfirming] = useState<{ confirmId: string; toolName: string; summary: string } | null>(
    null,
  );
  const [web] = useState(true);
  const [stationId, setStationId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [vision, setVision] = useState<{ model: string | null } | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [thoughtReasoning, setThoughtReasoning] = useState<string | null>(null);
  const [memoAdded, setMemoAdded] = useState<
    Record<string, { id?: string; title: string; fromWho?: string; toWho?: string }[]>
  >({});
  const [activeSkills, setActiveSkills] = useState<
    { id: string; name: string; slug: string; reason: string; confidence: number }[]
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const streamMsgRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileDocRef = useRef<HTMLInputElement>(null);
  const pressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 组件卸载（如切换到其它 Tab）时中止进行中的流，避免卸载后继续 setState
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

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

  // 平滑贴底：新消息 / 流式内容增长时都跟到底部（仅当用户已在底部附近，避免打断上翻阅读）
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 200;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [path, path[path.length - 1]?.content]);

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
    /**
     * 主角 AI 看得见小手机里的记录：把「中枢 / 主角可见」那段上下文作为 system 消息拼在最前面。
     * 哪些来源参与、每个来源取几条、总字符预算，都沿用中枢里那份配置（我页的数据中枢是同一份），
     * 所以开关在那一处改，这里立刻生效。构建失败也不影响正常聊天。
     */
    let payload: ChatPayloadMessage[] = trimmed;
    try {
      const support = buildSupportContext();
      if (support.text) payload = [{ role: 'system', content: support.text }, ...trimmed];
    } catch {
      /* 读不到就照常聊 */
    }
    let didSaveCourses = false;
    await streamChat(payload, {
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

  // 选择文件：图片走图片上传，其他类型暂不支持
  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files).slice(0, 4)) {
      if (f.type.startsWith('image/')) {
        try {
          const img = await uploadImage(f);
          setPendingImages((prev) => [...prev, img]);
        } catch (e) {
          setToolStatus(`图片上传失败：${(e as Error).message}`);
          setTimeout(() => setToolStatus(null), 3000);
        }
      } else {
        setToolStatus('暂不支持发送该类型文件');
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
    <div className="flex h-full flex-col bg-[#0b1020] text-[#e8ecf6]">
      {/* 顶栏（午夜深蓝 + 毛玻璃）：左汉堡→主抽屉 / 中标题+伴侣状态槽 / 右连接指示+模型搜索通话 */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.08] bg-[#111726]/90 px-3 py-2.5 backdrop-blur">
        {/* 移动端：汉堡 → 主抽屉（桌面有左侧常驻栏，不给重复入口） */}
        <button
          type="button"
          onClick={openDrawer}
          aria-label="打开菜单"
          title="菜单"
          data-testid="chat-hamburger"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a8b0c4] transition active:bg-white/10 hover:bg-white/[0.08] hover:text-white md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {/* 桌面端：抽屉不生效，工具箱得留个直接入口，否则功能失联 */}
        <button
          type="button"
          onClick={openToolbox}
          aria-label="工具箱"
          title="插件 / 角色 / 世界书 / 工作区 / 技能"
          data-testid="chat-toolbox-desktop"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a8b0c4] transition hover:bg-white/[0.08] hover:text-white md:flex"
        >
          <Puzzle className="h-4 w-4" />
        </button>
        {/* 中间状态槽：会话标题 + 伴侣挂件（TA 头像 + 在一起天数） */}
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          <span
            data-testid="chat-title"
            className="min-w-0 truncate font-serif text-[15px] font-semibold text-[#e8ecf6]"
          >
            {conversation?.title ?? '小蓝莓'}
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-black/25 px-1.5 py-0.5 text-[10px] text-[#8b93a7] sm:flex">
            <span aria-hidden>{partnerAvatar}</span>
            <span>在一起 {loveDayCount} 天</span>
          </span>
        </span>
        <ConnDot />
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
          onClick={() => setSearchOpen(true)}
          aria-label="搜索记录"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#7aa2ff] transition active:bg-white/10"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCallOpen(true)}
          aria-label="语音通话"
          title="语音通话"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#7aa2ff] transition active:bg-white/10"
        >
          <Phone className="h-4 w-4" />
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#0b1020] px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
        {!loaded ? (
          <div className="flex items-center justify-center py-20 text-sm text-[#7a8299]">
            加载中…
          </div>
        ) : showWelcome ? (
          <>
            {/* 顶部居中时间戳 */}
            <div className="pb-3 text-center text-[11px] text-[#7a8299]">{fmtClock(Date.now())}</div>
            <div className="flex items-end gap-2">
              <BubbleAvatar mine={false} />
              <div
                className="max-w-[78%] rounded-[20px] rounded-bl-[6px] bg-[#1c2338] px-3.5 py-2.5 text-[15px] leading-6 text-[#e8ecf6]"
                style={{ '--foreground': '30 12% 20%', '--muted-foreground': '30 8% 42%' } as React.CSSProperties}
              >
                <Markdown>{WELCOME_TEXT}</Markdown>
              </div>
            </div>
          </>
        ) : (
          <>
          {/* 顶部居中时间戳 */}
          <div className="pb-3 text-center text-[11px] text-[#7a8299]">{fmtClock(path[0]?.createdAt)}</div>
          {path.map((m, i) => {
            // 跨天时在气泡之间插入居中日期分隔
            const prev = i > 0 ? path[i - 1] : null;
            const needDate = !prev || !isSameDay(prev.createdAt, m.createdAt);
            const siblings = m.parentId
              ? childrenOf(conversation!, m.parentId)
              : conversation!.messages.filter((x) => x.parentId === null);
            const showSwitch = siblings.length > 1;
            const myIdx = siblings.findIndex((s) => s.id === m.id);
            const isEditing = editingId === m.id;
            const menuOpen = menuForId === m.id;

            return (
              <div key={m.id} className="flex flex-col">
                {/* 跨天：气泡之间的居中日期分隔 */}
                {needDate && (
                  <div className="py-3 text-center text-[11px] font-medium text-[#7a8299]">
                    {fmtDateLabel(m.createdAt)}
                  </div>
                )}
                {/* 消息行（iMessage）：你=右侧蓝底，小蓝莓=左侧灰底，大圆角 + 小尖角 */}
                <div
                  className={cn(
                    'mb-2 flex items-end gap-2',
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
                  <BubbleAvatar mine={m.role === 'user'} />
                  <div className={cn('flex min-w-0 max-w-[78%] flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                    {m.role === 'assistant' && m.reasoning && (
                      <ThoughtEntry
                        active={m.status === 'streaming' && !m.content}
                        onClick={() => setThoughtReasoning(m.reasoning ?? '')}
                      />
                    )}
                    <div
                      className={cn(
                        'text-[15px] leading-6',
                        !isEditing && 'select-none',
                        m.role === 'user'
                          // 己方：蓝底白字，大圆角 + 右下小尖角
                          ? 'whitespace-pre-wrap rounded-[20px] rounded-br-[6px] bg-[#007AFF] px-3.5 py-2.5 text-white'
                          // 对方：浅灰底深色字，大圆角 + 左下小尖角
                          : 'rounded-[20px] rounded-bl-[6px] bg-[#1c2338] px-3.5 py-2.5 text-[#e8ecf6]',
                        m.sticker && 'bg-transparent p-0',
                        // 错误仍保持「浅灰底」规范，仅用深红字提示
                        m.status === 'error' && m.role === 'assistant' && 'text-[#c0392b]',
                      )}
                      // 气泡内局部覆盖主题变量：App 为深色主题（--foreground 是浅色），
                      // 若不在气泡内改回深/白字，Markdown 渲染的正文会在浅底上看不清。
                      style={
                        m.sticker
                          ? undefined
                          : m.role === 'user'
                            ? ({ '--foreground': '0 0% 100%', '--muted-foreground': '0 0% 88%' } as React.CSSProperties)
                            : ({ '--foreground': '30 12% 20%', '--muted-foreground': '30 8% 42%' } as React.CSSProperties)
                      }
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            autoFocus
                            rows={3}
                            className={cn(
                              'w-full resize-none select-text rounded-lg px-2 py-1 text-[15px] outline-none',
                              m.role === 'user' ? 'bg-white/20 text-white' : 'bg-[#1c2338] text-[#e8ecf6]',
                            )}
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              aria-label="取消编辑"
                              className={cn(
                                'flex h-6 w-6 items-center justify-center rounded-md',
                                m.role === 'user' ? 'text-white/80 hover:bg-white/20' : 'text-white/50 hover:bg-white/10',
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveEdit(m)}
                              aria-label="保存编辑"
                              className={cn(
                                'flex h-6 w-6 items-center justify-center rounded-md',
                                m.role === 'user' ? 'text-white/80 hover:bg-white/20' : 'text-white/50 hover:bg-white/10',
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : m.role === 'assistant' ? (
                        <>
                          {m.status === 'streaming' && !m.content && !m.reasoning && (
                            <span className="text-[#7a8299]">思考中…</span>
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
                    <span className={cn('mt-1 text-[10px] leading-none text-[#7a8299]', m.role === 'user' ? 'pr-1' : 'pl-1')}>{fmtTime(m.createdAt)}</span>
                  </div>
                </div>

                {/* 已记入备忘录提示 */}
                {m.role === 'assistant' && (memoAdded[m.id]?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-10">
                    {memoAdded[m.id].map((mm, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => navigate(mm.id ? `/memo?highlight=${mm.id}` : '/memo')}
                        title="查看备忘录"
                        className="flex items-center gap-1 rounded-full bg-[#007AFF]/10 px-2 py-0.5 text-[11px] text-[#7aa2ff] transition hover:bg-[#007AFF]/20"
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
                    m.role === 'user' ? 'justify-end pr-10' : 'pl-10',
                  )}
                >
                  {showSwitch && (
                    <div className="flex items-center gap-1 text-[10px] text-[#7a8299]">
                      <button
                        type="button"
                        onClick={() => switchBranch(m, -1)}
                        aria-label="上一个分支"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/10"
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
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/10"
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
                    className="flex h-5 w-5 items-center justify-center rounded text-[#7a8299] transition hover:bg-white/10 hover:text-white"
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
                      m.role === 'user' ? 'justify-end pr-10' : 'pl-10',
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
          })}
          </>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入区（iMessage 浅色胶囊） */}
      <div className="shrink-0 border-t border-white/[0.08] bg-[#111726] px-4 pb-4 pt-3">
        {activeSkills.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {activeSkills.map((s) => (
              <span
                key={s.id}
                title={`触发：${s.reason}`}
                className="flex items-center gap-1 rounded-full bg-[#007AFF]/10 px-2 py-0.5 text-[11px] text-[#7aa2ff]"
              >
                {s.name}
              </span>
            ))}
          </div>
        )}
        {toolStatus && (
          <div className="mb-2 flex items-center gap-2 rounded-full bg-[#1c2338] px-3 py-1.5 text-xs text-[#c3cad9]">
            <Globe className="h-3.5 w-3.5 animate-pulse" />
            <span className="truncate">{toolStatus}</span>
          </div>
        )}
        {replyToId && (
          <div className="mb-2 flex items-center gap-2 rounded-full bg-[#1c2338] px-3 py-1.5 text-xs text-[#c3cad9]">
            <span className="flex-1 truncate">正在回复这条消息…</span>
            <button
              type="button"
              onClick={cancelReply}
              aria-label="取消回复"
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/10"
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
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#8e8e93] text-white shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {confirming && (
          <div className="mb-2 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[#c3cad9]">
            <span className="min-w-0 flex-1 truncate">⏸ 需要确认：{confirming.summary}</span>
            <button
              type="button"
              onClick={() => void answerConfirm('allow')}
              className="flex shrink-0 items-center gap-1 rounded-full bg-[#007AFF] px-2 py-1 text-xs text-white"
            >
              <Check className="h-3 w-3" /> 允许
            </button>
            <button
              type="button"
              onClick={() => void answerConfirm('deny')}
              className="flex shrink-0 items-center gap-1 rounded-full bg-[#1c2338] px-2 py-1 text-xs text-[#c3cad9]"
            >
              <X className="h-3 w-3" /> 拒绝
            </button>
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl">
          {attachOpen && (
            <div className="mb-2 grid grid-cols-4 gap-1 rounded-2xl border border-white/[0.08] bg-[#141a2b] p-2 shadow-lg">
              <AttachButton
                icon={<Image className="h-5 w-5" />}
                label="图片"
                onClick={() => fileRef.current?.click()}
              />
              <AttachButton
                icon={<Camera className="h-5 w-5" />}
                label="拍照"
                onClick={() => cameraRef.current?.click()}
              />
              <AttachButton
                icon={<FileText className="h-5 w-5" />}
                label="文件"
                onClick={() => fileDocRef.current?.click()}
              />
              <AttachButton
                icon={<Smile className="h-5 w-5" />}
                label="表情包"
                onClick={() => {
                  setAttachOpen(false);
                  setStickerOpen(true);
                }}
              />
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              aria-label="添加附件"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[#7a8299] transition active:bg-white/10"
            >
              <Plus className="h-5 w-5" />
            </button>
            {/* 输入胶囊 */}
            <div className="flex min-h-[34px] min-w-0 flex-1 items-center gap-2 rounded-[18px] border border-white/[0.12] bg-[#1c2338] px-3 py-1 transition-colors focus-within:border-[#7aa2ff]/60">
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
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  void pickImages(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={fileDocRef}
                type="file"
                accept="*/*"
                hidden
                onChange={(e) => {
                  void pickFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // 输入法合成中按回车是确认候选词，不应触发发送
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter' && !busy) void send();
                }}
                placeholder={replyToId ? '回复这条消息…' : 'iMessage'}
                className="h-8 min-w-0 flex-1 bg-transparent text-[16px] text-[#e8ecf6] outline-none placeholder:text-[#7a8299]"
              />
              {/* 发送 / 停止：蓝色圆形按钮（iMessage 风格） */}
              <button
                type="button"
                onClick={busy ? stop : send}
                aria-label={busy ? '停止' : '发送'}
                disabled={!busy && !input.trim() && pendingImages.length === 0}
                className={cn(
                  'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white transition active:scale-95',
                  'disabled:bg-[#C7C7CC]',
                )}
              >
                {busy ? (
                  <span className="block h-[11px] w-[11px] rounded-[2px] bg-current" />
                ) : (
                  <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.6} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 微信式全屏搜索 */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChatDrawer open={toolboxOpen} onClose={closeToolbox} />

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

      {/* 思考链弹窗 */}
      {thoughtReasoning !== null && (
        <ThoughtModal reasoning={thoughtReasoning} onClose={() => setThoughtReasoning(null)} />
      )}
    </div>
  );
}

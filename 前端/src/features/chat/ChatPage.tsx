import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Trash2,
  Pencil,
  RefreshCw,
  Undo2,
  Reply,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Copy,
  Menu,
  MessageSquare,
  MessagesSquare,
  Globe,
  Phone,
  Plus,
  Image,
  Camera,
  FileText,
  Smile,
  Mic,
  Play,
  Pause,
  Download,
  Quote,
  Radio,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useGoodnightStore } from '@/stores/goodnightStore';
import { matchLocalIntent } from './assistant';
import { PhotoStack } from '@/components/PhotoStack';
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
import { AvatarContent } from '@/components/AvatarContent';
import { CaptionView } from '@/components/VoiceCaption';
import { useVoiceCaption } from '@/lib/caption/useVoiceCaption';
import { useSpeechRecognition } from '@/lib/useSpeechRecognition';
import { SearchOverlay } from './SearchOverlay';
import { HEALTH_TEXT, useModelHealth } from './modelHealth';
import { ModelPicker } from './ModelPicker';
import { StickerPanel } from './StickerPanel';
import { MoodPopover } from './MoodPopover';
import { ChatSheet } from './ChatSheet';
import { CallOverlay, type CallResult } from './CallOverlay';
import { CallDetailSheet } from './CallDetailSheet';
import { PaiVoiceOverlay } from './PaiVoiceOverlay';
import { useCallSession, triggerIncomingCall } from './callSession';
import { callStatusWord, type CallKind } from '@/lib/api/calls';
import { InAppBrowser } from './InAppBrowser';
import { resolveSticker } from './stickers';
import { useTimetableStore } from '@/features/schedule/timetableStore';
import { useShellStore } from '@/stores/shellStore';
import { useProfileStore } from '@/stores/profileStore';
import { useChatStyle, CHAT_STYLE_META, CHAT_STYLE_STORAGE_KEY } from '@/stores/chatStyleStore';
import { useDietStore } from '@/features/diet/dietStore';
import { matchDietHits } from '@/features/diet/dietHits';
import { DietHitBar } from '@/features/diet/DietBadge';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * 顶栏右侧连接指示器：只给一个 6px 小灯，不占宽度。
 * 绿=模型通道正常，黄=检测/重连中，红=不可达。
 *
 * **2026-10-17 起点击不再重探，改为打开「白起的内心与记忆中枢」。**
 * 手动重探挪进了面板（右上角那颗同样的灯 + 状态文字）。
 * 这样语义才不混：小灯仍然只是「通道可见性」的指示器，点它是「进去看看他」。
 * 状态改由 `modelHealth` 模块单例托管 —— 面板和这里读的是同一份，不会两个轮询各打一次。
 */
function ConnDot() {
  const state = useModelHealth();

  const color =
    state === 'ok' ? 'bg-emerald-400' : state === 'probing' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500';

  /**
   * 2026-10-18 用户要求：这盏灯从顶栏最右侧挪到**聊天名字旁边**，
   * 连「打开内心与记忆中枢」的动作一起交给标题按钮（见顶栏那段）。
   * 所以这里只是个状态指示器，不再是按钮 —— 按钮套按钮是非法 DOM，
   * 点击由外层 `<button data-testid="chat-title-btn">` 统一接管。
   */
  return (
    <span
      data-testid="conn-dot"
      role="img"
      aria-label="内心"
      title={HEALTH_TEXT[state]}
      className="inline-flex shrink-0 items-center justify-center"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
    </span>
  );
}

const WELCOME_TEXT =
  '我是小蓝莓 🫐 可以陪你聊天，也能帮你管理待办、经期和日记。\n\n试试：\n· 「添加待办：买牛奶」\n· 「来了」记经期\n· 「记日记：今天……」写进日记本\n· 或者随便聊聊';

function toPayload(m: ChatMessage): ChatPayloadMessage {
  // 只把内存里的 base64 data URL 发给模型（重载后的消息没有 dataUrl，退化纯文本）
  const images = m.images?.map((i) => i.dataUrl).filter((x): x is string => !!x);
  return {
    role: m.role,
    content: m.content,
    // 后端用它在送模型前渲染 [时间 · 间隔]；messageTimestamps 会剥离旧前缀，幂等
    createdAt: m.createdAt,
    ...(images && images.length ? { images } : {}),
  };
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

/**
 * 微信式长按菜单：一块**深色小浮层**，贴着被长按的那条消息弹出（2026-10-18 用户要求
 * 「类似微信长按消息的那个样子」）。
 *
 * 几个刻意为之的细节：
 * - **不铺满屏**：宽度固定 184，只包住菜单本身；外面是一层透明背板，点一下就关。
 * - **上下自动翻面**：消息上方空间够就往上弹（默认，微信也是往上），否则翻到下方，
 *   两边的「小尖角」跟着换边，让人一眼看出这块菜单属于哪条消息。
 * - **横向钳制**：靠近屏幕边缘时菜单会往里推，不会溢出屏幕。
 * - 深色底是写死的 `#4c4c4c`（和微信一致），深浅主题下都保持这个观感 —— 这是全站少数
 *   「故意不走 token」的地方，跟聊天气泡那种跟随主题的规则不冲突。
 */
function MessageMenu({
  anchor,
  onClose,
  children,
}: {
  anchor: { top: number; bottom: number; left: number; width: number } | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const W = 184;
  const GAP = 9;
  const vw = typeof window === 'undefined' ? 420 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;

  // 没有锚点（理论上不会发生）就退回屏幕中央，至少别把菜单丢掉
  const a = anchor ?? { top: vh / 2, bottom: vh / 2, left: vw / 2 - W / 2, width: W };
  const centerX = a.left + a.width / 2;
  const left = Math.min(Math.max(8, centerX - W / 2), Math.max(8, vw - W - 8));
  const placeAbove = a.top > 220;
  const pos: React.CSSProperties = placeAbove
    ? { left, bottom: vh - a.top + GAP, width: W }
    : { left, top: a.bottom + GAP, width: W };

  return createPortal(
    <div data-testid="msg-menu-layer" className="fixed inset-0 z-[1400]" onClick={onClose}>
      <div
        data-testid="msg-menu"
        data-menu
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={pos}
        className="animate-bb-pop fixed max-h-[62vh] overflow-y-auto overscroll-contain rounded-[16px] border border-chat-line/70 bg-popover py-1.5 text-popover-foreground shadow-[0_14px_34px_-18px_hsl(var(--shadow-color)/0.35)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 消息操作菜单里的一行：深色底上的白字 + 图标（微信长按菜单那套观感）。
 * 只在 `MessageMenu` 里用。
 */
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
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] transition',
        'hover:bg-surface-2 active:bg-surface-3',
        danger ? 'text-destructive' : 'text-popover-foreground',
      )}
    >
      <span className={cn('shrink-0', danger ? 'text-destructive' : 'text-muted-foreground')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
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

/**
 * 气泡外侧的时间（设计稿：对方在气泡右边、我方在气泡左边，贴着底部）。
 *
 * 只显示 `H:MM` —— 日期已经由跨天分隔线交代，气泡旁再挂一遍 `MM/DD HH:MM`
 * 会把留白挤没；这也是原稿里「8:06」那种轻量写法。
 */
function InlineStamp({ ts }: { ts?: number }) {
  const d = ts ? new Date(ts) : null;
  if (!d) return null;
  return (
    <span
      data-testid="msg-stamp"
      className="shrink-0 self-end pb-1.5 text-[11px] tabular-nums text-chat-meta"
    >
      {`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`}
    </span>
  );
}

/**
 * 对方气泡上方那行小字：「〉哥哥想说」。
 *
 * 原稿里每条 AI 消息组的第一条上方都有这行（不是头像），
 * 流式期间换成「哥哥在想」+ 三个跳点；有思考链时整行可点开下弹窗。
 */
function SenderLabel({
  name,
  thinking,
  onClick,
  testid,
}: {
  name: string;
  thinking?: boolean;
  onClick?: () => void;
  testid?: string;
}) {
  const inner = (
    <>
      <span aria-hidden className="text-chat-meta/80">
        〉
      </span>
      <span>{`${name}${thinking ? '在想' : '想说'}`}</span>
      {thinking ? (
        <span className="ml-0.5 flex items-center gap-[3px]">
          <span className="think-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '0ms' }} />
          <span className="think-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '150ms' }} />
          <span className="think-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '300ms' }} />
        </span>
      ) : null}
    </>
  );

  const cls = 'flex items-center gap-1 pb-1.5 pl-1 pr-1 text-[11px] leading-none text-chat-meta';

  if (!onClick) {
    return (
      <span data-testid={testid} className={cls}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      title={thinking ? `${name}正在想，点开看已经想到哪了` : `点开看${name}的小心思`}
      aria-label={`${name}的小心思`}
      className={cn(cls, 'transition hover:text-chat-pill-fg active:opacity-70')}
    >
      {inner}
    </button>
  );
}

/**
 * 一条消息的行容器（对齐设计稿）：
 *
 *     〉哥哥想说
 *     [气泡][时间]
 *
 *     [时间][黑色气泡]
 *
 * 原稿没有头像，代之以「发送者那行小字」；时间戳落在气泡**外侧**并与气泡底对齐，
 * 所以它仍然作为气泡行的兄弟节点存在，而不是外层列里的独立一行。
 */
function MsgRow({
  mine,
  label,
  stamp,
  above,
  below,
  children,
}: {
  mine: boolean;
  label?: React.ReactNode;
  stamp?: React.ReactNode;
  /** 气泡**上方**的整宽内容（引用卡） */
  above?: React.ReactNode;
  /** 气泡**下方**的内容（内心独白） */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {label}
      <div className={cn('flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
        {above}
        <div className="flex min-w-0 items-end gap-2">
          {mine ? stamp : null}
          {children}
          {mine ? null : stamp}
        </div>
        {below}
      </div>
    </div>
  );
}

/** 居中日期分隔（极简：两侧细线 + 灰色小字） */
function DateDivider({ label }: { label: string }) {
  return (
    <div data-testid="date-divider" className="flex items-center gap-3 px-2 py-4">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-chat-line" aria-hidden />
      <span className="shrink-0 text-[10px] tracking-wide text-chat-meta">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-chat-line" aria-hidden />
    </div>
  );
}

/** 可折叠引用卡（参考图那块的 ❝ + 左竖线 + 斜体标题 + 折叠箭头） */
function QuoteCard({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      data-testid="quote-card"
      className="mb-1.5 flex w-full items-center gap-2 rounded-xl border border-chat-quote-line bg-chat-quote px-2.5 py-2 text-left"
    >
      <Quote className="h-3.5 w-3.5 shrink-0 text-chat-accent" />
      <span className="h-4 w-px shrink-0 bg-chat-quote-line" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-serif text-[13px] italic text-chat-ai-fg">{label}</span>
      <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-chat-meta transition-transform', open && 'rotate-180')} />
    </button>
  );
}

/** 内心独白注解：气泡下方那行灰色斜体小字 */
function InnerNote({ text }: { text: string }) {
  return (
    <span data-testid="inner-note" className="px-1 pt-1 text-[11px] italic leading-snug text-chat-meta">
      {text}
    </span>
  );
}

/**
 * 语音消息气泡：▶ / 波形 / mm:ss / ⤓（参考图底部那条）＋ 下方 NEST 逐字字幕。
 *
 * 字幕状态由 `useVoiceCaption` 提供，**和播放键共用同一个时钟** ——
 * 两边各建一个的话，字变深的速度会和 ▶ 的实际进度对不上。
 *
 * 现在还没有真实录音（TTS 未接），所以拿到的是**估算时钟**：
 *  - 逐字变深只用于显示，容器上标 `data-timing-status="estimated"`；
 *  - 每个字都**不带** `data-seek-time` → 不可点、不产生假的跳播时间
 *    （原文 §1：没有可靠时间戳的字，`start` 必须是 `null`，不能转成 0）。
 * 等真实音频 / 逐字时间戳接上，把 `media` / `words` 传进 hook，
 * 点字跳到那个词、词内细分、真实停顿就全部自动生效，这个组件不用再改。
 */
function VoiceBubble({ id, ms, text }: { id: string; ms: number; text: string }) {
  const cap = useVoiceCaption({
    text,
    durationSec: ms / 1000,
    // 消息 id 就是这一版「音频」的标识：正文被编辑或重新合成后，旧时间轴自动作废
    audioIdentity: `voice:${id}`,
    // 还没有逐字时间戳，去问服务端也只会拿到空结果 —— 先不发起请求
    autoFetch: false,
  });

  const total = Math.max(0, Math.round(ms / 1000));
  const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  // 稳定的伪波形：同一段文案每次渲染形状一致（不用随机数，避免重渲染抖）
  const bars = useMemo(() => {
    let seed = 0;
    for (const ch of text || 'voice') seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
    return Array.from({ length: 22 }, (_, i) => 5 + ((seed >> i % 12) % 9) + (i % 5 === 0 ? 4 : 0));
  }, [text]);

  return (
    <div data-testid="voice-bubble" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cap.toggle}
          aria-label={cap.playing ? '暂停' : '播放'}
          className={cn(
            // 用 currentColor：这样放在己方（浅蓝）和对方（浅灰）气泡里都跟着气泡的字色走
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-current transition',
            'bg-surface-2 hover:bg-surface-3',
          )}
        >
          {cap.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
        </button>
        <span className="flex items-center gap-[2px]" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn('w-[2px] rounded-full bg-current opacity-45', cap.playing && 'soundwave-bar opacity-70')}
              style={{ height: h, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </span>
        <span className="shrink-0 text-[13px] tabular-nums">{label}</span>
        <button
          type="button"
          aria-label="下载语音"
          title="下载语音"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-60 transition hover:opacity-100"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 转录：跟着播放逐字变深。估算态下不可点，等真实时间戳接上才变成可跳播。
          宽度对齐上面那条波形（约 11rem），免得在 320px 窄屏上把气泡撑破。 */}
      {text ? (
        <CaptionView
          state={cap}
          onToggle={cap.toggle}
          className="block max-w-[11rem] text-left text-[13px] leading-5 opacity-90"
        />
      ) : null}
    </div>
  );
}

/** 通话记录卡：通话 02:17 / 已拒接 / 未接来电 已回拨 */
/**
 * 通话记录卡（对齐设计稿第 8 页）：
 * 白卡片 + 左侧圆形电话图标 + 两行文字（「通话 · 12 分 04 秒」/「之后那几个字 · 23:41」）。
 * 它不是气泡，所以在消息行里独占一张卡，宽度跟着内容走。
 */
function CallRecordCard({
  call,
  ts,
  onClick,
}: {
  call: NonNullable<ChatMessage['call']>;
  ts?: number;
  onClick?: () => void;
}) {
  const secs = call.seconds ?? 0;
  const missed = call.state === 'missed';
  const dir = call.direction ?? 'incoming';
  const dur = secs > 0 ? (secs >= 60 ? `${Math.floor(secs / 60)} 分 ${String(secs % 60).padStart(2, '0')} 秒` : `${secs} 秒`) : '';
  const title = call.state === 'answered' ? (dur ? `通话 · ${dur}` : '通话') : callStatusWord(call);
  const sub = `${callStatusWord(call)}${ts ? ` · ${fmtTime(ts)}` : ''}`;
  const Icon =
    call.state === 'answered' ? PhoneIncoming : dir === 'outgoing' ? PhoneOutgoing : PhoneMissed;

  return (
    <button
      type="button"
      onClick={(e) => {
        // 别让长按菜单 / 列表的点击处理跟着响
        e.stopPropagation();
        onClick?.();
      }}
      data-testid="call-record"
      data-state={call.state}
      className="inline-flex min-w-[232px] items-center gap-3 rounded-[20px] bg-chat-ai px-3.5 py-3 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] transition active:scale-[0.99]"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-pill',
          missed ? 'text-destructive' : 'text-chat-ai-fg',
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[14px] font-medium text-chat-ai-fg">{title}</span>
        <span className="truncate text-[12px] text-chat-meta">{sub}</span>
      </span>
    </button>
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

/**
 * 思考链入口 —— 就是气泡上方那行「〉哥哥想说」。
 *
 * 设计稿里没有额外的思考药丸：这行小字本身可点，点开就是「思考链」下弹窗。
 * 流式期间自动变成「哥哥在想」+ 三个跳点，收完后回到「哥哥想说」。
 */
function ThoughtEntry({ owner, active, onClick }: { owner: string; active: boolean; onClick: () => void }) {
  return <SenderLabel name={owner} thinking={active} onClick={onClick} testid="thought-entry" />;
}

/**
 * AI 正文。
 *
 * 思考链已经搬到气泡上方（见 `ThoughtEntry`），这里只管正文与「{称呼}在想…」占位。
 * 还没出正文且没有思考链时给一句占位，否则气泡会是空的。
 */
function AssistantBody({ content, streaming, owner, plain }: { content: string; streaming: boolean; owner: string; plain?: boolean }) {
  if (!content) {
    return streaming ? <span className="text-chat-meta">{owner}在想…</span> : null;
  }
  // 短对话模式（空心爱心）：像发消息一样 —— 纯文本，不走 Markdown
  if (plain) return <span className="whitespace-pre-wrap">{content}</span>;
  return <Markdown>{content}</Markdown>;
}

/**
 * 思考链**下弹窗**（对齐设计稿：白纸弹层、左标题 + 右上 ✕、正文是一块浅灰预览块）。
 */
function ThoughtSheet({ reasoning, owner, onClose }: { reasoning: string; owner: string; onClose: () => void }) {
  const hasReasoning = reasoning.trim().length > 0;
  return (
    <ChatSheet open onOpenChange={(v) => !v && onClose()} title="思考链" testid="thought-sheet" maxHeight="max-h-[72vh]">
      {hasReasoning ? (
        <>
          <p className="mb-2 text-[13px] text-chat-meta">{owner}开口前想到的：</p>
          <div
            data-testid="thought-text"
            className="rounded-2xl bg-chat-pill px-4 py-3 text-[14px] leading-relaxed text-chat-pill-fg"
          >
            <p className="whitespace-pre-wrap">{reasoning}</p>
          </div>
        </>
      ) : (
        <div data-testid="thought-empty" className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-[14px] font-medium text-foreground">这条消息没有留下思考过程</p>
          <p className="text-[12px] leading-5 text-chat-meta">
            有的回复是脱口而出的，没有经过思考链；<br />
            生成时想过什么，这里就会留下什么。
          </p>
        </div>
      )}
    </ChatSheet>
  );
}

/**
 * 对白风格切换（💕 碎片流 / 🩷 沉浸流）。
 *
 * 设计稿的输入条没有额外药丸，所以入口收进「+」面板（同为一张功能卡，`data-testid`
 * 保留 `chat-style-pill`，行为不变：点一下翻面，状态照旧存 localStorage）。
 */

/**
 * 底部面板里的单个入口（设计稿：浅灰圆角方块 + 方块下方一行小字，无描边无投影）。
 *
 * 统一规格：单元格内**居中**、图标方块 h-14 w-14 定尺、圆角 20px、标签 11px。
 * 卡片宽度由父级等宽网格给（`w-full`），所以每格一样宽 —— 不要再在按钮上写死宽度。
 * 触控反馈走整卡 `active:scale-95`（比只缩图标方块更跟手）。
 * `[&_svg]` 是为了不用挨个改调用点的图标尺寸。
 */
function AttachButton({
  icon,
  label,
  onClick,
  testid,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testid}
      className="group flex w-full flex-col items-center gap-2 rounded-xl py-1 transition duration-150 active:scale-95"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-chat-pill text-chat-pill-fg transition group-hover:bg-chat-line [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      <span className="text-[11px] leading-none text-chat-meta">{label}</span>
    </button>
  );
}

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // 顶栏 / 输入栏 / 回到底部等悬浮元素只在聊天主视图（/chat）置顶显示；
  // 打开 together / 首页等整页覆盖层路由时自动隐藏，避免这些「置顶按钮」浮到其他页面上。
  const isChatView = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
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
  /** 打开菜单时这条消息在视口里的位置（浮层要贴着它弹出，微信长按那种） */
  const [menuRect, setMenuRect] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** 心情浮层：点顶栏头像蹦出「ta 的心情/状态」（数据用心潮，见 MoodPopover） */
  const [moodOpen, setMoodOpen] = useState(false);
  // 点名字直接进「心潮念」完整页（2026-10-20 起不再开旧的内心中枢抽屉）
  /** 多图堆叠卡片点开的大图查看器（整页、纯色不透明，遵守「点开=新页面」） */
  const [photoView, setPhotoView] = useState<{ urls: string[]; index: number } | null>(null);
  const openDrawer = useShellStore((s) => s.openDrawer);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const partnerName = useProfileStore((s) => s.partnerName);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  /**
   * 聊天里显示的名字：**备注优先**（2026-10-19 需求：「资料里填的备注就是聊天名字」）。
   * 备注存在后端 settings（`profile.partnerRemark`），AI 也能改；本名兜底，再兜会话标题。
   */
  const displayName = partnerRemark || partnerName;
  /** 「小心思 / 在想…」里的人称：跟聊天名字走；预设称呼已清空（2026-10-29），没设就中性叫「对方」 */
  const ownerName = displayName || '对方';
  // 耳机头像框：仅在「正在播放」时出现（播放态当前由 playerStore 驱动，后续接网易云 MCP 覆盖）
  const playing = usePlayerStore((s) => s.playing);
  /** 说话风格（💕 碎片流 / 🩷 沉浸流），存 localStorage，刷新保持 */
  const chatStyleMode = useChatStyle((s) => s.mode);
  const toggleChatStyle = useChatStyle((s) => s.toggle);
  const syncChatStyle = useChatStyle((s) => s.syncFromStorage);
  // 另一个标签页切了风格 → storage 事件只发给「别的」标签页，正好用来同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAT_STYLE_STORAGE_KEY) syncChatStyle();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncChatStyle]);
  const [confirming, setConfirming] = useState<{ confirmId: string; toolName: string; summary: string } | null>(
    null,
  );
  const [web] = useState(true);

  /** 长短对话（顶栏爱心键）：实心 = 长对话（工具 + Markdown，默认）；空心 = 短对话，像发消息一样。存 localStorage */
  const [longChat, setLongChat] = useState(() => localStorage.getItem('bb-long-chat') !== '0');
  const toggleLongChat = () =>
    setLongChat((v) => {
      localStorage.setItem('bb-long-chat', v ? '0' : '1');
      return !v;
    });
  const [stationId, setStationId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [vision, setVision] = useState<{ model: string | null } | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  /** 语音识别（STT）：点麦克风说话，定稿直接发出去。不支持的浏览器点一下走降级提示。 */
  const stt = useSpeechRecognition({
    lang: 'zh-CN',
    onInterim: (t) => setInput(t),
    onFinal: (t) => {
      void send(t);
    },
    onError: (msg) => {
      setToolStatus(msg);
      window.setTimeout(() => setToolStatus(null), 2600);
    },
  });
  /** 通话会话：只有「已接通」才渲染整屏浮层；呼叫中 / 来电由 AppLayout 的弹窗接管 */
  const callPhase = useCallSession((s) => s.phase);
  const sessionKind = useCallSession((s) => s.kind);
  /** 通话记录详情（设计稿 9 页）：点聊天里那张通话卡打开 */
  const [callDetail, setCallDetail] = useState<{
    call: NonNullable<ChatMessage['call']>;
    ts?: number;
  } | null>(null);
  /** PaiVoice 实时语音层状态：起来了就让语音通话走它，否则回退旧通话浮层 */
  const [paiVoice, setPaiVoice] = useState<{ up: boolean; wsUrl: string } | null>(null);
  /** 呼出时刻、方向与结算统一由 callSession 管，这里不再另存一份 */
  /** 应用内浏览器要打开的地址（null = 关闭） */
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  /** 「新消息形态」预览开关：**只在本组件内存里**，不写库、不进模型上下文 */
  /** 正在引用的消息（引用后新消息上方会出现引用卡） */
  const [quoteMsg, setQuoteMsg] = useState<{ label: string } | null>(null);
  /** 是否已贴底：决定右下角浮出的「回到底部」圆钮显示不显示 */
  const [atBottom, setAtBottom] = useState(true);
  const [thoughtReasoning, setThoughtReasoning] = useState<string | null>(null);
  /** 忌口 / 过敏档案（人设 + 备忘录动态解析，空 = 没配） */
  const dietProfile = useDietStore((s) => s.profile);
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
  /** 气泡键长按 = 切对白风格（对白键已并入此键，2026-10-29；图标由爱心改气泡 2026-11-04） */
  const stylePressRef = useRef<number | null>(null);
  const styleLongFiredRef = useRef(false);
  const cancelStylePress = () => {
    if (stylePressRef.current) {
      window.clearTimeout(stylePressRef.current);
      stylePressRef.current = null;
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  // 忌口 / 过敏档案：进聊天就取一次（人设或备忘录改了，重新进页面即生效）
  useEffect(() => {
    void useDietStore.getState().load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 对白风格存在 localStorage，store 初始化时就已读好，这里不需要再拉一次

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

  /** 通话整屏中间那颗引用气泡：对方最后说的一句话（跳过通话卡那条占位文案） */
  const lastAssistantLine = useMemo(() => {
    const line =
      [...path]
        .reverse()
        .find(
          (m) =>
            m.role === 'assistant' &&
            m.content.trim() &&
            !m.call &&
            !/^（通话/.test(m.content.trim()) &&
            !/^⚠/.test(m.content.trim()),
        )?.content ?? '';
    const one = line.replace(/\s+/g, ' ').trim();
    return one.length > 46 ? `${one.slice(0, 46)}…` : one;
  }, [path]);

  // 平滑贴底：新消息 / 流式内容增长时都跟到底部（仅当用户已在底部附近，避免打断上翻阅读）
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 200;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [path, path[path.length - 1]?.content]);

  // 软键盘弹起/收起：可视视口高度变了就重新贴底一次。
  // 键盘弹起时布局视口往往不动，滚动高度却要重算，不补这一下最后一条消息就被挡住。
  // 只在「原本就在底部附近」时才跟，避免把正在上翻历史的人拽回来。
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const onResize = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
          bottomRef.current?.scrollIntoView({ block: 'end' });
        }
      });
    };
    vv.addEventListener('resize', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  /** 滚动位置 → 「回到底部」圆钮的显隐（贴底 80px 内就不显示） */
  const onListScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const scrollToBottom = () => {
    setAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  /**
   * 点消息区：链接交给应用内浏览器；顺手把底部面板收起来（微信点空白也是收面板）。
   * 用容器级代理而不是改 Markdown 组件：改一处就能覆盖所有 <a>。
   */
  const onListClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a');
    if (a) {
      const href = a.getAttribute('href');
      if (href) {
        e.preventDefault();
        setBrowserUrl(href);
      }
      return;
    }
    if (attachOpen || stickerOpen) {
      setAttachOpen(false);
      setStickerOpen(false);
    }
  };

  // PaiVoice 探活：只探一次，决定语音通话走独立页面还是旧浮层
  useEffect(() => {
    let alive = true;
    fetch('/api/paivoice/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!alive) return;
        setPaiVoice(s ? { up: !!s.up, wsUrl: String(s.wsUrl ?? '') } : { up: false, wsUrl: '' });
      })
      .catch(() => {
        if (alive) setPaiVoice({ up: false, wsUrl: '' });
      });
    return () => {
      alive = false;
    };
  }, []);

  // 大图查看器的 Esc：capture 阶段拦下，避免连抽屉一起关
  useEffect(() => {
    if (!photoView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPhotoView(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [photoView]);

  // 菜单现在是一块**锚定在消息旁边**的浮层（微信长按那种），
  // 关闭靠自己的全屏透明背板 + Esc，不再需要「点外部」的 document 监听。
  useEffect(() => {
    if (!menuForId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeMenu();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuForId]);

  // 菜单锚点：微信长按是「贴着这条消息弹出」，所以打开时要记住消息在屏幕上的位置
  const startPress = (id: string, el: HTMLElement | null) => {
    pressTimerRef.current = window.setTimeout(() => openMenu(id, el), 450);
  };
  const cancelPress = () => {
    if (pressTimerRef.current != null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const openMenu = (id: string, el: HTMLElement | null) => {
    // 锚点优先取**气泡本身**（而不是整行）：整行是满宽的，按它的中心算会把菜单
    // 摆到屏幕正中，而微信那种观感是贴着气泡边缘出来的
    const bubble = el?.querySelector('[data-bubble]') as HTMLElement | null;
    const target = bubble ?? el;
    if (target) {
      const r = target.getBoundingClientRect();
      setMenuRect({ top: r.top, bottom: r.bottom, left: r.left, width: r.width });
    } else {
      setMenuRect(null);
    }
    setMenuForId(id);
  };
  const closeMenu = () => {
    setMenuForId(null);
    setMenuRect(null);
  };

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
      // 后端情绪前置分析拿它做幂等键：同一条用户消息重试时不重复累积
      userMessageId: parentId,
      model: model ?? undefined,
      stationId: stationId ?? undefined,
      web,
      // 对白风格按请求带：存 localStorage，后端据此拼提示词（不依赖服务端设置）
      chatStyle: useChatStyle.getState().mode,
      // 短对话（空心爱心）：不挂工具、纯文本口语回复
      longChat,
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
      onIncomingCall: () => {
        // 只有模型自己决定要打才走到这里；begin() 自带「已在响铃/通话就不重复」的幂等
        triggerIncomingCall();
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

  /** 发起通话：先进「呼叫中」等他接，他也可能不方便不接。
   *  ?call=answered / ?call=missed 可强制本次结果，方便验收两种分支。 */
  const startCall = (kind: CallKind) => {
    // 通话浮层是整屏的，把「+」/表情面板收掉，挂断后回到干净的聊天页
    setAttachOpen(false);
    setStickerOpen(false);
    const forced = new URLSearchParams(window.location.search).get('call');
    useCallSession.getState().begin({
      direction: 'outgoing',
      kind,
      forcedOutcome: forced === 'missed' ? 'missed' : forced === 'answered' ? 'answered' : null,
    });
  };

  /** 挂断 / 拒接 / 未接统一交给 callSession：落库 + 推通话卡片 + 没接成时让他追问一句 */
  const endCall = (result: CallResult) => {
    useCallSession.getState().finish(result.state, result.seconds);
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
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
      // 引用：贴在气泡上方那张灰底小卡片（微信同款），会随 meta 一起落库
      quote: quoteMsg ?? undefined,
      images: pendingImages.length
        ? pendingImages.map((i) => (direct ? i : { ...i, dataUrl: undefined }))
        : undefined,
    };
    setPendingImages([]);
    await appendMessage(userMsg);
    setReplyToId(null);

    const base = parentId ? pathTo(conv, parentId).map(toPayload) : [];
    // 引用同时告诉模型「这条在接哪句话」，否则「这句什么意思」它没法对上下文
    const payloadUser = quoteMsg
      ? { ...toPayload(userMsg), content: `（引用 ${quoteMsg.label}）\n${userMsg.content}` }
      : toPayload(userMsg);
    setQuoteMsg(null);
    await produceReply(text, userMsg.id, [...base, payloadUser]);
  };

  /**
   * 会话里「最新的一条」正文（AI 回复也算）——用来检测忌口 / 过敏命中。
   * 取 createdAt 最大的那条而不是数组末位：消息是棵树，末位未必是最新的。
   */
  const latestMsgText = useChatStore((s) => {
    const ms = s.conversation?.messages;
    if (!ms || ms.length === 0) return '';
    let last = ms[0];
    for (const m of ms) if ((m.createdAt ?? 0) >= (last.createdAt ?? 0)) last = m;
    return last.content ?? '';
  });

  /**
   * 命中检测（需求 §3）：**输入框草稿 + 最新一条消息**都扫。
   * 自己打字会即时提示，AI 回复里提到也会拦下来。
   * 前端本地匹配只为即时反馈，档案本身以 `GET /api/diet/profile` 为准。
   */
  const dietHits = useMemo(
    () => matchDietHits(`${input}\n${latestMsgText}`, dietProfile),
    [input, latestMsgText, dietProfile],
  );

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

  /**
   * 引用（2026-10-18 新增，替代被删掉的「形态预览」）。
   *
   * 和「回复」不是一回事：回复是从那条往下**开分支**继续聊；
   * 引用是把原话贴在**下一条消息上方**（微信那种灰底引用条），方便「你刚说的这句什么意思」。
   * 摘要带说话人前缀，既给人看，也会在发给模型时作为上下文前缀。
   */
  const startQuote = (msg: ChatMessage) => {
    const who = msg.role === 'user' ? '我' : ownerName;
    const snippet = msg.content.replace(/\s+/g, ' ').trim().slice(0, 60);
    setQuoteMsg({ label: `${who}：${snippet}` });
    inputRef.current?.focus();
  };
  const cancelQuote = () => setQuoteMsg(null);

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
    <div className="relative flex h-full flex-col bg-chat-bg text-foreground">
      {/* 顶栏（2026-11-09）：**悬浮置顶在聊天消息之上**，自身不带任何底色 / 遮罩，
          消息滚动时会从按钮与头像后面透出来。用 absolute 脱离文档流，消息区靠等高 pt 让开首屏。
          pointer-events-none + 各按钮 pointer-events-auto：空白处的点击照样能落到底下的气泡上。
          2026-11-10：控件统一 `border-chat-line + shadow-md`（对齐「回到底部」圆钮），
          靠描边和投影跟平的消息气泡拉开层次，而不是给整条导航栏铺底色。 */}
      {isChatView && (
      <div
        data-testid="chat-topbar"
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex min-h-[104px] items-center gap-2.5 bg-transparent px-4"
      >
        {/* 移动端：汉堡 → 主抽屉（桌面有左侧常驻栏，不给重复入口） */}
        <button
          type="button"
          onClick={openDrawer}
          aria-label="打开菜单"
          title="菜单"
          data-testid="chat-hamburger"
          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-chat-line bg-chat-pill text-chat-pill-fg shadow-md transition hover:bg-chat-line active:scale-95 md:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
        {/* 汉堡旁：气泡键（二合一，2026-10-29 并入；2026-11-04 晚 爱心改气泡图标）
            点击 = 长短对话切换：**单气泡 = 长对话**（工具 + Markdown）、
            **双气泡 = 短对话**（像发消息一样）
            长按 500ms = 切对白风格（💕 碎片流 / 🩷 沉浸流）——原对白键的功能并到这里 */}
        <button
          type="button"
          onClick={() => {
            if (styleLongFiredRef.current) {
              styleLongFiredRef.current = false;
              return;
            }
            toggleLongChat();
          }}
          onPointerDown={() => {
            styleLongFiredRef.current = false;
            if (stylePressRef.current) window.clearTimeout(stylePressRef.current);
            stylePressRef.current = window.setTimeout(() => {
              styleLongFiredRef.current = true;
              toggleChatStyle();
            }, 500);
          }}
          onPointerUp={() => {
            if (stylePressRef.current) {
              window.clearTimeout(stylePressRef.current);
              stylePressRef.current = null;
            }
          }}
          onPointerLeave={cancelStylePress}
          onPointerCancel={cancelStylePress}
          aria-pressed={longChat}
          aria-label={`气泡：点击切长短对话（当前${longChat ? '单气泡·长对话' : '双气泡·短对话'}），长按切对白风格（当前${CHAT_STYLE_META[chatStyleMode].title}）`}
          title={`点击：长短对话（当前${longChat ? '单气泡 = 长对话' : '双气泡 = 短对话'}）\n长按：切对白风格（当前${CHAT_STYLE_META[chatStyleMode].title}）`}
          data-testid="chat-mode-toggle"
          data-mode={longChat ? 'long' : 'short'}
          data-style={chatStyleMode}
            className={cn(
              'pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-chat-line bg-chat-pill shadow-md transition hover:bg-chat-line active:scale-95',
              longChat ? 'text-chat-pill-fg' : 'text-chat-meta',
            )}
        >
          {/* 单气泡 = 长对话（实心）；双气泡 = 短对话（发消息的格式） */}
          {longChat ? (
            <MessageSquare className="h-[18px] w-[18px] fill-current" />
          ) : (
            <MessagesSquare className="h-[18px] w-[18px]" />
          )}
        </button>
        {/* 会话名字：**绝对定位到顶栏正中**（无论左右按钮增减，名字始终真正居中）。 */}
        <div
          data-testid="chat-title-slot"
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        >
          {/* 头像：点头像 = 进 TA 资料页（与首页/抽屉一致）；点角落状态点 = 心情浮层 */}
          <span className="pointer-events-auto relative mt-1 inline-flex rounded-full">
            {/* 大头像 + 角落状态灯（绿 / 黄 / 红 = 通道状态）。
                圆形框套在**外层 span**：AvatarContent 的 emoji 分支只负责内容，
                尺寸/圆角/裁切必须由这里给，否则 emoji 会变成一个方方块。 */}
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={() => navigate('/partner')}
                data-testid="chat-partner-avatar"
                aria-label={`查看${ownerName}的资料`}
                title={`查看${ownerName}的资料`}
                className={cn(
                  'flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-chat-line bg-chat-pill shadow-md transition',
                  'hover:opacity-90 active:scale-[0.97]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent/60',
                )}
              >
                <AvatarContent value={partnerAvatar} className="text-[30px]" />
              </button>
              <button
                type="button"
                onClick={() => setMoodOpen((v) => !v)}
                data-mood-popover-keep
                aria-label={`看看${ownerName}现在的心情`}
                title={`看看${ownerName}现在的心情`}
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-chat-bar bg-chat-bar transition',
                  moodOpen && 'ring-2 ring-chat-accent/60',
                )}
              >
                <ConnDot />
              </button>
              {/* 头像框：头戴式大耳机装饰——仅在播放时出现（playing 为假则不渲染）。
                  外框放大到 84px（-inset-4），耳机落在头像外圈：耳罩在左右外缘、头梁在头顶上方成环，不压头像内容。 */}
              {playing && (
                <svg
                  data-testid="headphone-overlay"
                  viewBox="0 0 84 84"
                  fill="none"
                  aria-hidden
                  className="pointer-events-none absolute -inset-4 h-[calc(100%+32px)] w-[calc(100%+32px)] text-chat-accent"
                >
                  <path d="M13 30 a29 29 0 0 1 58 0" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
                  <rect x="6" y="28" width="14" height="32" rx="8" fill="currentColor" />
                  <rect x="64" y="28" width="14" height="32" rx="8" fill="currentColor" />
                </svg>
              )}
            </span>
          </span>
          {/* 名字 + ▾：仍是心潮入口（chat-title-btn 回归锚点保持不动） */}
          <button
            type="button"
            onClick={() => navigate('/xinchao')}
            data-testid="chat-title-btn"
            aria-label="打开内心与记忆"
            title={`点开看${ownerName}此刻在想什么`}
            className={cn(
              'pointer-events-auto mt-1 flex items-center gap-1 rounded-full border border-chat-line bg-chat-pill px-3 py-1 shadow-md transition',
              'hover:bg-chat-line active:scale-[0.98]',
              // 点完不要留一圈浏览器默认黑描边；键盘 Tab 过来才给一圈浅色 focus ring
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent/60',
            )}
          >
            <span
              data-testid="chat-title"
              className="display min-w-0 max-w-[40vw] truncate text-[16px] font-semibold tracking-tight text-foreground md:max-w-[420px]"
            >
              {/* 称呼：抽屉里改过就用自定义的，没改过还是沿用会话标题 */}
              {displayName || conversation?.title || '小蓝莓'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-chat-meta" aria-hidden />
          </button>
        </div>
        {/* 右侧按钮组：通话 + 搜索（设计稿布局：礼物盒挪进「+」面板，顶栏不堆按钮） */}
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => startCall('voice')}
            aria-label="语音通话"
            title="语音通话"
            data-testid="chat-call"
            className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-chat-line bg-chat-pill text-chat-pill-fg shadow-md transition hover:bg-chat-line active:scale-95"
          >
            <Phone className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="搜索记录"
            title="搜索记录"
            className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-chat-line bg-chat-pill text-chat-pill-fg shadow-md transition hover:bg-chat-line active:scale-95"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
      )}

      {/* 心情浮层：点头像蹦出，点空白 / Esc / 再点头像关闭（数据用心潮，无遮罩不挡聊天） */}
      <MoodPopover
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        partnerName={displayName || conversation?.title || '小蓝莓'}
        partnerAvatar={partnerAvatar}
      />


      {/* 消息列表 + 右下角「回到底部」圆钮。
          pt 必须等于上面 topbar 的 min-h（104px）：首屏内容不被压住，
          往上滚时消息又能穿过透明的顶栏、从按钮后面透出来 */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-testid="chat-scroller"
          onScroll={onListScroll}
          onClick={onListClick}
          className="scrollbar-thin h-full overflow-y-auto overscroll-contain bg-chat-bg px-4 pb-[96px] pt-[104px]"
        >
          <div className="mx-auto w-full max-w-3xl">
        {!loaded ? (
          <div className="flex items-center justify-center py-20 text-sm text-chat-meta">
            加载中…
          </div>
        ) : showWelcome ? (
          <>
            {/* 顶部居中时间戳 */}
            <DateDivider label={`${fmtDateLabel(Date.now())} · ${fmtTime(Date.now())}`} />
            <MsgRow
              mine={false}
              label={<SenderLabel name={ownerName} />}
              stamp={<InlineStamp ts={Date.now()} />}
            >
              <div
                className="rounded-[22px] bg-chat-ai px-4 py-3 text-[15px] leading-6 text-chat-ai-fg shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]"
                style={
                  { '--foreground': 'var(--chat-ai-fg)', '--muted-foreground': 'var(--chat-meta)' } as React.CSSProperties
                }
              >
                <Markdown>{WELCOME_TEXT}</Markdown>
              </div>
            </MsgRow>
          </>
        ) : (
          <>
          {path.map((m, i) => {
            // 跨天时在气泡之间插入居中日期分隔
            const prev = i > 0 ? path[i - 1] : null;
            const needDate = !prev || !isSameDay(prev.createdAt, m.createdAt);
            /**
             * 分组时间戳（参考图那行「● 6/30 00:10:50」）：跨天、换人说话、
             * 或间隔超过 5 分钟才重新打一次，避免每条气泡都挂一行时间。
             */
            const needStamp =
              needDate ||
              !prev ||
              prev.role !== m.role ||
              (m.createdAt ?? 0) - (prev.createdAt ?? 0) > 5 * 60_000;
            const siblings = m.parentId
              ? childrenOf(conversation!, m.parentId)
              : conversation!.messages.filter((x) => x.parentId === null);
            const showSwitch = siblings.length > 1;
            const myIdx = siblings.findIndex((s) => s.id === m.id);
            const isEditing = editingId === m.id;
            const menuOpen = menuForId === m.id;
            /**
             * 即兴聊天模式下的「碎片流」：后端被要求一行一句，这里把每个非空行
             * 渲染成**一条独立气泡**，模拟微信里一条条往外蹦的节奏。
             * 只有 AI 文本消息才拆（用户消息、表情、语音、通话卡都不动），
             * 而且至少要两段才拆 —— 一段话拆成一个组没意义，还会多包一层 DOM。
             */
            const bubbleSegs =
              chatStyleMode === 'fragmented' && m.role === 'assistant' && !isEditing && !m.voiceMs && !m.sticker
                ? m.content
                    .split(/\n+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];
            const multiBubble = bubbleSegs.length > 1;
            /** 刚发出、正文还没到的 AI 消息：只留上方「{称呼}在想…」，不再给一个空气泡 */
            const waitingFirstToken =
              m.role === 'assistant' && m.status === 'streaming' && !m.content && !!m.reasoning;
            /**
             * 设计稿：对方每条**消息组的第一条**上方都有「〉{称呼}想说」。
             * 有思考链时这行本身就是入口（可点），流式期间自动变成「在想」+ 跳点。
             */
            /**
             * 设计稿：对方每条**消息组的第一条**上方都有「〉{称呼}想说」。
             * 这行本身就是思考链入口（一律可点，没留下思考过程时弹层里给空态说明）；
             * 流式期间自动变成「在想」+ 跳点。通话记录卡不挂这行（2026-10-29：通话不要思考链）。
             */
            const groupStart = needStamp || !prev || prev.role !== m.role;
            const senderLabel =
              m.role === 'assistant' && groupStart && !isEditing && !m.call ? (
                <ThoughtEntry
                  owner={ownerName}
                  active={m.status === 'streaming' && !m.content}
                  onClick={() => setThoughtReasoning(m.reasoning ?? '')}
                />
              ) : null;

            return (
              <div key={m.id} className="flex flex-col" data-msg-row={m.id}>
                {/* 跨天：居中日期分隔（「6月30日 · 00:10」，两侧细线） */}
                {needDate && (
                  <DateDivider label={`${fmtDateLabel(m.createdAt)} · ${fmtTime(m.createdAt)}`} />
                )}
                {/* 消息行：设计稿排版——没有头像，代之以气泡上方的「〉{称呼}想说」，时间贴气泡外侧 */}
                <div
                  className="mb-2"
                  {...(!isEditing
                    ? {
                        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) =>
                          startPress(m.id, e.currentTarget),
                        onPointerUp: cancelPress,
                        onPointerMove: cancelPress,
                        onPointerLeave: cancelPress,
                        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
                      }
                    : {})}
                >
                  <MsgRow
                    mine={m.role === 'user'}
                    label={senderLabel}
                    stamp={needStamp && !waitingFirstToken ? <InlineStamp ts={m.createdAt} /> : null}
                    above={m.quote ? <QuoteCard label={m.quote.label} /> : null}
                    below={m.inner ? <InnerNote text={m.inner} /> : null}
                  >
                    {/* 通话记录卡：不是气泡，是一张卡 */}
                    {m.call ? (
                      <CallRecordCard
                        call={m.call}
                        ts={m.createdAt}
                        onClick={() => setCallDetail({ call: m.call!, ts: m.createdAt })}
                      />
                    ) : waitingFirstToken ? null : multiBubble ? (
                      /* 即兴聊天：一条 AI 消息按行拆成多条气泡，一条条往外蹦。
                         间距用 gap-1、内边距 py-2，比整段气泡更紧 —— 碎片流本来就是这种密度 */
                      <div className="flex min-w-0 flex-col items-start gap-1" data-testid="bubble-group" data-bubble>
                        {bubbleSegs.map((seg, si) => (
                          <div
                            key={si}
                            data-testid="chat-bubble"
                            className="select-none rounded-[22px] bg-chat-ai px-3.5 py-2 text-[15px] leading-6 text-chat-ai-fg shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]"
                            style={
                              {
                                '--foreground': 'var(--chat-ai-fg)',
                                '--muted-foreground': 'var(--chat-meta)',
                              } as React.CSSProperties
                            }
                          >
                            {!longChat ? <span className="whitespace-pre-wrap">{seg}</span> : <Markdown>{seg}</Markdown>}
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div
                      data-bubble
                      className={cn(
                        'text-[15px] leading-6',
                        !isEditing && 'select-none',
                        'rounded-[22px] px-4 py-2.5',
                        m.role === 'user'
                          // 己方：纯黑气泡、白字（设计稿极简黑白）
                          ? 'whitespace-pre-wrap bg-chat-me text-chat-me-fg'
                          // 对方：纯白气泡、近黑字 + 一层几乎看不见的投影
                          : 'bg-chat-ai text-chat-ai-fg shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]',
                        m.sticker && 'border-transparent bg-transparent p-0 shadow-none',
                        // 错误仍保持气泡形状，只是把字换成警示红
                        m.status === 'error' && m.role === 'assistant' && 'text-destructive',
                      )}
                      // 气泡内局部覆盖主题变量：Markdown 里的 text-foreground / text-muted-foreground
                      // 走的是 CSS 变量，不跟着气泡底色走，正文在蓝/灰底上就会看不清。
                      style={
                        m.sticker
                          ? undefined
                          : m.role === 'user'
                            ? ({ '--foreground': 'var(--chat-me-fg)', '--muted-foreground': 'var(--chat-me-fg)' } as React.CSSProperties)
                            : ({ '--foreground': 'var(--chat-ai-fg)', '--muted-foreground': 'var(--chat-meta)' } as React.CSSProperties)
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
                              m.role === 'user' ? 'bg-white/10 text-chat-me-fg' : 'bg-chat-line/60 text-chat-ai-fg',
                            )}
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              aria-label="取消编辑"
                              className={cn(
                                'flex h-6 w-6 items-center justify-center rounded-md',
                                m.role === 'user' ? 'text-chat-me-fg/70 hover:bg-black/[0.08]' : 'text-chat-ai-fg/60 hover:bg-chat-line/60',
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
                                m.role === 'user' ? 'text-chat-me-fg/70 hover:bg-black/[0.08]' : 'text-chat-ai-fg/60 hover:bg-chat-line/60',
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : m.voiceMs ? (
                        <VoiceBubble id={m.id} ms={m.voiceMs} text={m.content} />
                      ) : m.role === 'assistant' ? (
                        <AssistantBody content={m.content} streaming={m.status === 'streaming'} owner={ownerName} plain={!longChat} />
                      ) : m.sticker ? (
                        <StickerBubble emoji={m.sticker} />
                      ) : (
                        <>
                          {m.images && m.images.length > 0 && (
                            m.images.length > 1 ? (
                              /* 多图 → PhotoStack 堆叠卡（微信式探边 / 跟手翻页 / 快甩） */
                              <div className="mb-1.5" data-testid="chat-photo-stack">
                                <PhotoStack
                                  images={m.images.map((img) => img.dataUrl ?? img.url ?? '')}
                                  onTap={(idx) =>
                                    setPhotoView({
                                      urls: (m.images ?? []).map((img) => img.dataUrl ?? img.url ?? ''),
                                      index: idx,
                                    })
                                  }
                                />
                              </div>
                            ) : (
                              <div className="mb-1.5 flex flex-wrap gap-1.5">
                                {m.images.map((img, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() =>
                                      setPhotoView({
                                        urls: [img.dataUrl ?? img.url ?? ''],
                                        index: 0,
                                      })
                                    }
                                    aria-label="查看大图"
                                    className="overflow-hidden rounded-lg active:scale-[0.99]"
                                  >
                                    <img
                                      src={img.dataUrl ?? img.url}
                                      alt={img.name ?? '图片'}
                                      className="max-h-44 max-w-full object-cover"
                                    />
                                  </button>
                                ))}
                              </div>
                            )
                          )}
                          {m.content}
                        </>
                      )}
                    </div>
                    )}
                  </MsgRow>
                </div>

                {/* 已记入备忘录提示 */}
                {m.role === 'assistant' && (memoAdded[m.id]?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-1">
                    {memoAdded[m.id].map((mm, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => navigate(mm.id ? `/memo?highlight=${mm.id}` : '/memo')}
                        title="查看备忘录"
                        className="flex items-center gap-1 rounded-full bg-chat-accent/10 px-2 py-0.5 text-[11px] text-chat-accent transition hover:bg-chat-accent/20"
                      >
                        {!mm.toWho ? (
                          <>📝 已记入备忘录：{mm.title}</>
                        ) : mm.fromWho && mm.fromWho !== mm.toWho ? (
                          <>
                            📝 {mm.fromWho}为<span className="font-medium">{mm.toWho}</span>记下：
                            <span className="text-chat-accent">{mm.title}</span>
                          </>
                        ) : (
                          <>
                            📝 已为<span className="font-medium">{mm.toWho}</span>记下：
                            <span className="text-chat-accent">{mm.title}</span>
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
                    m.role === 'user' ? 'justify-end pr-1' : 'pl-1',
                  )}
                >
                  {showSwitch && (
                    <div className="flex items-center gap-1 text-[10px] text-chat-meta">
                      <button
                        type="button"
                        onClick={() => switchBranch(m, -1)}
                        aria-label="上一个分支"
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-chat-line/70"
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
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-chat-line/70"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {/* 「更多操作」的三个点按钮已删（2026-10-29）：长按消息 = 同一个菜单，入口只留长按 */}

                {/* 长按消息 → **贴着这条消息弹出的深色菜单**（微信长按那种）。
                    portal 到 body，位置由 `menuRect` 算，所以不会被气泡或滚动容器裁掉。 */}
                {menuOpen && (
                  <MessageMenu anchor={menuRect} onClose={closeMenu}>
                    <div data-menu className="flex flex-col">
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
                        <MenuAction
                          icon={<Radio className="h-3.5 w-3.5" />}
                          label="设为今晚电台想听的"
                          onClick={() => {
                            closeMenu();
                            useGoodnightStore.getState().setRequest(m.content);
                            navigate('/goodnight');
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
                      icon={<Quote className="h-3.5 w-3.5" />}
                      label="引用"
                      onClick={() => {
                        closeMenu();
                        startQuote(m);
                      }}
                    />
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
                  </MessageMenu>
                )}
              </div>
            );
          })}
          </>
        )}
        <div ref={bottomRef} />
        </div>
        </div>

        {/* 右下角：回到最新（已经贴底时自动隐藏） */}
        {isChatView && !atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="回到底部"
            title="回到底部"
            data-testid="scroll-bottom"
            className="absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-chat-line bg-chat-pill text-chat-pill-fg shadow-md transition active:scale-95"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 输入区：与画布同底、不加分隔线 / 底色块；控件靠 border-chat-line + shadow 与气泡区分
          （+ 圆钮 / 模型药丸 + 输入 + 表情麦克风 / 发送圆钮） */}
      {isChatView && (
      <div
        data-testid="chat-input-bar"
        className="absolute inset-x-0 bottom-0 z-30 bg-transparent px-4 pb-4 pt-3"
      >
        {activeSkills.length > 0 && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap gap-1.5">
            {activeSkills.map((s) => (
              <span
                key={s.id}
                title={`触发：${s.reason}`}
                className="flex items-center gap-1 rounded-full bg-chat-accent/10 px-2 py-0.5 text-[11px] text-chat-accent"
              >
                {s.name}
              </span>
            ))}
          </div>
        )}
        {toolStatus && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-full bg-chat-pill px-3 py-1.5 text-xs text-chat-pill-fg shadow-sm">
            <Globe className="h-3.5 w-3.5 animate-pulse" />
            <span className="truncate">{toolStatus}</span>
          </div>
        )}
        {replyToId && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-full bg-chat-pill px-3 py-1.5 text-xs text-chat-pill-fg shadow-sm">
            <span className="flex-1 truncate">正在回复这条消息…</span>
            <button
              type="button"
              onClick={cancelReply}
              aria-label="取消回复"
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-chat-line/70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {quoteMsg && (
          <div
            data-testid="quote-banner"
            className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-xl border border-chat-quote-line bg-chat-quote px-3 py-1.5 text-xs text-chat-pill-fg shadow-sm"
          >
            <Quote className="h-3.5 w-3.5 shrink-0 text-chat-accent" />
            <span className="min-w-0 flex-1 truncate">{quoteMsg.label}</span>
            <button
              type="button"
              onClick={cancelQuote}
              aria-label="取消引用"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-chat-line/70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {pendingImages.length > 0 && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap gap-2">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.dataUrl} alt={img.name ?? '待发图片'} className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="移除图片"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-chat-meta text-white shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {confirming && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-chat-pill-fg">
            <span className="min-w-0 flex-1 truncate">⏸ 需要确认：{confirming.summary}</span>
            <button
              type="button"
              onClick={() => void answerConfirm('allow')}
              className="flex shrink-0 items-center gap-1 rounded-full bg-chat-accent px-2 py-1 text-xs text-chat-accent-fg"
            >
              <Check className="h-3 w-3" /> 允许
            </button>
            <button
              type="button"
              onClick={() => void answerConfirm('deny')}
              className="flex shrink-0 items-center gap-1 rounded-full bg-chat-pill px-2 py-1 text-xs text-chat-pill-fg shadow-sm"
            >
              <X className="h-3 w-3" /> 拒绝
            </button>
          </div>
        )}
        {/* 忌口 / 过敏命中提示（需求 §3）：条目来自动态档案，这里不写死任何食物名 */}
        {dietHits.length > 0 && (
          <div className="mx-auto mb-2 w-full max-w-3xl">
            <DietHitBar hits={dietHits} />
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl">
          {/* 设计稿：一整条胶囊输入（左「模型 ▾」+ 中间输入 + 右「表情 / 语音」），
              右侧再单拎一颗圆形「+」。对白风格入口搬进 + 面板，输入条不再挂药丸。 */}
          <div className="flex items-center gap-2.5">
            <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-1 rounded-full border border-chat-line bg-chat-pill pl-3.5 pr-1.5 shadow-sm transition focus-within:ring-1 focus-within:ring-chat-line">
              {/* 模型选择跟着参考图搬进输入条，顶栏就不挤了 */}
              <ModelPicker
                stationId={stationId}
                model={model}
                onChange={(sid, m) => {
                  setStationId(sid);
                  setModel(m);
                }}
                onBeforeOpen={() => {
                  setAttachOpen(false);
                  setStickerOpen(false);
                }}
              />
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
                data-testid="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => {
                  // 微信：一聚焦输入框就收面板（那边是弹键盘，这边没有键盘概念）
                  setAttachOpen(false);
                  setStickerOpen(false);
                  // 移动端：键盘弹起会把可视区压矮，等它动画结束再贴底，
                  // 否则按旧高度算出来的滚动位置会让最后一条消息被挡住。
                  window.setTimeout(() => {
                    bottomRef.current?.scrollIntoView({ block: 'end' });
                  }, 300);
                }}
                onKeyDown={(e) => {
                  // 输入法合成中按回车是确认候选词，不应触发发送
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter' && !busy) void send();
                }}
                placeholder={replyToId ? '回复这条消息…' : '说点什么…'}
                className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-chat-meta"
              />

            </div>

            {/* 最右·独立圆钮：空=「+」开面板 / 有字=「↑」发送 / 生成中=「■」停止。
                设计稿里这颗钮在胶囊**外面**，并随输入状态换成黑底白箭头。 */}
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="停止"
                data-testid="chat-stop"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-chat-line bg-chat-me text-chat-me-fg shadow-md transition active:scale-95"
              >
                <span className="block h-[11px] w-[11px] rounded-[2px] bg-current" />
              </button>
            ) : input.trim() || pendingImages.length > 0 ? (
              <button
                type="button"
                onClick={() => void send()}
                aria-label="发送"
                data-testid="chat-send"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-chat-line bg-chat-me text-chat-me-fg shadow-md transition active:scale-95"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAttachOpen((v) => !v);
                  setStickerOpen(false);
                }}
                aria-label="更多功能"
                aria-expanded={attachOpen}
                title="更多功能"
                data-testid="chat-attach"
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-chat-line shadow-md transition active:scale-95',
                  attachOpen ? 'bg-chat-me text-chat-me-fg' : 'bg-chat-pill text-chat-pill-fg hover:bg-chat-line',
                )}
              >
                <Plus className={cn('h-5 w-5 transition-transform', attachOpen && 'rotate-45')} />
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ===== 底部面板（设计稿：白色纸面上滑，顶部一撮抓手） =====
          两个面板共用同一块白纸底，来回切不会把消息区顶得一跳一跳。
          内容收进 max-w-[430px]，手机上铺满、桌面端不散。 */}
      {(attachOpen || stickerOpen) && (
        <div
          data-testid="chat-bottom-panel"
          data-panel={attachOpen ? 'attach' : 'sticker'}
          className={cn(
            'flex absolute inset-x-0 bottom-[80px] z-[31] flex-col rounded-t-[26px] bg-chat-sheet pb-[env(safe-area-inset-bottom)]',
            // 表情包要给格子留出高度；「+」面板按内容自适应（设计稿本来就矮一截）
            stickerOpen && 'h-[19rem]',
          )}
        >
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-10 rounded-full bg-chat-line" aria-hidden />
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
            {attachOpen ? (
              <div className="px-4 pb-3 pt-2">
                {/* 5 列：严格对齐设计稿（表情包 / 通话 / 图片 / 拍照 / 文件）。
                    礼物盒入口已删（2026-11-05：只留抽屉「生活小趣味」与 /gifts 路由）。 */}
                <div className="mx-auto grid w-full max-w-[430px] grid-cols-5 gap-x-2 gap-y-3" data-testid="attach-panel">
                  <AttachButton
                    icon={<Smile className="h-6 w-6" />}
                    label="表情包"
                    testid="attach-sticker"
                    onClick={() => {
                      setAttachOpen(false);
                      setStickerOpen(true);
                    }}
                  />
                  <AttachButton
                    icon={<Phone className="h-6 w-6" />}
                    label="通话"
                    testid="attach-call"
                    onClick={() => {
                      setAttachOpen(false);
                      startCall('voice');
                    }}
                  />
                  <AttachButton icon={<Image className="h-6 w-6" />} label="图片" onClick={() => fileRef.current?.click()} />
                  <AttachButton icon={<Camera className="h-6 w-6" />} label="拍照" onClick={() => cameraRef.current?.click()} />
                  <AttachButton
                    icon={<FileText className="h-6 w-6" />}
                    label="文件"
                    onClick={() => fileDocRef.current?.click()}
                  />
                  <AttachButton
                    icon={<Mic className="h-6 w-6" />}
                    label="语音"
                    onClick={() => {
                      setAttachOpen(false);
                      if (stt.listening) stt.stop();
                      else stt.start();
                    }}
                  />
                  {/* 对白风格入口在顶栏汉堡右边（chat-style-pill），这里不再重复 */}
                </div>
                <p className="mt-3 text-center text-[11px] text-chat-meta">表情包可继续导入 · 长按可管理</p>
              </div>
            ) : (
              <StickerPanel onPick={(emoji) => void sendSticker(emoji)} />
            )}
          </div>
        </div>
      )}

      {/* 微信式全屏搜索（搜索页里能看通话记录；「再打一通」由这里发起） */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onCallAgain={() => startCall('voice')}
      />

      {/* 通话记录详情（设计稿 9 页）：点聊天里那张通话卡打开 */}
      {callDetail && (
        <CallDetailSheet
          call={callDetail.call}
          ts={callDetail.ts}
          name={displayName || conversation?.title || '小蓝莓'}
          avatar={partnerAvatar}
          onClose={() => setCallDetail(null)}
          onCallAgain={() => {
            setCallDetail(null);
            startCall('voice');
          }}
        />
      )}

      {/* 通话浮层：只有「接通」后才挂出来。语音优先走 PaiVoice 实时语音层；没起 / 视频回退旧浮层 */}
      {callPhase === 'connected' &&
        (paiVoice?.up && sessionKind === 'voice' ? (
          <PaiVoiceOverlay
            wsUrl={paiVoice.wsUrl}
            name={displayName || '小蓝莓'}
            onEnd={(seconds) => endCall({ state: 'answered', seconds })}
          />
        ) : (
          <CallOverlay
            kind={sessionKind}
            name={displayName || '小蓝莓'}
            avatar={partnerAvatar}
            subtitle={lastAssistantLine}
            startConnected
            onEnd={(r) => endCall(r)}
          />
        ))}

      {/* 应用内浏览器：点消息里的链接就走这里，不跳出 App */}
      {browserUrl && <InAppBrowser url={browserUrl} onClose={() => setBrowserUrl(null)} />}

      {/* 思考链：下弹窗（气泡上方那颗「XX 的小心思」点开） */}
      {thoughtReasoning !== null && (
        <ThoughtSheet
          reasoning={thoughtReasoning}
          owner={ownerName}
          onClose={() => setThoughtReasoning(null)}
        />
      )}

      {/* 多图堆叠卡点开的大图：整页纯色不透明，带前后翻页 */}
      {photoView && (
        <div data-testid="photo-viewer" className="fixed inset-0 z-[1400] flex flex-col bg-page-bg text-foreground">
          <div className="flex h-14 shrink-0 items-center justify-between px-3 text-foreground">
            <button
              type="button"
              onClick={() => setPhotoView(null)}
              aria-label="关闭大图"
              data-testid="photo-viewer-close"
              className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-surface-2"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {photoView.urls.length > 1 ? `${photoView.index + 1} / ${photoView.urls.length}` : ''}
            </span>
            <span className="w-9" />
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
            {photoView.urls.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setPhotoView({
                    ...photoView,
                    index: (photoView.index - 1 + photoView.urls.length) % photoView.urls.length,
                  })
                }
                aria-label="上一张"
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:bg-surface-2"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <img
              src={photoView.urls[photoView.index]}
              alt="照片"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            {photoView.urls.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setPhotoView({
                    ...photoView,
                    index: (photoView.index + 1) % photoView.urls.length,
                  })
                }
                aria-label="下一张"
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:bg-surface-2"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

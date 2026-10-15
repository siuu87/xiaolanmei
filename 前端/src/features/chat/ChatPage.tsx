import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUp,
  ArrowDown,
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
  MoreHorizontal,
  Copy,
  Menu,
  Puzzle,
  Globe,
  Phone,
  Video,
  User,
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
  Sparkles,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
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
import { AvatarContent } from '@/components/AvatarContent';
import { SearchOverlay } from './SearchOverlay';
import { ChatDrawer } from './ChatDrawer';
import { ModelPicker } from './ModelPicker';
import { StickerPanel } from './StickerPanel';
import { CallOverlay, type CallResult } from './CallOverlay';
import { createCall, fmtDuration, type CallKind } from '@/lib/api/calls';
import { InAppBrowser } from './InAppBrowser';
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-chat-line/70"
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
        'flex items-center gap-1.5 rounded-full bg-chat-pill px-2.5 py-1.5 text-xs text-chat-pill-fg shadow-sm transition hover:bg-chat-line',
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

/**
 * 气泡前的圆形头像：两边都用「各自的头像」。
 *
 * 参考图里左右两边都是有脸的（右边是那只兔子），所以这里不再给我方画一个通用小人，
 * 而是取「我」的头像（默认 🫐）；抽屉/设置里换过就立刻同步。
 * 头像可能是 emoji 也可能是图片 URL，一律交给 AvatarContent 判。
 */
function BubbleAvatar({ mine }: { mine: boolean }) {
  const myAvatar = useProfileStore((s) => s.avatar);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const value = mine ? myAvatar : partnerAvatar;
  return (
    <span
      data-testid={mine ? 'bubble-avatar-me' : 'bubble-avatar-partner'}
      className={cn(
        // 参考图里小人「站在白纸上」，不该有阴影；两边统一一层很淡的中性底就够了。
        // 不再用 mb-[18px]——那是旧的「整体底部对齐」遗留，现在头像对齐气泡顶部。
        'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-chat-line/60 text-chat-pill-fg',
      )}
    >
      {value ? (
        <AvatarContent value={value} fallback={mine ? '🫐' : '🐰'} className="text-[19px]" />
      ) : mine ? (
        <User className="h-4 w-4" />
      ) : (
        <ClaudeMark className="h-4 w-4" />
      )}
    </span>
  );
}

/**
 * 分组时间戳（参考图那行「03/26 23:20」）。
 *
 * 关键：它**不是**独立一行，而是跟在气泡**内侧**（你那条在气泡左边、TA 那条在右边），
 * 并且和气泡底部对齐——父级 `items-end` 负责底对齐，所以这里只需 `shrink-0`。
 */
function InlineStamp({ ts }: { ts?: number }) {
  const d = ts ? new Date(ts) : null;
  if (!d) return null;
  const p = (n: number) => n.toString().padStart(2, '0');
  return (
    <span
      data-testid="msg-stamp"
      className="shrink-0 self-end pb-0.5 text-[11px] tabular-nums text-chat-meta"
    >
      {`${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`}
    </span>
  );
}

/**
 * 一条消息的行容器（参考图那套排版）：
 *
 *     [头像] [气泡][时间戳]      ← TA 的（我们的 `flex-row`）
 *     [时间戳][气泡] [头像]      ← 我的（`flex-row-reverse` 整体镜像）
 *
 * 头像与气泡**顶部**对齐，时间戳贴气泡**内侧**并与气泡**底部**对齐。
 * 时间戳做成气泡行的兄弟节点而不是外层列里的独立行，就是为了让它横向落在气泡旁边。
 */
function MsgRow({
  mine,
  stamp,
  above,
  below,
  children,
}: {
  mine: boolean;
  stamp?: React.ReactNode;
  /** 气泡**上方**的整宽内容（引用卡） */
  above?: React.ReactNode;
  /** 气泡**下方**的内容（内心独白） */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
      <BubbleAvatar mine={mine} />
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

/** 居中日期分隔（参考图：两侧细线 + 「6月30日 · 00:10」） */
function DateDivider({ label }: { label: string }) {
  return (
    <div data-testid="date-divider" className="flex items-center gap-3 px-2 py-3">
      <span className="h-px flex-1 bg-chat-line" aria-hidden />
      <span className="shrink-0 text-[11px] text-chat-meta">{label}</span>
      <span className="h-px flex-1 bg-chat-line" aria-hidden />
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

/** 语音消息气泡：▶ / 波形 / mm:ss / ⤓（参考图底部那条） */
function VoiceBubble({ ms, text }: { ms: number; text: string }) {
  const [playing, setPlaying] = useState(false);

  // 占位播放：只驱动进度与暂停，不真的出声（TTS 还没接）
  useEffect(() => {
    if (!playing) return;
    if (ms <= 0) return;
    const t = window.setTimeout(() => setPlaying(false), ms);
    return () => window.clearTimeout(t);
  }, [playing, ms]);

  const total = Math.max(0, Math.round(ms / 1000));
  const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  // 稳定的伪波形：同一段文案每次渲染形状一致（不用随机数，避免重渲染抖）
  const bars = useMemo(() => {
    let seed = 0;
    for (const ch of text || 'voice') seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
    return Array.from({ length: 22 }, (_, i) => 5 + ((seed >> i % 12) % 9) + (i % 5 === 0 ? 4 : 0));
  }, [text]);

  return (
    <div data-testid="voice-bubble" className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setPlaying((v) => !v)}
        aria-label={playing ? '暂停' : '播放'}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-chat-me-fg transition',
          'bg-black/[0.06] hover:bg-black/[0.1] dark:bg-white/[0.08] dark:hover:bg-white/[0.14]',
        )}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <span className="flex items-center gap-[2px]" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn('w-[2px] rounded-full bg-current opacity-45', playing && 'soundwave-bar opacity-70')}
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
  );
}

/** 通话记录卡：语音通话 02:17 / 已拒接 / 未接来电 已回拨 */
function CallRecordCard({ call }: { call: NonNullable<ChatMessage['call']> }) {
  const missed = call.state === 'missed';
  const declined = call.state === 'declined';
  const secs = call.seconds ?? 0;
  const dur = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const label =
    call.state === 'answered' ? `${call.kind === 'video' ? '视频通话' : '语音通话'} ${dur}`
    : declined ? '已拒接'
    : '未接来电 已回拨';
  const Icon = missed ? PhoneMissed : declined ? PhoneOutgoing : PhoneIncoming;

  return (
    <div
      data-testid="call-record"
      data-state={call.state}
      className={cn(
        'inline-flex items-center gap-2 rounded-2xl border border-chat-line bg-chat-pill px-3 py-2 text-[14px] text-chat-pill-fg',
        missed && 'border-transparent bg-chat-line/70',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', missed ? 'text-destructive' : 'text-chat-call-in')} />
      <span>{label}</span>
    </div>
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
 * 思考链入口（内联版）：三个圆点（思考中弹动，完成后 ✓）。
 *
 * 它不再是气泡上方独立一行，而是**接在正文第一句话之后、同一段里**（见 `AssistantBody`）。
 * 所以：① 必须是 `inline-flex` + `align-middle` 才能跟着文字基线走；
 * ② 必须**足够窄**——早先沿用「Thought process」那种大胶囊有 104px 宽，
 *   在 420px 手机上接在首句后面根本放不下，会被挤到第二行行首，看起来又变回独立一行了。
 *   这里收成「✓ 思考链」约 60px，才能真正咬在首句后面。
 */
function ThoughtChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="thought-entry"
      title="思考链"
      aria-label="查看思考链"
      onClick={onClick}
      className={cn(
        'mx-1 inline-flex translate-y-[-1px] items-center gap-[3px] rounded-full px-1.5 py-[2px]',
        'align-middle text-[11px] leading-none opacity-75 transition',
        // 气泡底色可能是浅蓝也可能是浅灰，用「压一层黑」而不写死底色，两套主题都不会撞
        'bg-black/[0.08] hover:bg-black/[0.14] dark:bg-white/[0.14] dark:hover:bg-white/[0.22]',
      )}
    >
      {active ? (
        <span className="flex items-center gap-[3px]">
          <span className="think-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '0ms' }} />
          <span className="think-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '150ms' }} />
          <span className="think-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: '300ms' }} />
        </span>
      ) : (
        <Check className="h-3 w-3 shrink-0" />
      )}
      <span>思考链</span>
    </button>
  );
}

/** 正文以这些块级语法开头时，切句会把结构切坏——这时不内联，退回「胶囊在正文之前」 */
const BLOCK_START = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\|)/;

/**
 * 把正文切成「第一句」和「其余」。
 *
 * 切点取第一个句末标点（。！？!?…）或第一个换行；没有句末标点时整段算第一句。
 * 返回 `null` 表示**别切**（正文以块级 markdown 开头），调用方走降级分支。
 */
function splitFirstSentence(text: string): { head: string; tail: string } | null {
  if (!text.trim()) return null;
  if (BLOCK_START.test(text)) return null;
  const m = /[。！？!?…]|\n/.exec(text);
  if (!m) return { head: text, tail: '' };
  const end = m[0] === '\n' ? m.index : m.index + 1;
  return { head: text.slice(0, end), tail: text.slice(end) };
}

/** 「其余」里还有没有块级结构：有就必须另起段落，没有就跟首句连在同一段里 */
function hasBlockStart(text: string): boolean {
  return BLOCK_START.test(text) || /\n\s*\n/.test(text);
}

/**
 * AI 正文（含思考链）。
 *
 * 思考链的落点规则（用户要求）：**只在「回复之后的第一句」上**——也就是接在正文第一句
 * 后面、和第一句同一段；正文剩下的话继续跟在它后面（同段）或另起段落（有块级结构时）。
 * 三种降级：① 还没出正文 → 胶囊单独站着（配「思考中…」）；② 没思考链 → 纯正文；
 * ③ 正文以块级 markdown 开头 → 胶囊回到正文之前，不硬切。
 */
function AssistantBody({
  content,
  reasoning,
  streaming,
  onOpenThought,
}: {
  content: string;
  reasoning?: string;
  streaming: boolean;
  onOpenThought: () => void;
}) {
  if (!content) {
    return (
      <>
        {reasoning ? (
          <span className="block">
            <ThoughtChip active={streaming} onClick={onOpenThought} />
          </span>
        ) : null}
        {streaming && !reasoning ? <span className="text-chat-meta">思考中…</span> : null}
      </>
    );
  }

  if (!reasoning) return <Markdown>{content}</Markdown>;

  const split = splitFirstSentence(content);
  if (!split) {
    return (
      <>
        <span className="mb-1.5 block">
          <ThoughtChip active={false} onClick={onOpenThought} />
        </span>
        <Markdown>{content}</Markdown>
      </>
    );
  }

  const { head, tail } = split;
  const tailInline = !!tail && !hasBlockStart(tail);
  return (
    <>
      <span className="block">
        <Markdown inline>{head}</Markdown>
        <ThoughtChip active={false} onClick={onOpenThought} />
        {tailInline ? <Markdown inline>{tail}</Markdown> : null}
      </span>
      {!tailInline && tail ? <Markdown>{tail}</Markdown> : null}
    </>
  );
}

/** 思考链弹窗：白色大圆角卡片 + 半透明灰蒙版 + 左上角黑色× */
function ThoughtModal({ reasoning, onClose }: { reasoning: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[72vh] w-full max-w-md flex-col rounded-3xl bg-card p-5 shadow-2xl">
        <div className="relative mb-4 flex items-center justify-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute left-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-foreground transition hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold text-foreground">思考链</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{reasoning}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 底部面板里的单个入口（微信式：白色圆角方块 + 方块下方一行小字）。
 * `[&_svg]` 是为了不用挨个改 4 个调用点的图标尺寸。
 */
/**
 * 「+」面板里的一张功能卡。
 *
 * 统一规格：单元格内**居中**、图标方块 h-14 w-14 定尺、圆角 2xl、标签 11px。
 * 卡片宽度由父级等宽网格给（`w-full`），所以每格一样宽 —— 不要再在按钮上写死宽度。
 * 触控反馈走整卡 `active:scale-95`（比只缩图标方块更跟手）。
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
      className="group flex w-full flex-col items-center gap-1.5 rounded-xl py-1 transition duration-150 active:scale-95"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-chat-pill text-chat-pill-fg shadow-sm transition group-hover:bg-chat-line [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
      <span className="text-[11px] leading-none text-chat-meta">{label}</span>
    </button>
  );
}

/**
 * 「新消息形态」预览样本。
 *
 * 参考图里的引用卡 / 内心独白 / 语音气泡 / 通话记录目前都**没有数据来源**
 * （没有 TTS、没有通话记录表），所以这里用一个纯内存开关把它们摆出来看效果：
 * 不写后端、不进 localStorage、也不会被 toPayload 送进模型上下文。
 */
interface ShapeSample {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quote?: { label: string };
  inner?: string;
  voiceMs?: number;
  call?: NonNullable<ChatMessage['call']>;
  /** 相对「现在」往前推的毫秒数，把几条样本排成一条递增的时间线 */
  ago: number;
}

const SHAPE_SAMPLES: ShapeSample[] = [
  { id: 'demo-quote', role: 'assistant', content: '会员卡做完了吗，给我看最终版。', quote: { label: 'Inside' }, ago: 5 * 60_000 },
  { id: 'demo-inner', role: 'assistant', content: '手机放下。', inner: '写了内心', ago: 4 * 60_000 },
  { id: 'demo-voice', role: 'user', content: '（语音消息）', voiceMs: 12_000, ago: 3 * 60_000 },
  { id: 'demo-call-ok', role: 'assistant', content: '（语音通话 02:17）', call: { kind: 'voice', state: 'answered', seconds: 137 }, ago: 2 * 60_000 },
  { id: 'demo-call-declined', role: 'assistant', content: '（已拒接）', call: { kind: 'voice', state: 'declined' }, ago: 90_000 },
  { id: 'demo-call-missed', role: 'assistant', content: '（未接来电 已回拨）', call: { kind: 'voice', state: 'missed' }, ago: 45_000 },
];

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
  const partnerName = useProfileStore((s) => s.partnerName);
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
  /** 正在进行的通话类型（null = 没在通话）。语音/视频共用这一个浮层。 */
  const [callKind, setCallKind] = useState<CallKind | null>(null);
  /** 呼出时刻，挂断时作为 startedAt 落库 */
  const callStartedRef = useRef(0);
  /** 应用内浏览器要打开的地址（null = 关闭） */
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  /** 「新消息形态」预览开关：**只在本组件内存里**，不写库、不进模型上下文 */
  const [shapePreview, setShapePreview] = useState(false);
  /** 是否已贴底：决定右下角浮出的「回到底部」圆钮显示不显示 */
  const [atBottom, setAtBottom] = useState(true);
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

  /** 发起通话：记下时刻（结算时用来算 startedAt），视频通话会一进去就请求摄像头 */
  const startCall = (kind: CallKind) => {
    callStartedRef.current = Date.now();
    setCallKind(kind);
  };

  /**
   * 挂断结算。两件事，都有意保留：
   *   1. 写 `calls` 表 —— 时长的**唯一事实来源**，用于统计（这条路上不依赖消息）；
   *   2. 往聊天流推一张内联卡片 —— 让「我们通过话」留在对话里、跟着分支走。
   * 卡片上的 seconds 直接用本次结果，不回头查库，省一次往返。
   * 落库失败也不该吞掉卡片：先记 console，卡片照发（消息本身有自己的持久化）。
   */
  const endCall = async (result: CallResult) => {
    const kind = callKind ?? 'voice';
    const startedAt = callStartedRef.current || Date.now();
    setCallKind(null);

    try {
      await createCall({
        kind,
        state: result.state,
        seconds: result.seconds,
        conversationId: conversation?.id ?? null,
        startedAt,
        endedAt: Date.now(),
      });
    } catch (e) {
      console.error('通话记录落库失败', e);
    }

    const conv = useChatStore.getState().conversation;
    if (!conv) return;
    const label = kind === 'video' ? '视频通话' : '语音通话';
    await appendMessage({
      id: uid(),
      role: 'assistant',
      // content 是给模型看的上下文（跟卡片上显示的不是一回事），别删
      content:
        result.state === 'answered'
          ? `（${label} ${fmtDuration(result.seconds)}）`
          : `（${label}未接通）`,
      parentId: conv.activeMessageId,
      status: 'done',
      call: { kind, state: result.state, seconds: result.seconds },
      createdAt: Date.now(),
    });
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
    <div className="relative flex h-full flex-col bg-chat-bg text-foreground">
      {/* 顶栏：纯白底 + 一排白色圆形药丸按钮（参考图那套语言）。
          底和栏现在都是白的，所以靠这条 1px 描边分界。 */}
      <div
        data-testid="chat-topbar"
        className="flex shrink-0 items-center gap-2 border-b border-chat-line bg-chat-bar px-3 py-2.5"
      >
        {/* 移动端：汉堡 → 主抽屉（桌面有左侧常驻栏，不给重复入口） */}
        <button
          type="button"
          onClick={openDrawer}
          aria-label="打开菜单"
          title="菜单"
          data-testid="chat-hamburger"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition hover:bg-chat-line active:scale-95 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {/* 桌面端：抽屉不生效，工具箱得留个直接入口，否则功能失联 */}
        <button
          type="button"
          onClick={openToolbox}
          aria-label="工具箱"
          title="插件 / 世界书 / 工作区 / 技能"
          data-testid="chat-toolbox-desktop"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition hover:bg-chat-line active:scale-95 md:flex"
        >
          <Puzzle className="h-4 w-4" />
        </button>
        {/* 中间状态槽：会话标题 + 伴侣挂件（TA 头像 + 在一起天数） */}
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          <span
            data-testid="chat-title"
            className="min-w-0 truncate font-serif text-[15px] font-semibold text-foreground"
          >
            {/* 称呼：抽屉里改过就用自定义的，没改过还是沿用会话标题 */}
            {partnerName || conversation?.title || '小蓝莓'}
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-chat-pill px-2 py-0.5 text-[10px] text-chat-meta shadow-sm sm:flex">
            <AvatarContent value={partnerAvatar} fallback="🐰" className="h-3.5 w-3.5 text-[11px]" />
            <span>在一起 {loveDayCount} 天</span>
          </span>
        </span>
        <ConnDot />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="搜索记录"
          title="搜索记录"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition hover:bg-chat-line active:scale-95"
        >
          <Search className="h-4 w-4" />
        </button>
        {/* 通话入口**不在这里**：按需求顶栏保持简洁，通话已收进输入框的「+」面板 */}
        {/* 移动端：⋮ → 工具箱（桌面已由 Puzzle 药丸承担，不给重复入口） */}
        <button
          type="button"
          onClick={openToolbox}
          aria-label="更多"
          title="工具箱"
          data-testid="chat-more"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition hover:bg-chat-line active:scale-95 md:hidden"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* 消息列表 + 右下角「回到底部」圆钮 */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-testid="chat-scroller"
          onScroll={onListScroll}
          onClick={onListClick}
          className="scrollbar-thin h-full overflow-y-auto overscroll-contain bg-chat-bg px-4 py-4"
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
            <MsgRow mine={false} stamp={<InlineStamp ts={Date.now()} />}>
              <div
                className="rounded-[18px] bg-chat-ai px-4 py-2.5 text-[15px] leading-6 text-chat-ai-fg"
                style={
                  { '--foreground': 'var(--chat-ai-fg)', '--muted-foreground': 'var(--chat-meta)' } as React.CSSProperties
                }
              >
                <Markdown>{WELCOME_TEXT}</Markdown>
              </div>
            </MsgRow>
            {/* 空会话时没有 ⋯ 菜单，这里补一个入口，否则新形态预览没人点得到 */}
            <button
              type="button"
              onClick={() => setShapePreview((v) => !v)}
              className="ml-10 mt-2 rounded-full bg-chat-pill px-3 py-1 text-[11px] text-chat-pill-fg shadow-sm transition hover:bg-chat-line"
            >
              {shapePreview ? '收起消息形态预览' : '看看新消息形态'}
            </button>
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

            return (
              <div key={m.id} className="flex flex-col">
                {/* 跨天：居中日期分隔（「6月30日 · 00:10」，两侧细线） */}
                {needDate && (
                  <DateDivider label={`${fmtDateLabel(m.createdAt)} · ${fmtTime(m.createdAt)}`} />
                )}
                {/* 消息行：参考图排版——头像对齐气泡顶部、时间戳贴气泡内侧且底对齐 */}
                <div
                  className="mb-2"
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
                  <MsgRow
                    mine={m.role === 'user'}
                    stamp={needStamp ? <InlineStamp ts={m.createdAt} /> : null}
                    above={m.quote ? <QuoteCard label={m.quote.label} /> : null}
                    below={m.inner ? <InnerNote text={m.inner} /> : null}
                  >
                    {/* 通话记录卡：不是气泡，是一张卡 */}
                    {m.call ? (
                      <CallRecordCard call={m.call} />
                    ) : (
                    <div
                      className={cn(
                        'text-[15px] leading-6',
                        !isEditing && 'select-none',
                        'rounded-[18px] px-4 py-2.5',
                        m.role === 'user'
                          // 己方：浅蓝气泡、深墨字
                          ? 'whitespace-pre-wrap bg-chat-me text-chat-me-fg'
                          // 对方：浅灰气泡、近黑字
                          : 'bg-chat-ai text-chat-ai-fg',
                        m.sticker && 'bg-transparent p-0',
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
                              m.role === 'user' ? 'bg-black/[0.06] text-chat-me-fg' : 'bg-chat-line/60 text-chat-ai-fg',
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
                        <VoiceBubble ms={m.voiceMs} text={m.content} />
                      ) : m.role === 'assistant' ? (
                        <AssistantBody
                          content={m.content}
                          reasoning={m.reasoning}
                          streaming={m.status === 'streaming'}
                          onOpenThought={() => setThoughtReasoning(m.reasoning ?? '')}
                        />
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
                    )}
                  </MsgRow>
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
                    m.role === 'user' ? 'justify-end pr-10' : 'pl-10',
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
                  <button
                    type="button"
                    data-menu
                    onClick={() => toggleMenu(m.id)}
                    aria-label="更多操作"
                    className="flex h-5 w-5 items-center justify-center rounded text-chat-meta transition hover:bg-chat-line/70 hover:text-foreground"
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
                      icon={<Sparkles className="h-3.5 w-3.5" />}
                      label={shapePreview ? '关闭形态预览' : '形态预览'}
                      onClick={() => {
                        closeMenu();
                        setShapePreview((v) => !v);
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
                )}
              </div>
            );
          })}
          </>
        )}
        {/* 「新消息形态」预览：纯本地渲染，不入库、不进模型上下文 */}
        {shapePreview && (
          <div
            data-testid="shape-preview"
            className="mt-5 rounded-2xl border border-dashed border-chat-line bg-chat-line/20 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-chat-meta">
                新消息形态预览（仅本地展示：不入库、不进模型上下文）
              </span>
              <button
                type="button"
                onClick={() => setShapePreview(false)}
                className="shrink-0 rounded-full bg-chat-pill px-2.5 py-1 text-[11px] text-chat-pill-fg shadow-sm"
              >
                关闭
              </button>
            </div>
            <div className="flex flex-col">
              {SHAPE_SAMPLES.map((s) => (
                <MsgRow
                  key={s.id}
                  mine={s.role === 'user'}
                  stamp={<InlineStamp ts={Date.now() - s.ago} />}
                  above={s.quote ? <QuoteCard label={s.quote.label} /> : null}
                  below={s.inner ? <InnerNote text={s.inner} /> : null}
                >
                  {s.call ? (
                    <CallRecordCard call={s.call} />
                  ) : (
                    <div
                      className={cn(
                        'rounded-[18px] px-4 py-2.5 text-[15px] leading-6',
                        s.role === 'user' ? 'bg-chat-me text-chat-me-fg' : 'bg-chat-ai text-chat-ai-fg',
                      )}
                    >
                      {s.voiceMs ? <VoiceBubble ms={s.voiceMs} text={s.content} /> : s.content}
                    </div>
                  )}
                </MsgRow>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
        </div>
        </div>

        {/* 右下角：回到最新（已经贴底时自动隐藏） */}
        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="回到底部"
            title="回到底部"
            data-testid="scroll-bottom"
            className="absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-md ring-1 ring-chat-line transition active:scale-95"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 输入区：暖奶白底一条（+ 圆钮 / 模型药丸 + 输入 + 表情麦克风 / 深色发送圆钮） */}
      <div
        data-testid="chat-input-bar"
        className="shrink-0 border-t border-chat-line bg-chat-bar px-4 pb-3 pt-3"
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
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                // 微信：两个面板互斥，再点一次收起
                setAttachOpen((v) => !v);
                setStickerOpen(false);
              }}
              aria-label="添加附件"
              title="添加附件"
              data-testid="chat-attach"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg shadow-sm transition hover:bg-chat-line active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
            {/* 输入胶囊：模型药丸 + 输入框 + 表情 + 麦克风 */}
            <div className="flex min-h-[38px] min-w-0 flex-1 items-center gap-1.5 rounded-[19px] bg-chat-pill px-2 py-1 shadow-sm ring-1 ring-transparent transition focus-within:ring-chat-accent/40">
              {/* 模型选择跟着参考图搬进输入条，顶栏就不挤了 */}
              <ModelPicker
                stationId={stationId}
                model={model}
                onChange={(sid, m) => {
                  setStationId(sid);
                  setModel(m);
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
                }}
                onKeyDown={(e) => {
                  // 输入法合成中按回车是确认候选词，不应触发发送
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter' && !busy) void send();
                }}
                placeholder={replyToId ? '回复这条消息…' : 'Message...'}
                className="h-8 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-chat-meta"
              />
              {/* 表情包（在输入框旁，点了面板向下展开） */}
              <button
                type="button"
                onClick={() => {
                  setStickerOpen((v) => !v);
                  setAttachOpen(false);
                }}
                aria-label="表情包"
                aria-expanded={stickerOpen}
                title="表情包"
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition',
                  stickerOpen ? 'text-chat-accent' : 'text-chat-meta hover:text-chat-pill-fg',
                )}
              >
                <Smile className="h-[18px] w-[18px]" />
              </button>
              {/* 麦克风：录音还没接，点了直说，不假装能录 */}
              <button
                type="button"
                onClick={() => {
                  setToolStatus('语音录制还没接入，先用文字吧');
                  window.setTimeout(() => setToolStatus(null), 2600);
                }}
                aria-label="语音消息"
                title="语音消息（尚未接入录音）"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-chat-meta transition hover:text-chat-pill-fg"
              >
                <Mic className="h-[18px] w-[18px]" />
              </button>
            </div>
            {/* 发送 / 停止：深色圆形按钮（浅色主题下就是参考图那颗） */}
            <button
              type="button"
              onClick={busy ? stop : send}
              aria-label={busy ? '停止' : '发送'}
              disabled={!busy && !input.trim() && pendingImages.length === 0}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95',
                'disabled:opacity-30',
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

      {/* ===== 微信式底部面板：`+` 与表情包都**往下**长，铺满宽度 =====
          两个面板共用同一个固定高度，来回切不会把消息区顶得一跳一跳。
          内容再收进 max-w-3xl 跟输入行对齐（桌面端不会把方块甩到天边）。 */}
      {(attachOpen || stickerOpen) && (
        <div
          data-testid="chat-bottom-panel"
          data-panel={attachOpen ? 'attach' : 'sticker'}
          className="h-64 shrink-0 border-t border-chat-line bg-chat-bg pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto h-full w-full max-w-3xl">
            {attachOpen ? (
              /* 等宽网格：4 列、每格同宽（卡片自身相对单元格居中）。
                 `w-full` + `max-w-[340px]`：手机上铺满、桌面端封顶 —— 否则 max-w-3xl 里
                 4 等分会把 56px 的方块甩得东一个西一个。 */
              <div
                className="grid w-full max-w-[340px] grid-cols-4 gap-x-1 gap-y-2.5 p-3"
                data-testid="attach-panel"
              >
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
                  icon={<Phone className="h-5 w-5" />}
                  label="语音通话"
                  testid="attach-call-voice"
                  onClick={() => {
                    setAttachOpen(false);
                    startCall('voice');
                  }}
                />
                <AttachButton
                  icon={<Video className="h-5 w-5" />}
                  label="视频通话"
                  testid="attach-call-video"
                  onClick={() => {
                    setAttachOpen(false);
                    startCall('video');
                  }}
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
            ) : (
              <StickerPanel onPick={(emoji) => void sendSticker(emoji)} />
            )}
          </div>
        </div>
      )}

      {/* 微信式全屏搜索 */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChatDrawer open={toolboxOpen} onClose={closeToolbox} />

      {/* 通话浮层（语音 / 视频共用）。挂断 → endCall 落库 + 往聊天流推卡片 */}
      {callKind && (
        <CallOverlay
          kind={callKind}
          name={partnerName || '小蓝莓'}
          avatar={partnerAvatar}
          onEnd={(r) => void endCall(r)}
        />
      )}

      {/* 应用内浏览器：点消息里的链接就走这里，不跳出 App */}
      {browserUrl && <InAppBrowser url={browserUrl} onClose={() => setBrowserUrl(null)} />}

      {/* 思考链弹窗 */}
      {thoughtReasoning !== null && (
        <ThoughtModal reasoning={thoughtReasoning} onClose={() => setThoughtReasoning(null)} />
      )}
    </div>
  );
}

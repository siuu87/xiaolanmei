import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Trash2,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMessages, type SearchResultDTO } from '@/lib/api/conversations';
import { listCalls, fmtDuration, callStatusWord, type CallDTO } from '@/lib/api/calls';
import { useChatStore } from './chatStore';
import { ChatCalendar } from './ChatCalendar';
import { CallDetailSheet } from './CallDetailSheet';

const RECENT_KEY = 'blueberry.search.recent';
/** 结果分组默认展开条数（仿微信：只列前几条，其余进「查看全部」） */
const SECTION_PREVIEW = 3;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** 结果片段：截断 + 命中关键词高亮（玫瑰色，跟 chat 页强调色一套）。
 *  full=true 时展示全文不截断（二级详情页用），且逐处高亮所有命中。 */
function Snippet({ text, q, full = false }: { text: string; q?: string; full?: boolean }) {
  const needle = q?.trim() ?? '';
  const idx = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  let start = 0;
  let end = text.length;
  if (!full) {
    end = Math.min(text.length, 120);
    if (idx >= 0) {
      start = Math.max(0, idx - 24);
      end = Math.min(text.length, idx + needle.length + 64);
    }
  }
  const slice = text.slice(start, end);
  const pre = start > 0 ? '…' : '';
  const post = end < text.length ? '…' : '';
  if (!needle) {
    return (
      <span>
        {pre}
        {slice}
        {post}
      </span>
    );
  }
  const kw = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let hit = slice.toLowerCase().indexOf(kw, from);
  while (hit >= 0) {
    parts.push(slice.slice(from, hit));
    parts.push(
      <mark key={`${hit}`} className="bg-transparent font-semibold text-chat-accent">
        {slice.slice(hit, hit + needle.length)}
      </mark>,
    );
    from = hit + needle.length;
    hit = slice.toLowerCase().indexOf(kw, from);
  }
  parts.push(slice.slice(from));
  return (
    <span>
      {pre}
      {parts}
      {post}
    </span>
  );
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateShort(ds: string): string {
  const [, m, d] = ds.split('-').map(Number);
  return `${m}月${d}日`;
}

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** 通话 → 可搜索文本：类型 / 状态 / 时长 / 日期都能被关键词命中 */
function callText(c: CallDTO): string {
  const ts = c.startedAt ?? c.createdAt;
  const dur = c.state === 'answered' && c.seconds > 0 ? ` · ${fmtDuration(c.seconds)}` : '';
  return `${c.kind === 'video' ? '视频通话' : '语音通话'}${dur} · ${callStatusWord(c)} · ${fmtTime(ts)} · ${dayLabel(ts)}`;
}

/** 本地时区某一天 [start, end) */
function dayRange(ds: string): [number, number] | null {
  const parts = ds.split('-').map(Number);
  if (parts.length !== 3 || !parts.every((n) => Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()];
}

interface ConvGroup {
  id: string;
  title: string;
  items: SearchResultDTO[];
  latest: number;
}

type Kind = 'media' | 'file' | 'link' | 'sticker';
type CategoryKey = 'date' | Kind | 'call';

const KIND_LABEL: Record<Kind, string> = {
  media: '图片与视频',
  file: '文件',
  link: '链接',
  sticker: '表情',
};

/** 「搜索指定内容」分类网格：三列，与微信搜索首屏一致的排版 */
const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'date', label: '日期' },
  { key: 'media', label: '图片与视频' },
  { key: 'file', label: '文件' },
  { key: 'link', label: '链接' },
  { key: 'sticker', label: '表情' },
  { key: 'call', label: '通话记录' },
];

/**
 * 微信式全屏搜索页：关键词 / 日期 / 图片 / 文件 / 链接 / 表情 / 通话记录 七合一。
 *
 * 首屏（无任何条件）：「搜索指定内容」三列分类网格 + 最近通话 + 最近搜索。
 * 有结果时：
 *  - 顶部「通话记录」独立分组（关键词/日期命中，点条目进通话详情）。
 *  - 下面「聊天记录」按会话聚合（微信的「N 条相关聊天记录」），点会话进该会话的匹配列表，
 *    再点单条才跳回聊天并定位高亮。
 *  - 分类网格里的「通话记录」走独立视图，只看通话。
 * 命中关键词绿色高亮。
 */
export function SearchOverlay({
  open,
  onClose,
  onCallAgain,
}: {
  open: boolean;
  onClose: () => void;
  /** 详情页「再打一通」：由 ChatPage 提供（关搜索 + 发起通话） */
  onCallAgain?: () => void;
}) {
  const setActiveMessage = useChatStore((s) => s.setActiveMessage);
  const conversationId = useChatStore((s) => s.conversation?.id);

  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [callOnly, setCallOnly] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [results, setResults] = useState<SearchResultDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  /** 通话记录：打开时拉全量（只看本会话），按关键词 / 日期过滤 */
  const [calls, setCalls] = useState<CallDTO[]>([]);
  const [callDetail, setCallDetail] = useState<{ call: CallDTO; ts: number } | null>(null);
  /** 二级视图：正在查看哪个会话的全部匹配消息 */
  const [activeConv, setActiveConv] = useState<string | null>(null);
  /** 日期页点空那天的提示（有聊天就直接跳走了，不会看到） */
  const [dayMiss, setDayMiss] = useState('');

  const hasFilter = q.trim() !== '' || !!date || !!kind || callOnly;

  const runSearch = async () => {
    const kw = q.trim();
    setLoading(true);
    try {
      const { results } = await searchMessages({
        q: kw || undefined,
        date: date || undefined,
        hasImage: kind === 'media' || undefined,
        hasFile: kind === 'file' || undefined,
        hasLink: kind === 'link' || undefined,
        hasSticker: kind === 'sticker' || undefined,
      });
      setResults(results);
      setSearched(true);
      if (kw) {
        setRecent((prev) => {
          const next = [kw, ...prev.filter((x) => x !== kw)].slice(0, 10);
          saveRecent(next);
          return next;
        });
      }
    } catch (err) {
      console.error('搜索失败', err);
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  // 实时搜索（防抖 300ms）：任一条件变化即搜；空条件或通话视图则退回
  useEffect(() => {
    if (!open) return;
    if (callOnly) {
      setResults([]);
      setSearched(false);
      return;
    }
    if (!hasFilter) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, date, kind, callOnly, open]);

  // 打开时拉一次本会话的通话记录（全量，供首屏与结果区匹配）
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listCalls(conversationId)
      .then((rows) => {
        if (alive) setCalls(rows);
      })
      .catch(() => {
        if (alive) setCalls([]);
      });
    return () => {
      alive = false;
    };
  }, [open, conversationId]);

  // 筛选条件变化就退回结果总览，避免停在旧会话的匹配列表里
  useEffect(() => {
    setActiveConv(null);
  }, [q, date, kind, callOnly]);

  // Esc：capture 阶段截住，二级视图先返回上一级
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      // 浮层按层级逐层退：通话详情 → 会话匹配列表 → 通话视图 → 日历 → 搜索总览
      if (callDetail) setCallDetail(null);
      else if (activeConv) setActiveConv(null);
      else if (callOnly) setCallOnly(false);
      else if (calendarOpen) setCalendarOpen(false);
      else close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeConv, callDetail, callOnly, calendarOpen]);

  const close = () => {
    setQ('');
    setDate('');
    setKind(null);
    setCallOnly(false);
    setCalendarOpen(false);
    setResults([]);
    setSearched(false);
    setCallDetail(null);
    setCalls([]);
    setActiveConv(null);
    setDayMiss('');
    onClose();
  };

  /**
   * 跳回聊天并定位到某条消息（仿微信：滚到位置 + 短暂泛光）。
   * 不改分支：目标就在当前渲染路径里 → 直接滚；
   * 不在（旧分支/被重新生成的支线）→ 才退回 setActiveMessage 切过去，再滚一次。
   */
  const focusInChat = (msgId: string) => {
    const scroll = () => {
      const el = document.querySelector<HTMLElement>(`[data-msg-row="${msgId}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('msg-focus');
      void el.offsetWidth; // 强制重排，保证连续两次定位也能重播动画
      el.classList.add('msg-focus');
      window.setTimeout(() => el.classList.remove('msg-focus'), 2200);
      return true;
    };
    // 浮层还盖在上面时滚不动，等它卸载后再定位
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (scroll()) return;
        void setActiveMessage(msgId).then(() => window.setTimeout(scroll, 180));
      }, 60);
    });
  };

  /**
   * 日期页点某一天：仿微信直接跳进聊天里那天的位置，不留在结果列表。
   * 定位到当天**最早**一条（从那天开头往下读）；那天没聊天就留在日历上并给提示。
   */
  const pickDay = async (d: string | null) => {
    if (!d) {
      setDate('');
      setDayMiss('');
      return;
    }
    setDate(d);
    setDayMiss('');
    try {
      const { results: rows } = await searchMessages({ date: d });
      const first = rows.reduce<SearchResultDTO | null>(
        (acc, r) => (acc == null || r.createdAt < acc.createdAt ? r : acc),
        null,
      );
      if (!first) {
        setDayMiss(`${fmtDateShort(d)} 没有聊天记录`);
        return;
      }
      close();
      focusInChat(first.id);
    } catch (err) {
      console.error('按日期跳转失败', err);
      setDayMiss('跳转失败，稍后再试');
    }
  };

  /** 通话按关键词 / 日期过滤（首屏、通话视图、结果区共用） */
  const callsShown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const range = date ? dayRange(date) : null;
    return calls.filter((c) => {
      const ts = c.startedAt ?? c.createdAt;
      if (range && (ts < range[0] || ts >= range[1])) return false;
      if (kw && !callText(c).toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [calls, q, date]);

  /** 结果区置顶通话：仅关键词 / 日期搜索时参与，附件/链接/表情等分类不掺通话 */
  const matchedCalls = useMemo(() => {
    if (callOnly || kind || !hasFilter) return [];
    return callsShown;
  }, [callOnly, kind, hasFilter, callsShown]);

  /** 聊天记录按会话聚合（results 已是时间倒序） */
  const groups = useMemo<ConvGroup[]>(() => {
    const map = new Map<string, ConvGroup>();
    for (const r of results) {
      const g = map.get(r.conversationId);
      if (g) g.items.push(r);
      else {
        map.set(r.conversationId, {
          id: r.conversationId,
          title: r.conversationTitle,
          items: [r],
          latest: r.createdAt,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.latest - a.latest);
  }, [results]);

  const activeGroup = activeConv ? groups.find((g) => g.id === activeConv) ?? null : null;

  /** 二级视图：该会话内匹配消息按日期分组 */
  const dayGroups = useMemo(() => {
    const map = new Map<string, SearchResultDTO[]>();
    for (const r of activeGroup?.items ?? []) {
      const k = dayLabel(r.createdAt);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return [...map.entries()];
  }, [activeGroup]);

  if (!open) return null;

  const pickRecent = (term: string) => setQ(term);
  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  /** 点分类网格：日期开日历，通话进独立视图，其余设分类条件 */
  const pickCategory = (key: CategoryKey) => {
    if (key === 'date') {
      setCalendarOpen(true);
      return;
    }
    if (key === 'call') {
      setCallOnly(true);
      return;
    }
    setKind(key);
  };

  const jump = (r: SearchResultDTO) => {
    close();
    focusInChat(r.id);
  };

  /** 一行通话（首屏 / 结果区 / 通话视图共用） */
  const callRow = (c: CallDTO) => {
    const missed = c.state === 'missed';
    const declined = c.state === 'declined';
    const Icon = missed ? PhoneMissed : declined ? PhoneOutgoing : PhoneIncoming;
    const ts = c.startedAt ?? c.createdAt;
    const dur = c.state === 'answered' && c.seconds > 0 ? ` · ${fmtDuration(c.seconds)}` : '';
    const title = `${c.kind === 'video' ? '视频通话' : '语音通话'}${dur}`;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => setCallDetail({ call: c, ts })}
        data-testid="search-call-item"
        className="flex w-full items-center gap-3 border-b border-chat-line/50 px-4 py-2.5 text-left transition last:border-b-0 hover:bg-chat-pill/70"
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chat-pill',
            missed || declined ? 'text-destructive' : 'text-chat-ai-fg',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-foreground/90">
            <Snippet text={title} q={q} />
          </span>
          <span className="block truncate text-[12px] text-chat-meta">
            <Snippet text={callStatusWord(c)} q={q} />
          </span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-chat-meta">{fmtTime(ts)}</span>
      </button>
    );
  };

  /** 结果区顶部筛选项胶囊（可点掉清除） */
  const filterChip = (label: string, onClear: () => void) => (
    <button
      type="button"
      onClick={onClear}
      className="flex h-7 items-center gap-1 rounded-full border border-chat-line bg-chat-pill px-3 text-[12px] text-chat-accent"
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );

  /**
   * 返回键统一规则：多级页面逐级退回上一层，最外层才关闭搜索。
   * 日期页 → 通话列表 → 会话匹配详情，退到哪层就是哪层，不越级关浮层。
   */
  const goBack = () => {
    if (activeConv) setActiveConv(null);
    else if (calendarOpen) setCalendarOpen(false);
    else if (callOnly) setCallOnly(false);
    else close();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-chat-bg" data-testid="search-overlay">
      {/* 顶部搜索栏（圆形返回 + 胶囊输入 + 右侧「取消」） */}
      <div className="flex shrink-0 items-center gap-2.5 bg-chat-bg px-4 py-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="返回"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg transition active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {/* 日期页不摆输入框：整页只留热力图，避免自动聚焦弹键盘把日历顶掉 */}
        {calendarOpen ? (
          <div className="flex h-11 min-w-0 flex-1 items-center justify-center text-[15px] text-foreground/90">
            按日期查看
          </div>
        ) : (
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-chat-pill px-3.5">
            <Search className="h-4 w-4 shrink-0 text-chat-meta" />
            <input
              autoFocus
              data-testid="search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              placeholder="搜索"
              className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-chat-meta"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="清空关键词"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-chat-line text-chat-meta hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <button type="button" onClick={close} className="shrink-0 text-[15px] text-chat-pill-fg/80">
          取消
        </button>
      </div>

      {/* 结果区顶部：已选筛选项（日期 / 分类）可点掉；日期页里不显示，免得和热力图挤在一起 */}
      {hasFilter && !callOnly && !activeGroup && !calendarOpen && (date || kind) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 bg-chat-bg px-4 pb-2">
          {date && filterChip(`日期 ${fmtDateShort(date)}`, () => setDate(''))}
          {kind && filterChip(KIND_LABEL[kind], () => setKind(null))}
        </div>
      )}

      {/* ============ 日期页：整页只有聊天热力图（仿微信，返回回搜索页） ============ */}
      {calendarOpen ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-8 pt-2"
          data-testid="search-date-page"
        >
          <ChatCalendar
            value={date || null}
            onChange={(d) => void pickDay(d)}
            onConfirm={() => setCalendarOpen(false)}
          />
          <div
            className="px-1 pt-3 text-[12px] leading-5 text-chat-meta"
            data-testid="search-date-hint"
          >
            {dayMiss || '热力越深表示当天聊得越多；点某一天即跳进聊天里那天的位置。'}
          </div>
        </div>
      ) : activeGroup ? (
        /* ============ 二级视图：仿微信「聊天记录」详情，按日期分组 + 全文高亮 ============ */
        <div
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-8"
          data-testid="search-conv-detail"
        >
          <div className="px-4 py-2.5 text-[12px] text-chat-meta">
            共 {activeGroup.items.length} 条相关聊天记录
          </div>
          {dayGroups.map(([day, items]) => (
            <div key={day}>
              <div className="bg-chat-pill/40 px-4 py-1.5 text-[12px] text-chat-meta">{day}</div>
              {items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => jump(r)}
                  data-testid="search-msg-item"
                  className="flex w-full flex-col gap-1 border-b border-chat-line/50 px-4 py-3 text-left transition hover:bg-chat-pill/70"
                >
                  <div className="flex items-baseline gap-2 text-[12px] text-chat-meta">
                    <span className="truncate font-medium text-chat-ai-fg/90">
                      {r.role === 'assistant' ? '小蓝莓' : '我'}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums">{fmtTime(r.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-foreground/90">
                    <Snippet text={r.content} q={q} full />
                  </p>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : callOnly ? (
        /* ============ 通话记录独立视图（点分类「通话记录」进入） ============ */
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-6">
          <div className="flex items-center justify-between px-4 py-2 text-[12px] text-chat-meta">
            <span>通话记录</span>
            <span>{callsShown.length} 条</span>
          </div>
          {callsShown.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-chat-meta">没有匹配的通话记录</div>
          ) : (
            callsShown.map(callRow)
          )}
        </div>
      ) : !hasFilter ? (
        /* ============ 首屏：搜索指定内容 + 最近搜索 ============ */
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-8" data-testid="search-home">
          <div className="pb-3 pt-5 text-center text-[13px] text-chat-meta">搜索指定内容</div>
          <div className="mx-auto grid w-[88%] grid-cols-3 gap-y-7">
            {CATEGORIES.map((c, i) => (
              <button
                key={c.key}
                type="button"
                onClick={() => pickCategory(c.key)}
                data-testid={`search-cat-${c.key}`}
                className="relative flex h-7 items-center justify-center text-[14px] text-foreground/85 transition active:scale-95"
              >
                {c.label}
                {i % 3 !== 2 && (
                  <span className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-px -translate-y-1/2 bg-chat-line" />
                )}
              </button>
            ))}
          </div>

          {recent.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[12px] text-chat-meta">最近搜索</span>
                <button
                  type="button"
                  onClick={clearRecent}
                  aria-label="清空最近搜索"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-chat-meta transition hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {recent.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => pickRecent(term)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-foreground/90 transition hover:bg-chat-pill/70"
                >
                  <Clock className="h-4 w-4 shrink-0 text-chat-meta" />
                  <span className="truncate">{term}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : loading || !searched ? (
        <div className="flex flex-1 items-center justify-center text-sm text-chat-meta">搜索中…</div>
      ) : results.length === 0 && matchedCalls.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-chat-meta">没有匹配的记录</div>
      ) : (
        /* ============ 结果总览：通话记录置顶 + 聊天记录按会话聚合 ============ */
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-6">
          {matchedCalls.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-4 py-2 text-[12px] text-chat-meta">
                <span>通话记录</span>
                <span>{matchedCalls.length} 条</span>
              </div>
              {/* 仿微信：每组只列前几条，其余收进「查看全部」，别把下面的聊天记录挤到屏外 */}
              {matchedCalls.slice(0, SECTION_PREVIEW).map(callRow)}
              {matchedCalls.length > SECTION_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setCallOnly(true)}
                  data-testid="search-calls-more"
                  className="flex w-full items-center gap-1 border-b border-chat-line/50 px-4 py-3 text-left text-[13px] text-chat-accent transition hover:bg-chat-pill/70"
                >
                  查看全部 {matchedCalls.length} 条通话记录
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </section>
          )}

          <section>
            <div className="flex items-center justify-between px-4 py-2 text-[12px] text-chat-meta">
              <span>聊天记录</span>
              <span>
                {results.length} 条相关聊天记录 · {groups.length} 个会话
              </span>
            </div>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveConv(g.id)}
                data-testid="search-conv-group"
                className="flex w-full items-center gap-3 border-b border-chat-line/50 px-4 py-3 text-left transition last:border-b-0 hover:bg-chat-pill/70"
              >
                {/* 中性剪影头像：不做 emoji / 首字，跟聊天页头像规则一致 */}
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-meta">
                  <UserRound className="h-5 w-5" />
                </span>
                {/* 微信样式：第一行会话名，第二行灰字「N 条相关聊天记录」，不放预览/时间/箭头 */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-foreground/90">{g.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-chat-meta">
                    {g.items.length} 条相关聊天记录
                  </span>
                </span>
              </button>
            ))}
          </section>

          {groups.length === 0 && matchedCalls.length > 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-chat-meta">没有匹配的聊天记录</div>
          )}
        </div>
      )}

      {/* 通话详情：整页浮层，比搜索页（z-50）高，返回即回到搜索 */}
      {callDetail && (
        <CallDetailSheet
          call={callDetail.call}
          ts={callDetail.ts}
          name={useChatStore.getState().conversation?.title || '对方'}
          onClose={() => setCallDetail(null)}
          onCallAgain={() => {
            setCallDetail(null);
            close();
            onCallAgain?.();
          }}
        />
      )}
    </div>
  );
}

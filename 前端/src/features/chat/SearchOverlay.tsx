import { useEffect, useState } from 'react';
import {
  Search,
  X,
  ChevronLeft,
  Image as ImageIcon,
  CalendarDays,
  Clock,
  Trash2,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMessages, type SearchResultDTO } from '@/lib/api/conversations';
import { listCalls, fmtDuration, callStatusWord, type CallDTO } from '@/lib/api/calls';
import { useChatStore } from './chatStore';
import { ChatCalendar } from './ChatCalendar';
import { CallDetailSheet } from './CallDetailSheet';

const RECENT_KEY = 'blueberry.search.recent';

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

/** 结果片段：截断 + 命中关键词高亮（玫瑰色，跟 chat 页强调色一套）。 */
function Snippet({ text, q }: { text: string; q?: string }) {
  const needle = q?.trim() ?? '';
  const idx = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  let start = 0;
  let end = Math.min(text.length, 120);
  if (idx >= 0) {
    start = Math.max(0, idx - 24);
    end = Math.min(text.length, idx + needle.length + 64);
  }
  const slice = text.slice(start, end);
  const relIdx = idx >= 0 ? idx - start : -1;
  const pre = start > 0 ? '…' : '';
  const post = end < text.length ? '…' : '';
  if (relIdx < 0) {
    return <span>{pre}{slice}{post}</span>;
  }
  return (
    <span>
      {pre}
      {slice.slice(0, relIdx)}
      <mark className="bg-transparent font-semibold text-chat-accent">
        {slice.slice(relIdx, relIdx + needle.length)}
      </mark>
      {slice.slice(relIdx + needle.length)}
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

/**
 * 微信式全屏搜索页（阶段 4）：关键词 / 日期 / 图片三合一。
 * 空条件显示「最近搜索」；有任一条件实时（防抖）搜索；命中关键词绿色高亮。
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
  const [hasImage, setHasImage] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [results, setResults] = useState<SearchResultDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  /** 通话记录：打开时拉一次（只看本会话的），点条目进详情 */
  const [calls, setCalls] = useState<CallDTO[]>([]);
  const [callDetail, setCallDetail] = useState<{ call: CallDTO; ts: number } | null>(null);

  const hasFilter = q.trim() !== '' || !!date || hasImage;

  const runSearch = async () => {
    const kw = q.trim();
    setLoading(true);
    try {
      const { results } = await searchMessages({
        q: kw || undefined,
        date: date || undefined,
        hasImage: hasImage || undefined,
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

  // 实时搜索（防抖 300ms）：任一条件变化即搜；空条件则回到「最近搜索」
  useEffect(() => {
    if (!open) return;
    if (!hasFilter) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, date, hasImage, open]);

  // 打开时拉一次本会话的通话记录（最多 8 条，倒序），给「通话记录」区块用
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listCalls(conversationId)
      .then((rows) => {
        if (alive) setCalls(rows.slice(0, 8));
      })
      .catch(() => {
        if (alive) setCalls([]);
      });
    return () => {
      alive = false;
    };
  }, [open, conversationId]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setQ('');
    setDate('');
    setHasImage(false);
    setCalendarOpen(false);
    setResults([]);
    setSearched(false);
    setCallDetail(null);
    setCalls([]);
    onClose();
  };

  if (!open) return null;

  const pickRecent = (term: string) => setQ(term);
  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  const jump = (r: SearchResultDTO) => {
    void setActiveMessage(r.id);
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-chat-bg" data-testid="search-overlay">
      {/* 顶部搜索栏（设计稿：圆形返回 + 胶囊输入 + 右侧「取消」） */}
      <div className="flex shrink-0 items-center gap-2.5 bg-chat-bg px-4 py-3">
        <button
          type="button"
          onClick={close}
          aria-label="返回"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg transition active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-chat-pill px-3.5">
          <Search className="h-4 w-4 shrink-0 text-chat-meta" />
          <input
            autoFocus
            data-testid="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="搜索聊天记录"
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
        {/* 原稿里右边是「取消」；结果已经随输入防抖实时刷新，不需要再点一次搜索 */}
        <button
          type="button"
          onClick={close}
          className="shrink-0 text-[15px] text-chat-pill-fg/80"
        >
          取消
        </button>
      </div>

      {/* 筛选条件：日期（日历热力图）+ 图片；选中态是黑底白字（设计稿的「最近7天」） */}
      <div className="flex shrink-0 flex-col gap-2 bg-chat-bg px-4 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-label="按日期"
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition active:scale-95',
              date || calendarOpen
                ? 'bg-chat-me font-medium text-chat-me-fg'
                : 'bg-chat-pill text-chat-pill-fg hover:bg-chat-line',
            )}
          >
            <CalendarDays className="h-4 w-4" />
            {date ? fmtDateShort(date) : '日期'}
          </button>
          {date && (
            <button
              type="button"
              onClick={() => setDate('')}
              aria-label="清除日期"
              className="flex h-6 w-6 items-center justify-center rounded-full text-chat-meta transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setHasImage((v) => !v)}
            aria-label="仅看图片"
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition active:scale-95',
              hasImage
                ? 'bg-chat-me font-medium text-chat-me-fg'
                : 'bg-chat-pill text-chat-pill-fg hover:bg-chat-line',
            )}
          >
            <ImageIcon className="h-4 w-4" />
            图片
          </button>
        </div>

        {calendarOpen && (
          <ChatCalendar
            value={date}
            onChange={(d) => setDate(d ?? '')}
            onConfirm={() => setCalendarOpen(false)}
          />
        )}
      </div>

      {/* 内容区 */}
      {!hasFilter ? (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {/* 通话记录：不用输条件就能点进去看（点条目 → 整页详情） */}
          {calls.length > 0 && (
            <div className="pb-1">
              <div className="px-4 py-2 text-xs text-chat-meta">通话记录</div>
              {calls.map((c) => {
                const missed = c.state === 'missed';
                const declined = c.state === 'declined';
                const Icon = missed ? PhoneMissed : declined ? PhoneOutgoing : PhoneIncoming;
                const answered = c.state === 'answered';
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCallDetail({ call: c, ts: c.startedAt ?? c.createdAt })}
                    data-testid="search-call-item"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-chat-pill/70"
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
                        {c.kind === 'video' ? '视频通话' : '语音通话'}
                        {answered && c.seconds > 0 ? ` · ${fmtDuration(c.seconds)}` : ''}
                      </span>
                      <span className="block truncate text-[12px] text-chat-meta">
                        {callStatusWord(c)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-chat-meta">
                      {fmtTime(c.startedAt ?? c.createdAt)}
                    </span>
                  </button>
                );
              })}
              <div className="mx-4 my-1 border-t border-chat-line/60" />
            </div>
          )}
          {recent.length === 0 && calls.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-chat-meta">
              输入关键词，或按日期 / 图片搜索聊天记录
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-chat-meta">最近搜索</span>
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
            </>
          )}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-chat-meta">搜索中…</div>
      ) : searched && results.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-chat-meta">没有匹配的记录</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
          {/* 结果头：条数 + 排序说明（设计稿那行小字） */}
          <div className="flex items-center justify-between py-2 text-[12px] text-chat-meta">
            <span>
              聊天记录 · 共 {results.length} 条
            </span>
            <span>按时间倒序</span>
          </div>
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => jump(r)}
                className="flex w-full flex-col gap-1.5 rounded-2xl bg-chat-ai px-3.5 py-3 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] transition active:scale-[0.995]"
              >
                <div className="flex items-center gap-2 text-[12px] text-chat-meta">
                  <span className="font-medium text-chat-ai-fg">
                    {r.role === 'assistant' ? '小蓝莓' : '我'}
                  </span>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0 tabular-nums">{fmtTime(r.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-right opacity-70">{r.conversationTitle}</span>
                </div>
                <div className="line-clamp-2 pl-2 border-l-2 border-chat-me/70 text-[14px] leading-6 text-chat-ai-fg/90">
                  <Snippet text={r.content} q={q} />
                </div>
              </button>
            ))}
          </div>
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

import { useEffect, useState } from 'react';
import {
  Search,
  X,
  ChevronLeft,
  Image as ImageIcon,
  CalendarDays,
  Clock,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMessages, type SearchResultDTO } from '@/lib/api/conversations';
import { useChatStore } from './chatStore';
import { ChatCalendar } from './ChatCalendar';

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

/** 结果片段：截断 + 命中关键词高亮（微信绿）。 */
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
      <mark className="bg-transparent font-semibold text-[#07C160]">
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
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setActiveMessage = useChatStore((s) => s.setActiveMessage);

  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const [hasImage, setHasImage] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [results, setResults] = useState<SearchResultDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* 顶部搜索栏：返回 + 输入框 + 搜索 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="返回"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted/60 px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="搜索"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="清空关键词"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void runSearch()}
          className="shrink-0 px-2 text-sm font-medium text-primary"
        >
          搜索
        </button>
      </div>

      {/* 筛选条件：日期（日历热力图）+ 图片 */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-label="按日期"
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition',
              date || calendarOpen ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-foreground/80',
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
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setHasImage((v) => !v)}
            aria-label="仅看图片"
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition',
              hasImage ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-foreground/80',
            )}
          >
            <ImageIcon className="h-4 w-4" />
            图片
          </button>
        </div>

        {calendarOpen && (
          <ChatCalendar
            value={date}
            onChange={(d) => {
              setDate(d ?? '');
              setCalendarOpen(false);
            }}
          />
        )}
      </div>

      {/* 内容区 */}
      {!hasFilter ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              输入关键词，或按日期 / 图片搜索聊天记录
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-muted-foreground">最近搜索</span>
                <button
                  type="button"
                  onClick={clearRecent}
                  aria-label="清空最近搜索"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {recent.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => pickRecent(term)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-foreground/90 transition hover:bg-muted/50"
                >
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{term}</span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">搜索中…</div>
      ) : searched && results.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">没有匹配的记录</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-xs text-muted-foreground">聊天记录 · 共 {results.length} 条</div>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => jump(r)}
              className="flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left transition hover:bg-muted/40"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px]',
                    r.role === 'assistant' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground/70',
                  )}
                >
                  {r.role === 'assistant' ? '小蓝莓' : '我'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground/80">
                  {r.conversationTitle}
                </span>
                <span className="shrink-0">{fmtTime(r.createdAt)}</span>
              </div>
              <div className="line-clamp-2 text-sm text-foreground/80">
                <Snippet text={r.content} q={q} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

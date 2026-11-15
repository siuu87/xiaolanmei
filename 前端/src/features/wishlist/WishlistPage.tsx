import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookmarkPlus,
  Check,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { BottomSheet } from '@/components/BottomSheet';
import { cn } from '@/lib/utils';
import {
  fetchClips,
  patchClip,
  pushClip,
  readClipFromHash,
  removeClip,
  type Clip,
} from './clips';
import {
  LAYOUTS,
  LAYOUT_LABEL,
  buildChips,
  clipToEntry,
  deleteWish,
  fetchWishes,
  filterEntries,
  loadLayout,
  mergeEntries,
  patchWish,
  sameFilter,
  saveLayout,
  searchEntries,
  wishToEntry,
  type Entry,
  type Filter,
  type Layout,
  type WishItem,
} from './inspiration';
import { GalleryView, GridView, ListView, TimelineView } from './EntryViews';
import { InspirationDetail } from './InspirationDetail';
import { ComposeSheet } from './ComposeSheet';
import { StatsSheet } from './StatsSheet';
import { BookmarkSheet } from './BookmarkSheet';

/**
 * 灵感库（2026-11-14，按 flomoplus 大改）。
 *
 * 老版本是「夹子柜 + 剪藏墙」两套东西拼在一起。flomoplus 的模型更简单也更能装：
 *
 *   一条灵感 = 你的想法 + 可选的来源（链接 / 正文 / 封面）+ 标签
 *
 * 所以这一版把「夹子」这个层级拿掉，改成**标签 + 一条按时间倒序的流**，
 * 上面一行平台/标签筛选，下面四种排布随你（列表 / 时间线 / 网格 / 画廊）。
 * 原来的夹子名已经在后端迁移时写进 tags，归过类的信息不会丢。
 *
 * 数据仍然是两张表（`wish_clips` 剪藏 + `plugin_wishlist` 纯想法），
 * 读的时候合成一条流 —— AI 写入、书签收件口这些既有通道不受影响。
 */

const LAYOUT_ICON: Record<Layout, typeof List> = {
  list: List,
  timeline: Rows3,
  grid: LayoutGrid,
  gallery: Sparkles,
};

export function WishlistPage() {
  const navigate = useNavigate();

  const [clips, setClips] = useState<Clip[]>([]);
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [layout, setLayout] = useState<Layout>(() => loadLayout());
  const [filter, setFilter] = useState<Filter>({ type: 'all' });
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const load = useCallback(async () => {
    try {
      const [c, w] = await Promise.all([fetchClips(), fetchWishes()]);
      setClips(c);
      setWishes(w);
    } catch {
      /* 读不到就先空着，别把整页拖死 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** 书签推过来的（新窗口带 hash 进来）—— 收下、清掉 hash、刷新 */
  const tookRef = useRef(false);
  useEffect(() => {
    if (tookRef.current) return;
    const incoming = readClipFromHash();
    if (!incoming) return;
    tookRef.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    pushClip(incoming)
      .then((r) => {
        flash(r.updated ? '已经有过这条，顺手更新了' : `收下了：${incoming.title || '这一页'}`);
        load();
      })
      .catch(() => flash('没存上，检查后端是否在跑'));
  }, [flash, load]);

  const entries = useMemo(() => mergeEntries(clips, wishes), [clips, wishes]);
  const chips = useMemo(() => buildChips(entries), [entries]);
  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))], [entries]);

  const tokens = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const shown = useMemo(() => {
    const base = filterEntries(entries, filter);
    return tokens.length ? searchEntries(base, tokens) : base;
  }, [entries, filter, tokens]);

  /** 筛选的标签被删光了就退回「全部」，不然会停在一个永远空的列表上 */
  useEffect(() => {
    if (filter.type !== 'tag') return;
    if (!entries.some((e) => e.tags.includes(filter.value))) setFilter({ type: 'all' });
  }, [entries, filter]);

  /* ---------------- 顶栏高度：时间线的月份头要贴着它吸顶 ---------------- */
  const chipsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headH, setHeadH] = useState(134);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => setHeadH(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [searchOpen, chips.length]);

  /**
   * 选中的 chip 滚进视野。
   * 筛选条是横向滚动的，标签一多，被点的那个常常停在屏幕外 ——
   * 结果就是「点了标签、列表变了，但看不出来现在筛的是哪个」。
   */
  useEffect(() => {
    const box = chipsRef.current;
    if (!box) return;
    const idx = chips.findIndex((c) => sameFilter(filter, c.filter));
    const el = box.querySelectorAll('button')[idx];
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [filter, chips]);

  /* ---------------- 改动 ---------------- */

  const patchEntry = async (
    e: Entry,
    p: { title?: string; note?: string; content?: string; tags?: string[] },
  ) => {
    // 先把本地状态改掉，界面立刻有反应；接口失败再拉一次覆盖回来
    if (e.kind === 'clip' && e.clip) {
      const nextClip = { ...e.clip, ...p };
      setClips((prev) => prev.map((c) => (c.id === e.id ? nextClip : c)));
      setOpenEntry((prev) => (prev && prev.key === e.key ? clipToEntry(nextClip) : prev));
      try {
        await patchClip(e.id, p);
      } catch {
        flash('没改上');
        load();
      }
    } else if (e.wish) {
      const nextWish = { ...e.wish, ...p };
      setWishes((prev) => prev.map((w) => (w.id === e.id ? nextWish : w)));
      setOpenEntry((prev) => (prev && prev.key === e.key ? wishToEntry(nextWish) : prev));
      try {
        await patchWish(e.id, p);
      } catch {
        flash('没改上');
        load();
      }
    }
  };

  const toggleDone = async (e: Entry) => {
    if (!e.wish) return;
    const next = { ...e.wish, completed: !e.completed, completedAt: e.completed ? null : Date.now() };
    setWishes((prev) => prev.map((w) => (w.id === e.id ? next : w)));
    setOpenEntry((prev) => (prev && prev.key === e.key ? wishToEntry(next) : prev));
    try {
      await patchWish(e.id, { completed: next.completed });
    } catch {
      flash('没改上');
      load();
    }
  };

  const delEntry = async (e: Entry) => {
    setOpenEntry(null);
    if (e.kind === 'clip') {
      setClips((prev) => prev.filter((c) => c.id !== e.id));
      await removeClip(e.id).catch(() => flash('没删掉'));
    } else {
      setWishes((prev) => prev.filter((w) => w.id !== e.id));
      await deleteWish(e.id).catch(() => flash('没删掉'));
    }
    flash('删掉了');
  };

  const pickLayout = (v: Layout) => {
    setLayout(v);
    saveLayout(v);
    setMenuOpen(false);
  };

  /* ---------------- 渲染 ---------------- */

  const active = entries.filter((e) => !e.completed).length;

  return (
    <PageShell
      bare
      className="insp-page"
      title="灵感"
      testId="page-wishlist"
      bodyClassName="pb-16"
    >
      <div style={{ '--insp-head-h': `${headH}px` } as CSSProperties}>
        {/* 顶栏：圆形按钮 + 大字标题 + 筛选条，整块吸顶 */}
        <header
          ref={headerRef}
          className="sticky top-0 z-30 bg-page-bg px-4 pb-2 pt-2"
          data-testid="insp-header"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/chat')}
              aria-label="返回"
              className="icon-btn h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSearchOpen((v) => !v);
                  if (searchOpen) setQuery('');
                }}
                aria-label="搜索"
                data-testid="insp-search-open"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border transition',
                  searchOpen
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground',
                )}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="更多"
                data-testid="insp-more"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                aria-label="记录灵感"
                data-testid="insp-add"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-1 flex items-end gap-2">
            <h1 className="text-[30px] font-bold leading-[38px] tracking-tight text-foreground">
              灵感
            </h1>
            <span className="mb-[7px] flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              {filter.type === 'all' && !tokens.length
                ? `${entries.length} 条${active !== entries.length ? ` · 待整理 ${active}` : ''}`
                : `筛出 ${shown.length} / 共 ${entries.length} 条`}
              {/* 筛选条能横着滚，「全部」可能已经滚出屏幕 —— 给一个随手能点的退出口 */}
              {(filter.type !== 'all' || tokens.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter({ type: 'all' });
                    setQuery('');
                  }}
                  data-testid="insp-clear-filter"
                  className="rounded-full border border-border px-1.5 text-[10px] leading-[16px] text-muted-foreground"
                >
                  清除
                </button>
              )}
            </span>
          </div>

          {searchOpen && (
            <div className="mt-1.5 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜标题、正文、标签…"
                aria-label="搜索灵感"
                autoFocus
                data-testid="insp-search-input"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* 筛选条：全部 + 各来源 + 标签，横向滚动 */}
          {chips.length > 1 && (
            <div
              ref={chipsRef}
              className="mt-2 flex gap-1.5 overflow-x-auto pb-1"
              style={{ scrollbarWidth: 'none' }}
              data-testid="insp-chips"
            >
              {chips.map((c) => {
                const on = sameFilter(filter, c.filter);
                return (
                  <button
                    key={`${c.filter.type}:${'value' in c.filter ? c.filter.value : ''}`}
                    type="button"
                    onClick={() => setFilter(c.filter)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition',
                      on
                        ? 'bg-primary font-medium text-primary-foreground'
                        : 'border border-border bg-card text-foreground',
                    )}
                  >
                    {c.color && !on && (
                      <span
                        aria-hidden
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ background: c.color }}
                      />
                    )}
                    {c.label}
                    <span className={on ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}>
                      {c.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        <div className="px-4 pt-1">
          {loading ? (
            <div className="space-y-3 py-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-[62px] w-[62px] animate-pulse rounded-[10px] bg-muted" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              hasAny={entries.length > 0}
              searching={tokens.length > 0}
              onCompose={() => setComposeOpen(true)}
              onBookmark={() => setMarkOpen(true)}
            />
          ) : layout === 'list' ? (
            <ListView entries={shown} onOpen={setOpenEntry} />
          ) : layout === 'timeline' ? (
            <TimelineView entries={shown} onOpen={setOpenEntry} />
          ) : layout === 'grid' ? (
            <GridView entries={shown} onOpen={setOpenEntry} />
          ) : (
            <GalleryView entries={shown} onOpen={setOpenEntry} />
          )}

          {shown.length > 0 && (
            <p className="mt-5 flex items-center justify-center gap-1.5 text-[10.5px] text-muted-foreground/50">
              <span className="h-1 w-1 rounded-full bg-current" />
              一共 {shown.length} 条 · 点一条看全文
            </p>
          )}
        </div>
      </div>

      {/* 更多：布局 / 统计 / 书签 */}
      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title="更多" testid="insp-menu-sheet">
        <div className="px-4 pb-7 pt-1">
          <p className="pl-1 text-[11px] font-medium text-muted-foreground">排布</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {LAYOUTS.map((v) => {
              const Icon = LAYOUT_ICON[v];
              const on = layout === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => pickLayout(v)}
                  data-testid={`insp-layout-${v}`}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-[14px] border py-2.5 text-[11.5px] transition',
                    on
                      ? 'border-primary/60 bg-primary/10 font-medium text-primary'
                      : 'border-border bg-card text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {LAYOUT_LABEL[v]}
                </button>
              );
            })}
          </div>

          <div className="mt-4 overflow-hidden rounded-[16px] border border-border/60 bg-card">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setStatsOpen(true);
              }}
              data-testid="insp-open-stats"
              className="flex w-full items-center gap-2.5 border-b border-border/50 px-3.5 py-3 text-left text-[13px] text-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-primary/12 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              统计
              <span className="ml-auto text-[11px] text-muted-foreground">热力图 · 来源分布</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setMarkOpen(true);
              }}
              className="flex w-full items-center gap-2.5 border-b border-border/50 px-3.5 py-3 text-left text-[13px] text-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-primary/12 text-primary">
                <BookmarkPlus className="h-3.5 w-3.5" />
              </span>
              书签抓取
              <span className="ml-auto text-[11px] text-muted-foreground">小红书正文靠它</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const done = entries.filter((e) => e.completed);
                if (!done.length) {
                  flash('没有已完成的');
                  return;
                }
                setMenuOpen(false);
                Promise.all(
                  done.map((e) => (e.wish ? deleteWish(e.id).catch(() => undefined) : undefined)),
                ).then(() => {
                  load();
                  flash(`清掉了 ${done.length} 条`);
                });
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] text-foreground"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
              清掉已完成
            </button>
          </div>

          <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground/60">
            排布会记住，下次进来还是这一种。夹子已经不用了 —— 以前夹子里的东西都变成了标签。
          </p>
        </div>
      </BottomSheet>

      <ComposeSheet
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSaved={(msg) => {
          flash(msg);
          load();
        }}
        allTags={allTags}
      />

      <BookmarkSheet open={markOpen} onOpenChange={setMarkOpen} onToast={flash} />

      {statsOpen && <StatsSheet entries={entries} onClose={() => setStatsOpen(false)} />}

      {openEntry && (
        <InspirationDetail
          entry={openEntry}
          allTags={allTags}
          onClose={() => setOpenEntry(null)}
          onPatch={(p) => patchEntry(openEntry, p)}
          onDelete={() => delEntry(openEntry)}
          onToggleDone={() => toggleDone(openEntry)}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[1500] flex justify-center px-6">
          <div className="rounded-full bg-foreground/90 px-3.5 py-1.5 text-[11.5px] text-background shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */

function EmptyState({
  hasAny,
  searching,
  onCompose,
  onBookmark,
}: {
  hasAny: boolean;
  searching: boolean;
  onCompose: () => void;
  onBookmark: () => void;
}) {
  if (searching) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-foreground">这儿没搜到</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">换个词试试，搜的是标题、正文和标签</p>
      </div>
    );
  }

  if (hasAny) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-foreground">这个筛选下是空的</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">上面换一个看看</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary/70" />
      </span>
      <p className="mt-1 text-[14px] font-medium text-foreground">灵感库还空着</p>
      <p className="max-w-[260px] text-[11.5px] leading-relaxed text-muted-foreground">
        贴个小🍠链接、一个 GitHub 仓库，或者干脆写一句话。素材和想法都往这儿放。
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCompose}
          className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          记录第一条
        </button>
        <button
          type="button"
          onClick={onBookmark}
          className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[12.5px] text-foreground"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          书签抓取
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10.5px] text-muted-foreground/50">
        <Check className="h-3 w-3" />
        数据只存在你自己这台机器上
      </p>
    </div>
  );
}

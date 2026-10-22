import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Lightbulb, ListChecks, Plus, Sparkles, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { cn } from '@/lib/utils';

/**
 * 灵感与待办池（Inbox & Todo 统一模块）。
 *
 * 2026-10-18 重构：原来三态（灵感/心愿/待办）收敛为二态：
 * - `isTodo=false` 灵感（Inbox）｜`isTodo=true` 待办（Todo）
 * - 待办可勾选完成 → 划线 + 降透明度；已完成项沉底，可一键清理
 * 顶部输入框回车即存为一条新灵感，左侧图标一键在「灵感 ↔ 待办」间切换。
 */

interface WishItem {
  id: string;
  content: string;
  isTodo: boolean;
  completed: boolean;
  completedAt: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

const API = '/api/plugin-wishlist';
type Filter = 'all' | 'active' | 'completed';

export function WishlistPage() {
  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [addText, setAddText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(API);
      if (r.ok) setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** 未完成在前、已完成沉底；组内按 sortOrder 再按创建时间（与后端排序一致） */
  const displayed = useMemo(() => {
    const list =
      filter === 'active'
        ? items.filter((i) => !i.completed)
        : filter === 'completed'
          ? items.filter((i) => i.completed)
          : items;
    return [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    });
  }, [items, filter]);

  const activeCount = items.filter((i) => !i.completed).length;
  const doneCount = items.length - activeCount;

  /** 快捷录入：回车即存，默认存为灵感 */
  const addItem = async () => {
    const content = addText.trim();
    if (!content) return;
    setAddText('');
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, isTodo: false }),
    });
    if (r.ok) refresh();
  };

  const patchItem = async (
    id: string,
    patch: Partial<Pick<WishItem, 'content' | 'isTodo' | 'completed'>>,
  ) => {
    await fetch(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    refresh();
  };

  const removeItem = async (id: string) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    refresh();
  };

  /** 一键清理（归档）已完成项 */
  const clearCompleted = async () => {
    if (doneCount === 0) return;
    await fetch(`${API}/clear-completed`, { method: 'POST' });
    refresh();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= displayed.length) return;
    const next = [...displayed];
    [next[index], next[target]] = [next[target], next[index]];
    setItems((prev) => {
      const map = new Map(next.map((it, i) => [it.id, { ...it, sortOrder: i * 10 }]));
      return prev.map((it) => map.get(it.id) ?? it);
    });
    await fetch(`${API}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map((it) => it.id) }),
    });
    refresh();
  };

  return (
    <PageShell
      title="灵感待办池"
      eyebrow="INBOX & TODO"
      right={
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          未完成 {activeCount} · 已完成 {doneCount}
        </span>
      }
    >
      {/* 快捷录入：极简输入框，回车即存为灵感 */}
      <div className="flex items-center gap-2">
        <input
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder="记一条灵感，回车即存…"
          aria-label="快捷录入"
          className="h-11 flex-1 rounded-2xl border border-border bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!addText.trim()}
          aria-label="添加"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* 过滤 + 一键清理 */}
      <div className="mt-3 flex items-center gap-1.5">
        {(['all', 'active', 'completed'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] transition',
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground/70',
            )}
          >
            {f === 'all' ? '全部' : f === 'active' ? '未完成' : '已完成'}
          </button>
        ))}
        <button
          type="button"
          onClick={clearCompleted}
          disabled={doneCount === 0}
          className="ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-[12px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Sparkles className="h-3.5 w-3.5" />
          清理已完成
        </button>
      </div>

      {/* 卡片流 */}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="py-10 text-center text-xs text-muted-foreground/60">加载中…</div>
        ) : displayed.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground/60">
            {filter === 'completed' ? '还没有已完成的事项' : '池子空空的，上面记一条吧'}
          </div>
        ) : (
          displayed.map((it, idx) => {
            const Icon = it.isTodo ? ListChecks : Lightbulb;
            const editing = editingId === it.id;
            return (
              <div
                key={it.id}
                className={cn(
                  // 实色纸卡（铺在 PageShell 的不透明页底上，不会透出聊天）
                  'flex items-start gap-3 rounded-2xl border border-border bg-card p-3 transition',
                  it.completed && 'opacity-60',
                )}
              >
                {/* 左侧图标：一键在「灵感 ↔ 待办」之间切换 */}
                <button
                  type="button"
                  onClick={() => patchItem(it.id, { isTodo: !it.isTodo })}
                  aria-label={it.isTodo ? '切换为灵感' : '切换为待办'}
                  title={it.isTodo ? '待办任务（点击转为灵感）' : '灵感（点击转为待办）'}
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition',
                    it.isTodo
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>

                {/* 待办状态下的完成复选框 */}
                {it.isTodo && (
                  <button
                    type="button"
                    onClick={() => patchItem(it.id, { completed: !it.completed })}
                    aria-label={it.completed ? '标记为未完成' : '标记为完成'}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
                      it.completed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40 text-transparent hover:border-primary',
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                )}

                {/* 内容区（点文字内联编辑） */}
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => {
                        const v = editText.trim();
                        if (v && v !== it.content) patchItem(it.id, { content: v });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full rounded-lg bg-background/70 px-2 py-1 text-sm text-foreground outline-none"
                    />
                  ) : (
                    <p
                      onClick={() => {
                        setEditingId(it.id);
                        setEditText(it.content);
                      }}
                      className={cn(
                        'cursor-text break-words text-sm leading-snug text-foreground',
                        it.completed && 'line-through',
                      )}
                    >
                      {it.content}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
                        it.isTodo ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground',
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {it.isTodo ? '待办' : '灵感'}
                    </span>
                  </div>
                </div>

                {/* 操作：上/下移 + 删除 */}
                <div className="flex shrink-0 flex-col gap-1">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label="上移"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === displayed.length - 1}
                      aria-label="下移"
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    aria-label="删除"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:bg-destructive/20 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PageShell>
  );
}

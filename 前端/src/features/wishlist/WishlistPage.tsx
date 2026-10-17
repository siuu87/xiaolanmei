import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Lightbulb, Plus, Sparkles, Trash2, ListChecks } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { cn } from '@/lib/utils';

type WishKind = 'idea' | 'wish' | 'todo';

interface WishItem {
  id: string;
  content: string;
  kind: WishKind;
  done: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

const KIND_META: Record<WishKind, { label: string; dot: string; icon: typeof Lightbulb }> = {
  idea: { label: '灵感', dot: 'bg-violet-500', icon: Lightbulb },
  wish: { label: '心愿', dot: 'bg-amber-500', icon: Sparkles },
  todo: { label: '待办', dot: 'bg-sky-500', icon: ListChecks },
};

const KIND_ORDER: WishKind[] = ['idea', 'wish', 'todo'];
const API = '/api/plugin-wishlist';

type Filter = 'all' | 'active' | 'done';

export function WishlistPage() {
  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [addText, setAddText] = useState('');
  const [addKind, setAddKind] = useState<WishKind>('idea');
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

  const displayed = useMemo(() => {
    const list =
      filter === 'active' ? items.filter((i) => !i.done) : filter === 'done' ? items.filter((i) => i.done) : items;
    return [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt - b.createdAt;
    });
  }, [items, filter]);

  const activeCount = items.filter((i) => !i.done).length;
  const doneCount = items.length - activeCount;

  const addItem = async () => {
    const content = addText.trim();
    if (!content) return;
    setAddText('');
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, kind: addKind }),
    });
    if (r.ok) refresh();
  };

  const patchItem = async (id: string, patch: Partial<Pick<WishItem, 'content' | 'kind' | 'done'>>) => {
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

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= displayed.length) return;
    const next = [...displayed];
    [next[index], next[target]] = [next[target], next[index]];
    // 乐观更新展示顺序
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
      eyebrow="WISHLIST"
      right={
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          未完成 {activeCount} · 已完成 {doneCount}
        </span>
      }
    >
      {/* 添加条 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="记一条灵感 / 心愿 / 待办…"
            className="h-10 flex-1 rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-muted/80"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!addText.trim()}
            aria-label="添加"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1.5">
          {KIND_ORDER.map((k) => {
            const m = KIND_META[k];
            const on = addKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setAddKind(k)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition',
                  on ? 'bg-foreground/10 text-foreground' : 'bg-muted/50 text-muted-foreground',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 过滤 */}
      <div className="mt-4 flex gap-1.5">
        {(['all', 'active', 'done'] as Filter[]).map((f) => (
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
      </div>

      {/* 列表 */}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="py-10 text-center text-xs text-muted-foreground/60">加载中…</div>
        ) : displayed.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground/60">
            {filter === 'done' ? '还没有已完成的事项' : '池子空空的，上面记一条吧'}
          </div>
        ) : (
          displayed.map((it, idx) => {
            const m = KIND_META[it.kind];
            const Icon = m.icon;
            const editing = editingId === it.id;
            return (
              <div
                key={it.id}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border border-page-line bg-muted/30 p-3 transition',
                  it.done && 'opacity-60',
                )}
              >
                {/* 完成勾选 */}
                <button
                  type="button"
                  onClick={() => patchItem(it.id, { done: !it.done })}
                  aria-label={it.done ? '标记为未完成' : '标记为完成'}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
                    it.done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40 text-transparent hover:border-primary',
                  )}
                >
                  <Check className="h-3 w-3" />
                </button>

                {/* 内容区 */}
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
                        it.done && 'line-through',
                      )}
                    >
                      {it.content}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      {m.label}
                    </span>
                  </div>
                </div>

                {/* 操作 */}
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
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground transition hover:bg-red-500/20 hover:text-red-400"
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

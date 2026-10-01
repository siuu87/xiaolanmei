import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  listMemos,
  listMemoCategories,
  createMemo,
  patchMemo,
  deleteMemo,
  toggleMemoPin,
  type MemoDTO,
  type MemoCategoryDTO,
} from '@/lib/api/memo';
import { MemoCard, CATEGORY_META, CATEGORIES } from './MemoCard';

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

interface Form {
  title: string;
  content: string;
  category: string;
  tags: string;
  importance: string;
}
const EMPTY_FORM: Form = { title: '', content: '', category: 'info', tags: '', importance: '3' };

/** 备忘录页：双人共享备忘录（RAG 用户视角），双方都能查看、增删改、置顶。 */
export function MemoPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [memos, setMemos] = useState<MemoDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [catCounts, setCatCounts] = useState<MemoCategoryDTO[]>([]);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<MemoDTO | null>(null);

  const load = async () => {
    try {
      const [m, c] = await Promise.all([listMemos(), listMemoCategories()]);
      setMemos(m);
      setTotal(c.total);
      setCatCounts(c.categories);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 从聊天页「已记入备忘录」跳转过来时，滚动并高亮对应条目
  useEffect(() => {
    if (highlightId) {
      const el = document.getElementById(`memo-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightId, memos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memos.filter((d) => {
      if (filter !== 'all' && d.category !== filter) return false;
      if (tag && !d.tags.some((t) => t === tag)) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q);
    });
  }, [memos, filter, search, tag]);

  const countOf = (c: string) => catCounts.find((x) => x.category === c)?.count ?? 0;

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditing({});
  };
  const startEdit = (d: MemoDTO) => {
    setForm({
      title: d.title,
      content: d.content,
      category: d.category,
      tags: d.tags.join(', '),
      importance: String(d.importance),
    });
    setEditing({ id: d.id });
  };
  const cancelEdit = () => setEditing(null);
  const set = <K extends keyof Form>(key: K, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const content = form.content.trim();
    if (!content) return;
    const payload = {
      title: form.title.trim() || '(无标题)',
      content,
      category: form.category,
      tags: form.tags
        .split(/[,，、\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
      importance: Math.min(5, Math.max(1, Number(form.importance) || 3)),
    };
    try {
      if (editing?.id) await patchMemo(editing.id, payload);
      else await createMemo(payload);
      setEditing(null);
      await load();
    } catch (e) {
      console.error(e);
      window.alert((e as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMemo(deleting.id);
      setDeleting(null);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const pin = async (id: string) => {
    try {
      await toggleMemoPin(id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xs text-muted-foreground">MEMO · 备忘录</h1>
          <p className="mt-1 text-xs text-muted-foreground/70">双人共享，小蓝莓和你一起记。</p>
        </div>
        <Button size="sm" onClick={startCreate}>
          <Plus className="h-4 w-4" /> 记一条
        </Button>
      </div>

      {/* 统计栏 */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-muted/60 px-3 py-1 text-xs text-foreground/80">共 {total} 条</span>
        {CATEGORIES.filter((c) => c !== 'general' || countOf(c) > 0).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter((f) => (f === c ? 'all' : c))}
            className={cn(
              'rounded-full px-3 py-1 text-xs transition',
              filter === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-foreground/80 hover:bg-muted',
            )}
          >
            {CATEGORY_META[c].label} {countOf(c)}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索备忘…"
          className={cn(inputCls, 'pl-9')}
        />
      </div>

      {/* 标签筛选提示 */}
      {tag && (
        <div className="mt-2 flex items-center gap-1">
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            #{tag}
            <button type="button" onClick={() => setTag(null)} aria-label="清除标签筛选" className="hover:opacity-70">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* 列表 */}
      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl">🫐</div>
            <p className="mt-3 text-sm text-muted-foreground">
              {memos.length === 0 ? '还没有备忘录哦，开始记录你们的日常吧 ✨' : '没有匹配的备忘。'}
            </p>
          </div>
        ) : (
          filtered.map((d) => (
            <div key={d.id} id={`memo-${d.id}`}>
              <MemoCard
                memo={d}
                highlight={d.id === highlightId}
                defaultOpen={d.id === highlightId}
                onEdit={startEdit}
                onDelete={() => setDeleting(d)}
                onTogglePin={pin}
              />
            </div>
          ))
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{editing.id ? '编辑备忘录' : '新建备忘录'}</h2>
              <button type="button" onClick={cancelEdit} aria-label="关闭" className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="标题（如：TA 的饮食忌口）"
                className={cn(inputCls, 'font-medium')}
              />
              <textarea
                value={form.content}
                onChange={(e) => set('content', e.target.value)}
                rows={4}
                autoFocus
                placeholder="记下要记住的内容…"
                className={cn(inputCls, 'resize-y')}
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={form.category} onChange={(e) => set('category', e.target.value)} className={inputCls}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={form.importance}
                  onChange={(e) => set('importance', e.target.value)}
                  title="重要程度 1-5"
                  className={inputCls}
                />
              </div>
              <input
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="标签（逗号分隔，可选）"
                className={inputCls}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cancelEdit}>
                  取消
                </Button>
                <Button onClick={() => void save()} disabled={!form.content.trim()}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-background p-4 shadow-xl">
            <p className="text-sm font-medium">删除这条备忘录？</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{deleting.title}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>
                取消
              </Button>
              <Button variant="destructive" onClick={() => void confirmDelete()}>
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  listRagDocuments,
  createRagDocument,
  patchRagDocument,
  deleteRagDocument,
  type RagDocumentDTO,
} from '@/lib/api/rag';

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  preference: { label: '喜好', cls: 'bg-rose-400/15 text-rose-300' },
  agreement: { label: '约定', cls: 'bg-amber-400/15 text-amber-300' },
  experience: { label: '经历', cls: 'bg-sky-400/15 text-sky-300' },
  info: { label: '信息', cls: 'bg-primary/15 text-primary' },
  inspiration: { label: '灵感', cls: 'bg-violet-400/15 text-violet-300' },
  plan: { label: '计划', cls: 'bg-emerald-400/15 text-emerald-300' },
  general: { label: '其他', cls: 'bg-muted text-muted-foreground' },
};
const CATEGORIES = ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'] as const;

const SOURCE_LABEL: Record<string, string> = { manual: '手动', agent: '小蓝莓', import: '导入', file: '文件' };

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Form {
  title: string;
  content: string;
  category: string;
  tags: string;
  importance: string;
}
const EMPTY_FORM: Form = { title: '', content: '', category: 'info', tags: '', importance: '3' };

/** 备忘录页：两人共享的长期记忆（RAG），双方都能查看、增删改。 */
export function MemoPage() {
  const [docs, setDocs] = useState<RagDocumentDTO[]>([]);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新建
  const [form, setForm] = useState<Form>(EMPTY_FORM);

  const load = async () => {
    try {
      setDocs(await listRagDocuments());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== 'all' && d.category !== filter) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q);
    });
  }, [docs, filter, search]);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };
  const startEdit = (d: RagDocumentDTO) => {
    setForm({
      title: d.title,
      content: d.content,
      category: d.category,
      tags: (d.tags ?? []).join(', '),
      importance: String(d.importance),
    });
    setEditingId(d.id);
  };
  const cancelEdit = () => setEditingId(null);
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
      if (editingId === 'new') await createRagDocument(payload);
      else if (editingId) await patchRagDocument(editingId, payload);
      setEditingId(null);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (d: RagDocumentDTO) => {
    try {
      await deleteRagDocument(d.id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xs text-muted-foreground">MEMO · 备忘录</h1>
        <button
          type="button"
          onClick={startCreate}
          aria-label="记一条"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground/70">两人共享的备忘录，双方的记录都看得到、都能编辑。</p>

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

      {/* 分类筛选 */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'rounded-full px-3 py-1 text-xs transition',
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground/80 hover:bg-muted',
          )}
        >
          全部
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={cn(
              'rounded-full px-3 py-1 text-xs transition',
              filter === c ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground/80 hover:bg-muted',
            )}
          >
            {CATEGORY_META[c].label}
          </button>
        ))}
      </div>

      {/* 编辑表单 */}
      {editingId && (
        <div className="mt-3 space-y-3 rounded-2xl border p-4">
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
      )}

      {/* 列表 */}
      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {docs.length === 0 ? '还没有备忘，点右上角「+」记一条吧。' : '没有匹配的备忘。'}
          </p>
        ) : (
          filtered.map((d) => {
            const meta = CATEGORY_META[d.category] ?? CATEGORY_META.general;
            return (
              <div key={d.id} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', meta.cls)}>{meta.label}</span>
                  {d.source === 'agent' ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <Sparkles className="mr-0.5 inline h-2.5 w-2.5" />
                      {SOURCE_LABEL.agent}
                    </span>
                  ) : (
                    d.source !== 'manual' && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {SOURCE_LABEL[d.source] ?? d.source}
                      </span>
                    )
                  )}
                  {d.tags?.map((t) => (
                    <span key={t} className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-foreground/70">
                      {t}
                    </span>
                  ))}
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">{fmtTime(d.updatedAt)}</span>
                </div>

                <div className="mt-2 text-sm font-medium text-foreground">{d.title}</div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{d.content}</p>

                <div className="mt-2 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(d)}
                    aria-label="编辑"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    aria-label="删除"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

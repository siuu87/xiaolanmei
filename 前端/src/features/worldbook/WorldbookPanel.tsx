import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  listWorldbook,
  createWorldbook,
  patchWorldbook,
  deleteWorldbook,
  previewWorldbook,
  type WorldbookDTO,
} from '@/lib/api/worldbook';

interface FormState {
  name: string;
  content: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { name: '', content: '', enabled: true };

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

/** 世界书管理面板：手动勾选启用、常驻注入的背景设定 */
export function WorldbookPanel() {
  const [entries, setEntries] = useState<WorldbookDTO[]>([]);
  const [preview, setPreview] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新建
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setEntries(await listWorldbook());
    } catch (e) {
      console.error(e);
    }
  };
  const loadPreview = async () => {
    try {
      const r = await previewWorldbook();
      setPreview(r.systemPrompt);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
    void loadPreview();
  }, []);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };
  const startEdit = (w: WorldbookDTO) => {
    setForm({ name: w.name, content: w.content, enabled: w.enabled });
    setEditingId(w.id);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    const name = form.name.trim();
    const content = form.content.trim();
    if (!name || !content) return;
    setBusy(true);
    try {
      if (editingId === 'new') {
        const max = entries.reduce((m, w) => Math.max(m, w.sortOrder), 0);
        await createWorldbook({ name, content, enabled: form.enabled, sortOrder: max + 10 });
      } else if (editingId) {
        await patchWorldbook(editingId, { name, content, enabled: form.enabled });
      }
      await load();
      await loadPreview();
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (w: WorldbookDTO) => {
    try {
      await patchWorldbook(w.id, { enabled: !w.enabled });
      await load();
      await loadPreview();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (w: WorldbookDTO) => {
    try {
      await deleteWorldbook(w.id);
      await load();
      await loadPreview();
    } catch (e) {
      console.error(e);
    }
  };

  const move = async (w: WorldbookDTO, dir: -1 | 1) => {
    const idx = entries.findIndex((x) => x.id === w.id);
    const target = idx + dir;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[idx], next[target]] = [next[target], next[idx]];
    try {
      await Promise.all(next.map((x, i) => patchWorldbook(x.id, { sortOrder: i * 10 })));
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>当前生效的世界书</CardTitle>
              <CardDescription>勾选启用的条目会常驻注入到对话上下文</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => void loadPreview()} aria-label="刷新预览">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {preview ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm leading-6 text-foreground/90">
              {preview}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">还没有启用的世界书条目。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>世界书条目</CardTitle>
              <CardDescription>世界观、角色、地点等背景资料</CardDescription>
            </div>
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4" /> 新建
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有条目，点「新建」写入第一条世界设定吧。
            </p>
          ) : (
            entries.map((w, i) => (
              <div
                key={w.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-3',
                  !w.enabled && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{w.name}</span>
                  <p className="truncate text-xs text-muted-foreground">{w.content}</p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(w, -1)}
                    disabled={i === 0}
                    aria-label="上移"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(w, 1)}
                    disabled={i === entries.length - 1}
                    aria-label="下移"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(w)}
                  aria-label={w.enabled ? '关闭' : '开启'}
                  className={cn(
                    'h-5 w-9 shrink-0 rounded-full transition',
                    w.enabled ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'block h-4 w-4 rounded-full bg-white transition',
                      w.enabled ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(w)}
                  aria-label="编辑"
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(w)}
                  aria-label="删除"
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {editingId && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId === 'new' ? '新建条目' : '编辑条目'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">名称</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="如：主角设定 / 城市背景"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">内容</label>
              <textarea
                value={form.content}
                onChange={(e) => set('content', e.target.value)}
                rows={5}
                placeholder="世界设定正文"
                className={cn(inputCls, 'resize-y')}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              启用（常驻注入）
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEdit}>
                取消
              </Button>
              <Button onClick={() => void save()} disabled={busy || !form.name.trim() || !form.content.trim()}>
                保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

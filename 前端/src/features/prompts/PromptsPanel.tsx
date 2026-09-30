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
  listPrompts,
  createPrompt,
  patchPrompt,
  deletePrompt,
  previewPrompt,
  type PromptDTO,
  type PromptType,
} from '@/lib/api/prompts';

const TYPE_LABEL: Record<PromptType, string> = { global: '全局', model: '按模型' };

interface FormState {
  name: string;
  type: PromptType;
  model: string;
  content: string;
  variables: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { name: '', type: 'global', model: '', content: '', variables: '', enabled: true };

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

/** 角色面板：给 AI 设定角色 / 人设（全局或按模型），启用的会注入对话 system 提示词 */
export function PromptsPanel() {
  const [prompts, setPrompts] = useState<PromptDTO[]>([]);
  const [preview, setPreview] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新建
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setPrompts(await listPrompts());
    } catch (e) {
      console.error(e);
    }
  };
  const loadPreview = async () => {
    try {
      const r = await previewPrompt();
      setPreview(r.systemPrompt);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
    void loadPreview();
  }, []);

  const parseVariables = (): Record<string, string> | null => {
    const v = form.variables.trim();
    if (!v) return null;
    try {
      const parsed = JSON.parse(v);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : null;
    } catch {
      return null;
    }
  };

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };
  const startEdit = (p: PromptDTO) => {
    setForm({
      name: p.name,
      type: p.type,
      model: p.model ?? '',
      content: p.content,
      variables: p.variables ? JSON.stringify(p.variables) : '',
      enabled: p.enabled,
    });
    setEditingId(p.id);
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
    const payload = {
      name,
      content,
      type: form.type,
      model: form.type === 'model' ? form.model.trim() || null : null,
      variables: parseVariables(),
      enabled: form.enabled,
    };
    try {
      if (editingId === 'new') {
        const max = prompts.reduce((m, p) => Math.max(m, p.sortOrder), 0);
        await createPrompt({ ...payload, sortOrder: max + 10 });
      } else if (editingId) {
        await patchPrompt(editingId, payload);
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

  const toggle = async (p: PromptDTO) => {
    try {
      await patchPrompt(p.id, { enabled: !p.enabled });
      await load();
      await loadPreview();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (p: PromptDTO) => {
    try {
      await deletePrompt(p.id);
      await load();
      await loadPreview();
    } catch (e) {
      console.error(e);
    }
  };

  const move = async (p: PromptDTO, dir: -1 | 1) => {
    const idx = prompts.findIndex((x) => x.id === p.id);
    const target = idx + dir;
    if (target < 0 || target >= prompts.length) return;
    const next = [...prompts];
    [next[idx], next[target]] = [next[target], next[idx]];
    try {
      await Promise.all(next.map((x, i) => patchPrompt(x.id, { sortOrder: i * 10 })));
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
              <CardTitle>当前生效的角色设定</CardTitle>
              <CardDescription>启用的角色会按顺序注入到对话的 system 提示词</CardDescription>
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
            <p className="text-sm text-muted-foreground">还没有启用的角色。</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>角色</CardTitle>
              <CardDescription>人设 / 性格 / 说话风格等背景设定</CardDescription>
            </div>
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4" /> 新建
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {prompts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有角色，点「新建」写第一个吧。
            </p>
          ) : (
            prompts.map((p, i) => (
              <div
                key={p.id}
                className={cn('flex items-center gap-2 rounded-lg border p-3', !p.enabled && 'opacity-60')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {TYPE_LABEL[p.type]}
                    </span>
                    {p.type === 'model' && p.model && (
                      <span className="shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {p.model}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{p.content}</p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(p, -1)}
                    disabled={i === 0}
                    aria-label="上移"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(p, 1)}
                    disabled={i === prompts.length - 1}
                    aria-label="下移"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(p)}
                  aria-label={p.enabled ? '关闭' : '开启'}
                  className={cn(
                    'h-5 w-9 shrink-0 rounded-full transition',
                    p.enabled ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'block h-4 w-4 rounded-full bg-white transition',
                      p.enabled ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  aria-label="编辑"
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
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
            <CardTitle>{editingId === 'new' ? '新建角色' : '编辑角色'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">名称</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="如 温柔女友 / 毒舌损友"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">类型</label>
              <div className="flex gap-2">
                {(['global', 'model'] as PromptType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('type', t)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm transition',
                      form.type === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-foreground/80 hover:bg-muted',
                    )}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {form.type === 'model' && (
              <div>
                <label className="mb-1 block text-sm font-medium">模型</label>
                <input
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="如 deepseek-chat"
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">角色设定</label>
              <textarea
                value={form.content}
                onChange={(e) => set('content', e.target.value)}
                rows={5}
                placeholder="描述这个角色的性格、说话方式…"
                className={cn(inputCls, 'resize-y')}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">变量（可选，JSON）</label>
              <textarea
                value={form.variables}
                onChange={(e) => set('variables', e.target.value)}
                rows={2}
                placeholder='如 {"name":"小蓝莓"}'
                className={cn(inputCls, 'resize-none font-mono text-xs')}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              启用（注入对话）
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

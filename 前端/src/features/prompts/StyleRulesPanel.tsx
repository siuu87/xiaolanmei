import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  listStyleRules,
  createStyleRule,
  patchStyleRule,
  deleteStyleRule,
  STYLE_POSITIONS,
  POSITION_LABEL,
  type StyleRuleDTO,
  type StylePosition,
} from '@/lib/api/styleRules';

/**
 * 语言风格条目面板：「类似世界书」的交互 —— 右上角 + 新增、可上下调序、
 * 每条带启用开关与插入位置（前 / 中 / 后）。
 *
 * 位置的含义由后端 `buildSystemPrompt()` 决定（见 `routes/prompts.ts`）：
 * 前 = 角色设定整块之前，中 = 插在模块序列正中，后 = 整块之后。
 * 这里把「前/中/后」翻译成人话（POSITION_LABEL），免得用户猜。
 */

const SHORT: Record<StylePosition, string> = { before: '前', middle: '中', after: '后' };

function asPosition(v: string): StylePosition {
  return (STYLE_POSITIONS as string[]).includes(v) ? (v as StylePosition) : 'after';
}

interface FormState {
  name: string;
  content: string;
  position: StylePosition;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { name: '', content: '', position: 'after', enabled: true };

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

export function StyleRulesPanel() {
  const [rules, setRules] = useState<StyleRuleDTO[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新建
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setRules(await listStyleRules());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };
  const startEdit = (r: StyleRuleDTO) => {
    setForm({ name: r.name, content: r.content, position: asPosition(r.position), enabled: r.enabled });
    setEditingId(r.id);
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
    const payload = { name, content, position: form.position, enabled: form.enabled };
    try {
      if (editingId === 'new') {
        // 序号取**全量**最大值，别用当前列表（列表可能被过滤/为空）
        const max = rules.reduce((m, r) => Math.max(m, r.sortOrder), 0);
        await createStyleRule({ ...payload, sortOrder: max + 10 });
      } else if (editingId) {
        await patchStyleRule(editingId, payload);
      }
      await load();
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: StyleRuleDTO) => {
    try {
      await patchStyleRule(r.id, { enabled: !r.enabled });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (r: StyleRuleDTO) => {
    try {
      await deleteStyleRule(r.id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const move = async (r: StyleRuleDTO, dir: -1 | 1) => {
    const idx = rules.findIndex((x) => x.id === r.id);
    const target = idx + dir;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[idx], next[target]] = [next[target], next[idx]];
    try {
      await Promise.all(next.map((x, i) => patchStyleRule(x.id, { sortOrder: i * 10 })));
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-3" data-testid="style-rules-panel">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>语言风格条目</CardTitle>
              <CardDescription>像世界书一样：加一条、选它插在角色设定的前 / 中 / 后</CardDescription>
            </div>
            <Button size="sm" onClick={startCreate} data-testid="style-add">
              <Plus className="h-4 w-4" /> 新增
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有条目，点「新增」加第一条吧。
            </p>
          ) : (
            rules.map((r, i) => (
              <div
                key={r.id}
                data-testid={`style-row-${i}`}
                data-position={asPosition(r.position)}
                className={cn('flex items-center gap-2 rounded-lg border p-3', !r.enabled && 'opacity-60')}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <span
                      data-testid={`style-row-${i}-position`}
                      className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {SHORT[asPosition(r.position)]} · {POSITION_LABEL[asPosition(r.position)].split(' · ')[1]}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{r.content}</p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(r, -1)}
                    disabled={i === 0}
                    aria-label="上移"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(r, 1)}
                    disabled={i === rules.length - 1}
                    aria-label="下移"
                    className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(r)}
                  aria-label={r.enabled ? '关闭' : '开启'}
                  className={cn('h-5 w-9 shrink-0 rounded-full transition', r.enabled ? 'bg-primary' : 'bg-muted')}
                >
                  <span
                    className={cn(
                      'block h-4 w-4 rounded-full bg-white transition',
                      r.enabled ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  aria-label="编辑"
                  className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(r)}
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
            <CardTitle>{editingId === 'new' ? '新增条目' : '编辑条目'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">名称</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="如 多用短句 / 少用感叹号"
                data-testid="style-name"
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">插入位置</label>
              <div className="flex flex-col gap-1.5" data-testid="style-positions">
                {STYLE_POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('position', p)}
                    aria-pressed={form.position === p}
                    data-testid={`style-position-${p}`}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-left text-sm transition',
                      form.position === p
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-foreground/80 hover:bg-muted',
                    )}
                  >
                    {POSITION_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">内容</label>
              <textarea
                value={form.content}
                onChange={(e) => set('content', e.target.value)}
                rows={4}
                placeholder="写这条风格要求，会按上面的位置插进 system 提示词…"
                data-testid="style-content"
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
              启用（注入对话）
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEdit}>
                取消
              </Button>
              <Button
                onClick={() => void save()}
                disabled={busy || !form.name.trim() || !form.content.trim()}
                data-testid="style-save"
              >
                保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

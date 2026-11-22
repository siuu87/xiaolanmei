import { useEffect, useMemo, useState } from 'react';
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
 * 世界书条目面板（原「语言风格条目」）：右上角 + 新增、可上下调序、
 * 每条带启用开关与插入位置（前 / 中 / 后）。
 *
 * 位置的含义由后端 `buildSystemPrompt()` 决定（见 `routes/prompts.ts`）：
 * 前 = 角色设定整块之前，中 = 插在模块序列正中，后 = 整块之后。
 *
 * **分模块（2026-11-19 用户定）**：每条条目可归到一个 `module`（展示分组），
 * 面板按模块分节展示，上移/下移在**组内**进行。`module` 只影响资料页归组，
 * 注入顺序仍由后端按 position + sortOrder 决定，这里不动注入逻辑。
 */

const SHORT: Record<StylePosition, string> = { before: '前', middle: '中', after: '后' };

/** 空模块的显示名 */
const DEFAULT_MODULE = '默认';

function asPosition(v: string): StylePosition {
  return (STYLE_POSITIONS as string[]).includes(v) ? (v as StylePosition) : 'after';
}

interface FormState {
  name: string;
  content: string;
  position: StylePosition;
  enabled: boolean;
  module: string;
}

const EMPTY_FORM: FormState = { name: '', content: '', position: 'after', enabled: true, module: '' };

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

/** 按模块分组：保留各条目当前 sortOrder，组内按 sortOrder 升序。空 module 归「默认」。 */
function groupByModule(rules: StyleRuleDTO[]): { label: string; items: StyleRuleDTO[] }[] {
  const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  const order: string[] = [];
  const map = new Map<string, StyleRuleDTO[]>();
  for (const r of sorted) {
    const label = r.module.trim() || DEFAULT_MODULE;
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(r);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

/**
 * 重排 sortOrder：把分组后的扁平顺序写回，保证每组条目在 sortOrder 上连续、
 * 不与其它组撞序（上移/下移只交换组内两条，新增/删除后调这个归位）。
 */
async function normalizeOrder(rules: StyleRuleDTO[]) {
  const groups = groupByModule(rules);
  const flat = groups.flatMap((g) => g.items);
  await Promise.all(flat.map((r, i) => patchStyleRule(r.id, { sortOrder: i * 10 })));
}

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

  const groups = useMemo(() => groupByModule(rules), [rules]);

  /** 已有模块名（去重、去掉空），给新增/编辑时做输入建议 */
  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rules) if (r.module.trim()) set.add(r.module.trim());
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
  }, [rules]);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };
  const startEdit = (r: StyleRuleDTO) => {
    setForm({ name: r.name, content: r.content, position: asPosition(r.position), enabled: r.enabled, module: r.module });
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
    const payload = { name, content, position: form.position, enabled: form.enabled, module: form.module.trim() };
    try {
      if (editingId === 'new') {
        // 序号取**全量**最大值，别用当前列表（列表可能被过滤/为空）
        const max = rules.reduce((m, r) => Math.max(m, r.sortOrder), 0);
        await createStyleRule({ ...payload, sortOrder: max + 10 });
      } else if (editingId) {
        await patchStyleRule(editingId, payload);
      }
      await load();
      await normalizeOrder(await listStyleRules());
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
      const rest = await listStyleRules();
      await normalizeOrder(rest);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  /** 组内上移/下移：交换相邻两条的 sortOrder */
  const move = async (group: StyleRuleDTO[], r: StyleRuleDTO, dir: -1 | 1) => {
    const idx = group.findIndex((x) => x.id === r.id);
    const target = idx + dir;
    if (target < 0 || target >= group.length) return;
    const a = group[idx];
    const b = group[target];
    try {
      await Promise.all([
        patchStyleRule(a.id, { sortOrder: b.sortOrder }),
        patchStyleRule(b.id, { sortOrder: a.sortOrder }),
      ]);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4" data-testid="style-rules-panel">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>世界书条目</CardTitle>
              <CardDescription>加一条世界设定或说话方式，选它插在角色设定的前 / 中 / 后</CardDescription>
            </div>
            <Button size="sm" onClick={startCreate} data-testid="style-add">
              <Plus className="h-4 w-4" /> 新增
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {rules.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              还没有条目，点「新增」加第一条吧。
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.label} data-testid={`style-group-${g.label}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-muted-foreground">{g.items.length} 条</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((r, i) => (
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
                          onClick={() => void move(g.items, r, -1)}
                          disabled={i === 0}
                          aria-label="上移"
                          className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void move(g.items, r, 1)}
                          disabled={i === g.items.length - 1}
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
                  ))}
                </div>
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
              <label className="mb-1 block text-sm font-medium">模块（分组，可选）</label>
              <input
                value={form.module}
                onChange={(e) => set('module', e.target.value)}
                placeholder="如 背景设定 / 说话方式，留空=默认"
                list="style-module-options"
                data-testid="style-module"
                className={inputCls}
              />
              <datalist id="style-module-options">
                {moduleOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-muted-foreground">同模块的条目在资料页归到一组，上移/下移只在组内生效。</p>
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
                placeholder="写这条世界设定，会按上面的位置插进 system 提示词…"
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

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, FlaskConical, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  listSkills,
  createSkill,
  patchSkill,
  toggleSkill,
  deleteSkill,
  seedSkills,
  matchSkills,
  type SkillDTO,
  type SkillTriggerMode,
} from '@/lib/api/skills';

const TRIGGER_LABEL: Record<SkillTriggerMode, string> = {
  keyword: '关键词',
  always: '始终',
  manual: '手动',
};
const TRIGGER_CLS: Record<SkillTriggerMode, string> = {
  keyword: 'bg-sky-400/15 text-sky-300',
  always: 'bg-emerald-400/15 text-emerald-300',
  manual: 'bg-amber-400/15 text-amber-300',
};
const TRIGGER_MODES: SkillTriggerMode[] = ['keyword', 'always', 'manual'];

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

interface SkillForm {
  name: string;
  description: string;
  instruction: string;
  triggerMode: SkillTriggerMode;
  triggerKeywords: string;
  icon: string;
  color: string;
  priority: string;
}

const EMPTY_FORM: SkillForm = {
  name: '',
  description: '',
  instruction: '',
  triggerMode: 'keyword',
  triggerKeywords: '',
  icon: '',
  color: '',
  priority: '0',
};

/** 技能面板：可视化查看/管理技能（内置 + 外部导入/自定义）。可折叠（默认收起），抽屉里用 collapsible={false} 常开。 */
export function SkillsPanel({
  collapsible = true,
  defaultCollapsed = true,
}: { collapsible?: boolean; defaultCollapsed?: boolean } = {}) {
  const [open, setOpen] = useState(collapsible ? !defaultCollapsed : true);
  const [skills, setSkills] = useState<SkillDTO[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新建
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM);
  const [seedBusy, setSeedBusy] = useState(false);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<{ id: string; name: string; slug: string; reason: string; confidence: number }[] | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const load = async () => {
    try {
      setSkills(await listSkills());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const builtins = skills.filter((s) => s.category === 'builtin');
  const customs = skills.filter((s) => s.category === 'custom');

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };
  const startEdit = (s: SkillDTO) => {
    setForm({
      name: s.name,
      description: s.description,
      instruction: s.instruction,
      triggerMode: s.triggerMode,
      triggerKeywords: s.triggerKeywords.join(', '),
      icon: s.icon ?? '',
      color: s.color ?? '',
      priority: String(s.priority),
    });
    setEditingId(s.id);
  };
  const cancelEdit = () => setEditingId(null);
  const set = <K extends keyof SkillForm>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const name = form.name.trim();
    const instruction = form.instruction.trim();
    if (!name || !instruction) return;
    const payload = {
      name,
      description: form.description.trim(),
      instruction,
      triggerMode: form.triggerMode,
      triggerKeywords: form.triggerKeywords
        .split(/[,，、\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
      icon: form.icon.trim() || null,
      color: form.color.trim() || null,
      priority: Number(form.priority) || 0,
    };
    try {
      if (editingId === 'new') await createSkill(payload);
      else if (editingId) await patchSkill(editingId, payload);
      setEditingId(null);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const toggle = async (s: SkillDTO) => {
    try {
      await toggleSkill(s.id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (s: SkillDTO) => {
    try {
      await deleteSkill(s.id);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const seed = async () => {
    setSeedBusy(true);
    try {
      await seedSkills();
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSeedBusy(false);
    }
  };

  const runTest = async () => {
    const q = testText.trim();
    if (!q) return;
    setTestBusy(true);
    try {
      setTestResult((await matchSkills(q)).matches);
    } catch (e) {
      console.error(e);
    } finally {
      setTestBusy(false);
    }
  };

  const renderSkill = (s: SkillDTO) => (
    <div key={s.id} className={cn('rounded-lg border p-3', !s.enabled && 'opacity-50')}>
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{s.icon ?? '✨'}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px]',
            s.category === 'builtin' ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
          )}
        >
          {s.category === 'builtin' ? '内置' : '自定义'}
        </span>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', TRIGGER_CLS[s.triggerMode])}>
          {TRIGGER_LABEL[s.triggerMode]}
        </span>
        {/* 启用开关 */}
        <button
          type="button"
          onClick={() => toggle(s)}
          aria-label={s.enabled ? '停用' : '启用'}
          className={cn('h-5 w-9 shrink-0 rounded-full transition', s.enabled ? 'bg-primary' : 'bg-muted')}
        >
          <span
            className={cn(
              'block h-4 w-4 rounded-full bg-white transition',
              s.enabled ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
        {s.category === 'custom' && (
          <>
            <button
              type="button"
              onClick={() => startEdit(s)}
              aria-label="编辑"
              className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => remove(s)}
              aria-label="删除"
              className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2">
        {s.description && <p className="min-w-0 flex-1 text-xs text-muted-foreground">{s.description}</p>}
        <span className="ml-auto shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
          优先级 {s.priority}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {s.triggerMode === 'keyword' &&
          (s.triggerKeywords.length ? (
            s.triggerKeywords.map((k) => (
              <span key={k} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-foreground/70">
                {k}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground/50">未设置关键词</span>
          ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="p-4">
        <div className="flex items-center gap-2">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? '收起技能' : '展开技能'}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
              />
              <div className="min-w-0 flex-1">
                <CardTitle>技能</CardTitle>
                <CardDescription>条件触发的提示词片段，聊天时按关键词/始终/手动激活</CardDescription>
              </div>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <CardTitle>技能</CardTitle>
              <CardDescription>条件触发的提示词片段，聊天时按关键词/始终/手动激活</CardDescription>
            </div>
          )}
          {open && (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={() => void seed()} disabled={seedBusy}>
                <RefreshCw className={cn('h-4 w-4', seedBusy && 'animate-spin')} /> 恢复内置
              </Button>
              <Button size="sm" onClick={startCreate}>
                <Plus className="h-4 w-4" /> 新技能
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {open && (
      <CardContent className="space-y-4">
        {skills.length === 0 && !editingId ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            还没有技能，点「新技能」添加，或「恢复内置」初始化。
          </p>
        ) : (
          <>
            {customs.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">自定义 / 外部导入</div>
                {customs.map(renderSkill)}
              </div>
            )}
            {builtins.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">内置</div>
                {builtins.map(renderSkill)}
              </div>
            )}
          </>
        )}

        {editingId && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">名称</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="如 点外卖助手" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">图标（emoji）</label>
                <input value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="🍔" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">颜色（十六进制，可选）</label>
              <input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="#f59e0b" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">描述</label>
              <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="一句话说明这个技能干什么" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">提示词（激活后注入）</label>
              <textarea
                value={form.instruction}
                onChange={(e) => set('instruction', e.target.value)}
                rows={4}
                autoFocus
                placeholder="当用户…时，你应该…"
                className={cn(inputCls, 'resize-y')}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">触发方式</label>
                <select
                  value={form.triggerMode}
                  onChange={(e) => set('triggerMode', e.target.value)}
                  className={inputCls}
                >
                  {TRIGGER_MODES.map((m) => (
                    <option key={m} value={m}>
                      {TRIGGER_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">优先级</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">触发关键词（逗号分隔）</label>
              <input
                value={form.triggerKeywords}
                onChange={(e) => set('triggerKeywords', e.target.value)}
                placeholder="外卖,点餐,吃什么"
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEdit}>
                取消
              </Button>
              <Button onClick={() => void save()} disabled={!form.name.trim() || !form.instruction.trim()}>
                保存
              </Button>
            </div>
          </div>
        )}

        {/* 测试匹配 */}
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5" /> 测试匹配
          </div>
          <div className="flex gap-2">
            <input
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runTest()}
              placeholder="模拟输入一段话，看看会激活哪些技能"
              className={inputCls}
            />
            <Button size="sm" variant="outline" onClick={() => void runTest()} disabled={testBusy || !testText.trim()}>
              测试
            </Button>
          </div>
          {testResult && (
            <div className="space-y-2">
              {testResult.length === 0 ? (
                <p className="text-xs text-muted-foreground">没有技能被激活。</p>
              ) : (
                testResult.map((r) => (
                  <div key={r.id} className="rounded-lg bg-muted/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-medium">{r.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{r.reason}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(r.confidence * 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </CardContent>
      )}
    </Card>
  );
}

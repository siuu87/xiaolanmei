import { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  useAppStore,
  ACCENT_HSL,
  ACCENT_PRESETS,
  type Accent,
  type NumFont,
  type Theme,
} from '@/stores/appStore';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { useStationStore } from '@/stores/stationStore';
import type { Station } from '@/lib/api/stations';
import { MemoryPanel } from '@/features/memory/MemoryPage';
import { SyncPanel } from '@/features/sync/SyncPage';
import { SkillsPanel } from '@/features/skills/SkillsPanel';
import { ProfileCard } from './ProfileCard';
import { PromptsPanel } from '@/features/prompts/PromptsPanel';
import { StickerSettings } from './StickerSettings';

// 数字字体预设：key → 名称 + 预览用字体
const NUM_FONT_PRESETS = [
  { key: 'serif', name: '飘逸衬线', fontFamily: "'Playfair Display', Georgia, serif" },
  { key: 'sans', name: '现代无衬线', fontFamily: 'Inter, system-ui, sans-serif' },
] as const;

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

interface ModelFormState {
  temperature: string;
  visionStationId: string; // '' = 未配置识图模型
  visionModel: string;
}

interface StationFormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
}

/** 设置页（阶段 8）：外观 + 模型参数 + 多 API 站子管理（Key 只存后端，绝不下发） */
export function SettingsPage() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const numFont = useAppStore((s) => s.numFont);
  const setNumFont = useAppStore((s) => s.setNumFont);
  const accent = useAppStore((s) => s.accent);
  const setAccent = useAppStore((s) => s.setAccent);

  const stations = useStationStore((s) => s.stations);
  const stationLoad = useStationStore((s) => s.load);
  const addStation = useStationStore((s) => s.addStation);
  const updateStation = useStationStore((s) => s.updateStation);
  const removeStation = useStationStore((s) => s.removeStation);

  const [form, setForm] = useState<ModelFormState>({ temperature: '0.7', visionStationId: '', visionModel: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [sf, setSf] = useState<StationFormState>({ name: '', baseUrl: '', apiKey: '', models: '' });

  useEffect(() => {
    getSettings()
      .then((s) => {
        setForm({
          temperature: String(s.temperature),
          visionStationId: s.visionStationId ?? '',
          visionModel: s.visionModel ?? '',
        });
      })
      .catch((e) => console.error(e));
    void stationLoad();
  }, [stationLoad]);

  const set = <K extends keyof ModelFormState>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await updateSettings({
        temperature: Number(form.temperature),
        visionStationId: form.visionStationId || null,
        visionModel: form.visionModel || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // ---- 站子表单 ----
  const openAdd = () => {
    setEditing({});
    setSf({ name: '', baseUrl: '', apiKey: '', models: '' });
  };
  const openEdit = (s: Station) => {
    setEditing({ id: s.id });
    setSf({ name: s.name, baseUrl: s.baseUrl, apiKey: '', models: s.models.join(', ') });
  };
  const closeEditor = () => setEditing(null);
  const setS = <K extends keyof StationFormState>(key: K, value: string) =>
    setSf((f) => ({ ...f, [key]: value }));

  const saveStation = async () => {
    const name = sf.name.trim();
    const baseUrl = sf.baseUrl.trim();
    if (!name || !baseUrl) return;
    const models = sf.models
      .split(/[,，\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const payload = {
      name,
      baseUrl,
      models,
      ...(sf.apiKey.trim() ? { apiKey: sf.apiKey.trim() } : {}),
    };
    try {
      if (editing?.id) await updateStation(editing.id, payload);
      else await addStation(payload);
      closeEditor();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">我</h1>
        <p className="mt-1 text-muted-foreground">个人资料、AI 角色、外观与设置。</p>
      </div>

      <ProfileCard />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">AI 角色</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">设定小蓝莓的人设、性格与说话风格，聊天时注入。</p>
        </div>
        <PromptsPanel />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>主题、强调色、数字字体，全局即时生效并记住</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-medium">主题</div>
            <div className="flex gap-2">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <Button
                  key={t}
                  variant={theme === t ? 'default' : 'outline'}
                  onClick={() => setTheme(t)}
                >
                  {t === 'light' ? '浅色' : '深色'}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">强调色</div>
            <div className="flex flex-wrap gap-3">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setAccent(p.key as Accent)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition',
                    accent === p.key
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span
                    className="h-7 w-7 rounded-full shadow-inner"
                    style={{ backgroundColor: `hsl(${ACCENT_HSL[p.key]})` }}
                  />
                  <span className="text-xs text-foreground">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">数字字体</div>
            <div className="grid grid-cols-2 gap-3">
              {NUM_FONT_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setNumFont(p.key as NumFont)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 transition',
                    numFont === p.key
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  <span className="text-2xl leading-none" style={{ fontFamily: p.fontFamily }}>
                    0123456789
                  </span>
                  <span className="text-sm text-foreground">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型参数</CardTitle>
          <CardDescription>温度，对所有站子生效</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">温度（0–2）</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => set('temperature', e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">识图模型（可选）</label>
            <p className="mb-2 text-xs text-muted-foreground">
              主模型不会看图时，用它把图片转成文字再喂给主模型（选一个视觉模型，如 glm-4v / gemini flash）。
            </p>
            <div className="flex gap-2">
              <select
                value={form.visionStationId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, visionStationId: e.target.value, visionModel: '' }))
                }
                className={inputCls}
              >
                <option value="">不使用识图模型</option>
                {stations.filter((s) => s.enabled).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={form.visionModel}
                onChange={(e) => setForm((f) => ({ ...f, visionModel: e.target.value }))}
                disabled={!form.visionStationId}
                className={inputCls}
              >
                <option value="">选择模型</option>
                {(stations.find((s) => s.id === form.visionStationId)?.models ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-primary">
                <Check className="h-4 w-4" /> 已保存
              </span>
            )}
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API 站子</CardTitle>
          <CardDescription>
            可添加多个站子，各自配 Base URL、Key 与模型列表；聊天页按站子选模型。Key 只存后端。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stations.map((s) => (
            <div key={s.id} className="rounded-xl border p-3">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                {s.isDefault && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    默认
                  </span>
                )}
                {!s.enabled && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    已停用
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void updateStation(s.id, { isDefault: true })}
                  title={s.isDefault ? '已是默认' : '设为默认'}
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition',
                    s.isDefault ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Star className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void updateStation(s.id, { enabled: !s.enabled })}
                  title={s.enabled ? '停用' : '启用'}
                  className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                >
                  {s.enabled ? '停用' : '启用'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  title="编辑"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void removeStation(s.id)}
                  title="删除"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{s.baseUrl}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.models.length ? (
                  s.models.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-foreground/70"
                    >
                      {m}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">未配置模型</span>
                )}
              </div>
            </div>
          ))}

          {stations.length === 0 && !editing && (
            <div className="text-sm text-muted-foreground/60">还没有站子，先添加一个。</div>
          )}

          {editing ? (
            <div className="space-y-2 rounded-xl border border-primary/40 p-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">名称</label>
                <input
                  value={sf.name}
                  onChange={(e) => setS('name', e.target.value)}
                  placeholder="如 DeepSeek 官方"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Base URL</label>
                <input
                  value={sf.baseUrl}
                  onChange={(e) => setS('baseUrl', e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">API Key</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={sf.apiKey}
                    onChange={(e) => setS('apiKey', e.target.value)}
                    placeholder={editing.id ? '留空则保持不变' : '留空表示无需 Key'}
                    className={cn(inputCls, 'pl-9')}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">模型列表（逗号或换行分隔）</label>
                <textarea
                  value={sf.models}
                  onChange={(e) => setS('models', e.target.value)}
                  placeholder={'deepseek-chat, deepseek-reasoner'}
                  rows={2}
                  className={cn(inputCls, 'resize-none')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeEditor}>
                  取消
                </Button>
                <Button onClick={() => void saveStation()}>保存</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={openAdd} className="w-full">
              <Plus className="h-4 w-4" /> 添加站子
            </Button>
          )}
        </CardContent>
      </Card>

      <StickerSettings />

      {/* 记忆与摘要 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">记忆与摘要</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">小蓝莓记下的关于你们的事，会在聊天中引用。</p>
        </div>
        <MemoryPanel />
      </section>

      {/* 技能 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">技能</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            管理小蓝莓的技能：内置技能 + 你新增/外部导入的技能，聊天时按条件触发。
          </p>
        </div>
        <SkillsPanel />
      </section>

      {/* 云同步 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">云同步</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">本地 ↔ VPS 双向同步（API Key / MCP 密钥不会同步）。</p>
        </div>
        <SyncPanel />
      </section>
    </div>
  );
}

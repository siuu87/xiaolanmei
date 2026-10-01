import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Brain,
  Calendar,
  Check,
  Database,
  FileText,
  Globe,
  Heart,
  Info,
  KeyRound,
  Loader2,
  MessageCircle,
  Moon,
  Palette,
  Pencil,
  Plus,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useAppStore,
  ACCENT_HSL,
  ACCENT_PRESETS,
  type Accent,
  type NumFont,
  type Theme,
} from '@/stores/appStore';
import { useProfileStore } from '@/stores/profileStore';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { useStationStore } from '@/stores/stationStore';
import type { Station } from '@/lib/api/stations';
import { MemoryPanel } from '@/features/memory/MemoryPage';
import { SyncPanel } from '@/features/sync/SyncPage';
import { SkillsPanel } from '@/features/skills/SkillsPanel';
import { PromptsPanel } from '@/features/prompts/PromptsPanel';
import { StickerSettings } from './StickerSettings';
import { ProfilesSection } from './ProfilesSection';
import { listMemos, type MemoDTO } from '@/lib/api/memo';
import { CATEGORY_META } from '@/features/memo/MemoCard';
import {
  usePeriodStore,
  diffDays,
  todayISODate,
  predictNextStart,
  careMessage,
} from '@/features/home/periodStore';
import { IOSSettingGroup } from '@/components/ios/IOSSettingGroup';
import { IOSSettingItem } from '@/components/ios/IOSSettingItem';
import { IOSSwitch } from '@/components/ios/IOSSwitch';
import { IOSProfileCard } from '@/components/ios/ProfileCard';

const NUM_FONT_PRESETS = [
  { key: 'serif', name: '飘逸衬线', fontFamily: "'Playfair Display', Georgia, serif" },
  { key: 'sans', name: '现代无衬线', fontFamily: 'Inter, system-ui, sans-serif' },
] as const;

const inputCls =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary';

interface ModelFormState {
  temperature: string;
  visionStationId: string;
  visionModel: string;
}

interface StationFormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
}

/** localStorage 布尔开关（纯前端偏好，不改变业务逻辑） */
function useLocalSwitch(key: string, def = false) {
  const [v, setV] = useState<boolean>(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return def;
    }
  });
  const set = (next: boolean) => {
    setV(next);
    try {
      localStorage.setItem(key, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  return [v, set] as const;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/** 设置页（iOS 风格）：把原设置页的各区块收进 iOS 分组，点击条目内联展开，业务逻辑不变。 */
export function SettingsPage() {
  const navigate = useNavigate();

  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const numFont = useAppStore((s) => s.numFont);
  const setNumFont = useAppStore((s) => s.setNumFont);
  const accent = useAppStore((s) => s.accent);
  const setAccent = useAppStore((s) => s.setAccent);

  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const signature = useProfileStore((s) => s.signature);

  const stations = useStationStore((s) => s.stations);
  const stationLoad = useStationStore((s) => s.load);
  const addStation = useStationStore((s) => s.addStation);
  const updateStation = useStationStore((s) => s.updateStation);
  const removeStation = useStationStore((s) => s.removeStation);

  const periodRecords = usePeriodStore((s) => s.records);
  const periodSettings = usePeriodStore((s) => s.settings);

  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((e) => (e === key ? null : key));

  const [memos, setMemos] = useState<MemoDTO[]>([]);
  const [memoNotify, setMemoNotify] = useLocalSwitch('blueberry.memoNotify', false);
  const [bedReminder, setBedReminder] = useLocalSwitch('blueberry.bedReminder', false);

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

  useEffect(() => {
    listMemos()
      .then((m) => setMemos(m))
      .catch(() => {});
  }, []);

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
    const sName = sf.name.trim();
    const baseUrl = sf.baseUrl.trim();
    if (!sName || !baseUrl) return;
    const models = sf.models
      .split(/[,，\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const payload = {
      name: sName,
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

  // ---- 经期派生 ----
  const lastStart = periodRecords.length ? periodRecords[periodRecords.length - 1].days[0] : null;
  const daysAgo = lastStart ? diffDays(lastStart, todayISODate()) : null;
  const next = predictNextStart(periodRecords, periodSettings);
  const periodCare = careMessage({ records: periodRecords, settings: periodSettings });

  const recent = memos.slice(0, 3);

  return (
    <div className="min-h-full bg-[#f2f2f7] pb-12 dark:bg-black">
      {/* 标题栏 */}
      <div className="sticky top-0 z-10 bg-[#f2f2f7]/90 backdrop-blur dark:bg-black/90">
        <div className="pt-6 pb-2 text-center text-[17px] font-semibold text-gray-900 dark:text-gray-100">
          设置
        </div>
      </div>

      {/* 个人资料 */}
      <IOSProfileCard avatar={avatar} name={name} status={signature || '在线 · 刚刚活跃'} />

      <div className="h-5" />

      {/* 备忘录 */}
      <IOSSettingGroup title="备忘录">
        <IOSSettingItem
          icon={<FileText className="h-4 w-4" />}
          iconBg="bg-orange-400"
          title="我的备忘录"
          subtitle="你和 AI 一起记录的一切"
          value={memos.length ? String(memos.length) : undefined}
          showChevron
          onClick={() => toggle('memo')}
        />
        {expanded === 'memo' && (
          <div className="bg-gray-50/60 px-4 py-3 dark:bg-zinc-950/40">
            {recent.length ? (
              <div className="space-y-2">
                {recent.map((m) => {
                  const meta = CATEGORY_META[m.category] ?? CATEGORY_META.general;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigate('/memo')}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.dot }} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-gray-800 dark:text-gray-200">
                        {m.title}
                      </span>
                      <span className="shrink-0 text-[12px] text-gray-400 dark:text-zinc-500">
                        {fmtTime(m.updatedAt)}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => navigate('/memo')}
                  className="w-full pt-1 text-left text-[14px] font-medium text-primary"
                >
                  查看全部 →
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-gray-400 dark:text-zinc-500">还没有备忘录，聊天时会自动帮你记。</p>
            )}
          </div>
        )}
        <IOSSettingItem
          icon={<Bell className="h-4 w-4" />}
          iconBg="bg-rose-400"
          title="待提醒"
          subtitle="有提醒的备忘录会标记出来"
          trailing={<IOSSwitch checked={memoNotify} onCheckedChange={setMemoNotify} />}
        />
      </IOSSettingGroup>

      <div className="h-5" />

      {/* AI 伴侣 */}
      <IOSSettingGroup title="AI 伴侣">
        <IOSSettingItem
          icon={<Sparkles className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="技能管理"
          subtitle="内置技能 + 你新增的技能，聊天时按条件触发"
          showChevron
          onClick={() => toggle('skills')}
        />
        {expanded === 'skills' && (
          <div className="bg-gray-50/60 px-3 py-3 dark:bg-zinc-950/40">
            <SkillsPanel />
          </div>
        )}
        <IOSSettingItem
          icon={<MessageCircle className="h-4 w-4" />}
          iconBg="bg-blue-400"
          title="对话风格"
          subtitle="设定小蓝莓的人设、性格与说话风格"
          showChevron
          onClick={() => toggle('prompts')}
        />
        {expanded === 'prompts' && (
          <div className="bg-gray-50/60 px-3 py-3 dark:bg-zinc-950/40">
            <PromptsPanel />
          </div>
        )}
        <IOSSettingItem
          icon={<Brain className="h-4 w-4" />}
          iconBg="bg-teal-400"
          title="长期记忆"
          subtitle="小蓝莓记下的关于你们的事"
          showChevron
          onClick={() => toggle('memory')}
        />
        {expanded === 'memory' && (
          <div className="bg-gray-50/60 px-3 py-3 dark:bg-zinc-950/40">
            <MemoryPanel />
          </div>
        )}
      </IOSSettingGroup>

      <div className="h-5" />

      {/* 提醒与身体状态 */}
      <IOSSettingGroup title="提醒与身体状态">
        <IOSSettingItem
          icon={<Calendar className="h-4 w-4" />}
          iconBg="bg-rose-400"
          title="经期记录"
          subtitle={periodCare}
          value={daysAgo !== null ? `上次 ${daysAgo} 天前` : undefined}
          showChevron
          onClick={() => toggle('period')}
        />
        {expanded === 'period' && (
          <div className="bg-gray-50/60 px-4 py-3 dark:bg-zinc-950/40">
            <p className="text-[13px] leading-6 text-gray-500 dark:text-zinc-400">
              {periodCare}
            </p>
            {next && (
              <p className="mt-1 text-[13px] text-gray-400 dark:text-zinc-500">
                预测下次经期：{next}
              </p>
            )}
            <p className="mt-2 text-[12px] text-gray-400 dark:text-zinc-600">
              在「首页 → 日历」里点选日期即可标记经期。
            </p>
          </div>
        )}
        <IOSSettingItem
          icon={<Moon className="h-4 w-4" />}
          iconBg="bg-indigo-400"
          title="睡前提醒"
          subtitle="晚上温柔地提醒你早点休息"
          trailing={<IOSSwitch checked={bedReminder} onCheckedChange={setBedReminder} />}
        />
      </IOSSettingGroup>

      <div className="h-5" />

      {/* 通用 */}
      <IOSSettingGroup title="通用">
        <IOSSettingItem
          icon={<Palette className="h-4 w-4" />}
          iconBg="bg-amber-400"
          title="外观"
          subtitle="主题、强调色、数字字体"
          value={theme === 'light' ? '浅色' : '深色'}
          showChevron
          onClick={() => toggle('appearance')}
        />
        {expanded === 'appearance' && (
          <div className="space-y-4 bg-gray-50/60 px-4 py-4 dark:bg-zinc-950/40">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-gray-500 dark:text-zinc-400">主题</div>
              <div className="flex gap-2">
                {(['light', 'dark'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={cn(
                      'rounded-lg px-4 py-1.5 text-sm transition',
                      theme === t
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300',
                    )}
                  >
                    {t === 'light' ? '浅色' : '深色'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-gray-500 dark:text-zinc-400">强调色</div>
              <div className="flex flex-wrap gap-3">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setAccent(p.key as Accent)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs transition',
                      accent === p.key
                        ? 'bg-primary/15 text-foreground ring-1 ring-primary'
                        : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300',
                    )}
                  >
                    <span
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: `hsl(${ACCENT_HSL[p.key]})` }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-gray-500 dark:text-zinc-400">数字字体</div>
              <div className="grid grid-cols-2 gap-2">
                {NUM_FONT_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setNumFont(p.key as NumFont)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border p-3 transition',
                      numFont === p.key
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
                    )}
                  >
                    <span className="text-xl leading-none" style={{ fontFamily: p.fontFamily }}>
                      0123456789
                    </span>
                    <span className="text-xs text-foreground">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <IOSSettingItem
          icon={<Heart className="h-4 w-4" />}
          iconBg="bg-pink-400"
          title="我们的档案"
          subtitle="两个人的昵称与头像，备忘录归属徽章会用它们"
          showChevron
          onClick={() => toggle('profiles')}
        />
        {expanded === 'profiles' && (
          <div className="bg-gray-50/60 px-3 py-3 dark:bg-zinc-950/40">
            <ProfilesSection />
          </div>
        )}

        <IOSSettingItem
          icon={<SlidersHorizontal className="h-4 w-4" />}
          iconBg="bg-gray-400"
          title="模型参数"
          subtitle="温度，对所有站子生效"
          showChevron
          onClick={() => toggle('model')}
        />
        {expanded === 'model' && (
          <div className="space-y-3 bg-gray-50/60 px-4 py-4 dark:bg-zinc-950/40">
            <div>
              <label className="mb-1 block text-[13px] text-gray-500 dark:text-zinc-400">温度（0–2）</label>
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
              <label className="mb-1 block text-[13px] text-gray-500 dark:text-zinc-400">识图模型（可选）</label>
              <div className="flex gap-2">
                <select
                  value={form.visionStationId}
                  onChange={(e) => setForm((f) => ({ ...f, visionStationId: e.target.value, visionModel: '' }))}
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
          </div>
        )}

        <IOSSettingItem
          icon={<Database className="h-4 w-4" />}
          iconBg="bg-slate-400"
          title="API 站子"
          subtitle="可添加多个站子，各自配 Base URL、Key 与模型"
          showChevron
          onClick={() => toggle('stations')}
        />
        {expanded === 'stations' && (
          <div className="space-y-3 bg-gray-50/60 px-4 py-4 dark:bg-zinc-950/40">
            {stations.map((s) => (
              <div key={s.id} className="rounded-xl border bg-white p-3 dark:bg-zinc-900">
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
                      <span key={m} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-foreground/70">
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
              <div className="space-y-2 rounded-xl border border-primary/40 bg-white p-3 dark:bg-zinc-900">
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
          </div>
        )}

        <IOSSettingItem
          icon={<Smile className="h-4 w-4" />}
          iconBg="bg-yellow-400"
          title="表情包"
          subtitle="聊天里常用的表情"
          showChevron
          onClick={() => toggle('stickers')}
        />
        {expanded === 'stickers' && (
          <div className="bg-gray-50/60 px-3 py-3 dark:bg-zinc-950/40">
            <StickerSettings />
          </div>
        )}

        <IOSSettingItem
          icon={<Globe className="h-4 w-4" />}
          iconBg="bg-blue-400"
          title="云同步"
          subtitle="本地 ↔ VPS 双向同步"
          showChevron
          onClick={() => toggle('sync')}
        />
        {expanded === 'sync' && (
          <div className="bg-gray-50/60 px-3 py-3 dark:bg-zinc-950/40">
            <SyncPanel />
          </div>
        )}
      </IOSSettingGroup>

      <div className="h-5" />

      {/* 关于 */}
      <IOSSettingGroup title="关于">
        <IOSSettingItem
          icon={<Info className="h-4 w-4" />}
          iconBg="bg-gray-400"
          title="版本"
          value="1.0.0"
        />
        <IOSSettingItem
          icon={<Heart className="h-4 w-4" />}
          iconBg="bg-pink-400"
          title="关于小蓝莓"
          subtitle="网易云风格的情侣专属陪伴应用 🫐"
        />
      </IOSSettingGroup>
    </div>
  );
}

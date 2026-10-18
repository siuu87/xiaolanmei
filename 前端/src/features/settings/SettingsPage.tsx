import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Brain,
  Calendar,
  Check,
  Database,
  FileText,
  Globe,
  HardDrive,
  Heart,
  KeyRound,
  Loader2,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { useAppStore } from '@/stores/appStore';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { useStationStore } from '@/stores/stationStore';
import { fetchStationModels } from '@/lib/api/stations';
import type { Station } from '@/lib/api/stations';
import { MemoryPanel } from '@/features/memory/MemoryPage';
import { SyncPanel } from '@/features/sync/SyncPage';
import { DataCorePage } from '@/features/tavern/phone/datacore/DataCorePage';
import { AppearanceSection } from './AppearanceSection';
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
import { useLocalSwitch } from '@/lib/useLocalSwitch';

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

/** localStorage 布尔开关（纯前端偏好）—— 实现抽到 `lib/useLocalSwitch.ts`，多处共用同一份数据 */

/**
 * 数据中枢那套 UI 是给小手机写的，配色走 `--bb-*`（themeCore 里全局接管了
 * `.bg-[#F2F2F7]` / `.bg-white` 这些类）。小手机选的是深色主题时，
 * 在设置页里就会变成一块「深色孤岛」——所以这里按**当前 App 主题**把
 * `--bb-*` 重新钉一遍，让它跟着设置页深浅走。
 */
const BB_LIGHT = {
  '--bb-bg': '#F2F2F7',
  '--bb-card': '#FFFFFF',
  '--bb-text': '#1C1C1E',
  '--bb-muted': '#8E8E93',
  '--bb-border': 'rgba(0,0,0,0.06)',
  '--bb-bar': '#F9F9F9',
  '--bb-bubble-in': '#E9E9EB',
} as CSSProperties;

const BB_DARK = {
  '--bb-bg': '#171A21',
  '--bb-card': '#22252E',
  '--bb-text': '#E8E9EC',
  '--bb-muted': '#8B8F9A',
  '--bb-border': 'rgba(255,255,255,0.08)',
  '--bb-bar': '#1B1E25',
  '--bb-bubble-in': '#2C303A',
} as CSSProperties;
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/** 行内错误提示：保存失败时必须在界面上说一句，不能只写 console */
function InlineError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-destructive" role="alert">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

/**
 * 设置页（iOS 风格）：把原设置页的各区块收进 iOS 分组，点击条目内联展开，业务逻辑不变。
 *
 * 分区顺序（2026-10-18 按“个人 → AI → 外观 → 提醒与健康 → 数据与同步”重排）：
 * 最常用的资料/AI 配置在前，外观居中，提醒与数据在最后 —— 之前 API 站点被埋在
 * 「通用」最底下，找起来要先滚过整个页面。
 */
export function SettingsPage() {
  const navigate = useNavigate();

  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const signature = useProfileStore((s) => s.signature);
  const theme = useAppStore((s) => s.theme);

  const stations = useStationStore((s) => s.stations);
  const stationLoad = useStationStore((s) => s.load);
  const addStation = useStationStore((s) => s.addStation);
  const updateStation = useStationStore((s) => s.updateStation);
  const removeStation = useStationStore((s) => s.removeStation);

  const periodRecords = usePeriodStore((s) => s.records);
  const periodSettings = usePeriodStore((s) => s.settings);

  /**
   * 展开的分区。初值读 `?open=<key>`：聊天页表情包面板的齿轮跳过来会带上
   * `?open=stickers`，这样落地就是展开好的那一栏，不用再自己找。
   */
  const [expanded, setExpanded] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('open'),
  );
  const toggle = (key: string) => setExpanded((e) => (e === key ? null : key));

  /** 资料卡点一下要滚到「我们的档案」——不然展开了也看不见 */
  const profilesAnchorRef = useRef<HTMLDivElement | null>(null);

  const [memos, setMemos] = useState<MemoDTO[]>([]);
  const [memoNotify, setMemoNotify] = useLocalSwitch('blueberry.memoNotify', false);
  const [bedReminder, setBedReminder] = useLocalSwitch('blueberry.bedReminder', false);

  const [form, setForm] = useState<ModelFormState>({ temperature: '0.7', visionStationId: '', visionModel: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [sf, setSf] = useState<StationFormState>({ name: '', baseUrl: '', apiKey: '', models: '' });
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsMsg, setFetchModelsMsg] = useState('');
  const [stationErr, setStationErr] = useState<string | null>(null);
  /** 删除站子要二次确认：这里存着 API Key，旁边就是编辑按钮，误触代价太大 */
  const [confirmDel, setConfirmDel] = useState<Station | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setForm({
          temperature: String(s.temperature),
          visionStationId: s.visionStationId ?? '',
          visionModel: s.visionModel ?? '',
        });
      })
      .catch((e) => {
        console.error(e);
        setSaveErr('读取模型参数失败，可以先手动填，保存时会再试一次');
      });
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
    setSaveErr(null);
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
      setSaveErr((e as Error).message || '保存失败，请检查网络后重试');
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    setEditing({});
    setSf({ name: '', baseUrl: '', apiKey: '', models: '' });
    setFetchModelsMsg('');
    setStationErr(null);
  };
  const openEdit = (s: Station) => {
    setEditing({ id: s.id });
    setSf({ name: s.name, baseUrl: s.baseUrl, apiKey: '', models: s.models.join(', ') });
    setFetchModelsMsg('');
    setStationErr(null);
  };
  const closeEditor = () => {
    setEditing(null);
    setFetchModelsMsg('');
    setStationErr(null);
  };
  const setS = <K extends keyof StationFormState>(key: K, value: string) =>
    setSf((f) => ({ ...f, [key]: value }));

  /** 自动拉取：打站子自己的 /models，拉到的合并进表单（已有在前，新的去重追加），点保存才落库 */
  const pullModels = async () => {
    const baseUrl = sf.baseUrl.trim();
    if (!baseUrl) {
      setFetchModelsMsg('先填 Base URL');
      return;
    }
    setFetchingModels(true);
    setFetchModelsMsg('');
    try {
      const { models } = await fetchStationModels({
        id: editing?.id,
        baseUrl,
        apiKey: sf.apiKey.trim() || undefined, // 编辑已存站子时留空 → 后端用库里的 Key
      });
      const cur = sf.models
        .split(/[,，\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
      const added = models.filter((m) => !cur.includes(m));
      setS('models', [...cur, ...added].join(', '));
      setFetchModelsMsg(`拉到 ${models.length} 个${added.length ? `，新增 ${added.length} 个` : '，没有新模型'}`);
    } catch (e) {
      setFetchModelsMsg((e as Error).message);
    } finally {
      setFetchingModels(false);
    }
  };

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
    setStationErr(null);
    try {
      if (editing?.id) await updateStation(editing.id, payload);
      else await addStation(payload);
      closeEditor();
    } catch (e) {
      console.error(e);
      setStationErr((e as Error).message || '保存站子失败，请检查 Base URL 与网络');
    }
  };

  /** 星标/启停/删除都走这里：出错要能看见，不能静默 */
  const runStationAction = async (fn: () => Promise<unknown>, fallback: string) => {
    setStationErr(null);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setStationErr((e as Error).message || fallback);
    }
  };

  const doRemoveStation = async (s: Station) => {
    setConfirmDel(null);
    await runStationAction(() => removeStation(s.id), `删除「${s.name}」失败，请重试`);
  };

  // ---- 经期派生 ----
  const lastStart = periodRecords.length ? periodRecords[periodRecords.length - 1].days[0] : null;
  const daysAgo = lastStart ? diffDays(lastStart, todayISODate()) : null;
  const next = predictNextStart(periodRecords, periodSettings);
  const periodCare = careMessage({ records: periodRecords, settings: periodSettings });

  const recent = memos.slice(0, 3);
  const notifyCount = memos.filter((m) => m.needNotify).length;

  return (
    <div className="min-h-full bg-page-bg pb-12">
      {/* 标题栏 */}
      <div className="sticky top-0 z-10 bg-page-bg/90 backdrop-blur">
        <div className="relative flex items-center px-4 pt-6 pb-2">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="返回"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-foreground/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 text-center text-[17px] font-semibold text-foreground">
            设置
          </div>
        </div>
      </div>

      {/* 个人资料：点整张卡 = 展开「我们的档案」并滚过去 */}
      <IOSProfileCard
        avatar={avatar}
        name={name}
        status={signature || '在线 · 刚刚活跃'}
        expanded={expanded === 'profiles'}
        onClick={() => {
          setExpanded('profiles');
          profilesAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      <div className="h-5" />

      {/* ============ 1. 个人 ============ */}
      <div ref={profilesAnchorRef}>
        <IOSSettingGroup title="个人">
          <IOSSettingItem
            icon={<Heart className="h-4 w-4" />}
            iconBg="bg-pink-400"
            title="我们的档案"
            subtitle="两个人的昵称与头像，备忘录归属徽章会用它们"
            showChevron
            onClick={() => toggle('profiles')}
          />
          {expanded === 'profiles' && (
            <div className="bg-muted/60 px-3 py-3">
              <ProfilesSection />
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
            <div className="bg-muted/60 px-3 py-3">
              <StickerSettings />
            </div>
          )}

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
            <div className="bg-muted/60 px-4 py-3">
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
                        <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                          {m.title}
                        </span>
                        <span className="shrink-0 text-[12px] text-muted-foreground">
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
                <p className="text-[13px] text-muted-foreground">还没有备忘录，聊天时会自动帮你记。</p>
              )}
            </div>
          )}

          {/*
            待提醒：2026-10-18 之前只写 localStorage、全项目没人读（摆设开关）。
            现在真的接上了 —— 开着时备忘录首页顶部会出现「待提醒 N」，点开就是这些条目；
            关掉那条就不再出现。
          */}
          <IOSSettingItem
            icon={<Bell className="h-4 w-4" />}
            iconBg="bg-rose-400"
            title="待提醒"
            subtitle={
              memoNotify
                ? notifyCount
                  ? `备忘录里有 ${notifyCount} 条标了提醒，会在备忘录首页顶部汇总`
                  : '已开启：标了提醒的备忘录会在首页顶部汇总'
                : '关闭时不显示提醒汇总'
            }
            trailing={<IOSSwitch checked={memoNotify} onCheckedChange={setMemoNotify} />}
          />
        </IOSSettingGroup>
      </div>

      <div className="h-5" />

      {/* ============ 2. AI 伴侣 ============ */}
      <IOSSettingGroup title="AI 伴侣">
        <IOSSettingItem
          icon={<MessageCircle className="h-4 w-4" />}
          iconBg="bg-blue-400"
          title="对话风格"
          subtitle="设定小蓝莓的人设、性格与说话风格"
          showChevron
          onClick={() => toggle('prompts')}
        />
        {expanded === 'prompts' && (
          <div className="bg-muted/60 px-3 py-3">
            <PromptsPanel />
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
          <div className="space-y-3 bg-muted/60 px-4 py-4">
            <div>
              <label className="mb-1 block text-[13px] text-muted-foreground">温度（0–2）</label>
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
              <label className="mb-1 block text-[13px] text-muted-foreground">识图模型（可选）</label>
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
            <InlineError text={saveErr} />
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
          value={stations.length ? String(stations.length) : undefined}
          showChevron
          onClick={() => toggle('stations')}
        />
        {expanded === 'stations' && (
          <div className="space-y-3 bg-muted/60 px-4 py-4">
            {stations.map((s) => (
              <div key={s.id} className="rounded-xl border bg-card p-3">
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
                    onClick={() =>
                      void runStationAction(() => updateStation(s.id, { isDefault: true }), '设为默认失败')
                    }
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
                    onClick={() =>
                      void runStationAction(() => updateStation(s.id, { enabled: !s.enabled }), '切换启停失败')
                    }
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
                    onClick={() => setConfirmDel(s)}
                    title="删除"
                    aria-label={`删除站子 ${s.name}`}
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

            <InlineError text={stationErr} />

            {editing ? (
              <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-3">
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
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs text-muted-foreground">模型列表（逗号或换行分隔）</label>
                    <button
                      type="button"
                      onClick={() => void pullModels()}
                      disabled={fetchingModels}
                      title="从站子接口自动拉取模型列表（GET {Base URL}/models）"
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-primary transition hover:bg-primary/10 disabled:opacity-50"
                    >
                      {fetchingModels ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      自动拉取
                    </button>
                  </div>
                  <textarea
                    value={sf.models}
                    onChange={(e) => setS('models', e.target.value)}
                    placeholder={'deepseek-chat, deepseek-reasoner'}
                    rows={2}
                    className={cn(inputCls, 'resize-none')}
                  />
                  {fetchModelsMsg && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{fetchModelsMsg}</p>
                  )}
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
          icon={<Sparkles className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="技能管理"
          subtitle="内置技能 + 你新增的技能，聊天时按条件触发"
          showChevron
          onClick={() => toggle('skills')}
        />
        {expanded === 'skills' && (
          <div className="bg-muted/60 px-3 py-3">
            <SkillsPanel />
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
          <div className="bg-muted/60 px-3 py-3">
            <MemoryPanel />
          </div>
        )}
      </IOSSettingGroup>

      <div className="h-5" />

      {/*
        3. 外观：从中枢里搬出来独立成组。
        去掉了壁纸、作用域这些只有小手机才用得到的项，剩下的每项点开都是弹窗或展开。
      */}
      <AppearanceSection />

      <div className="h-5" />

      {/* ============ 4. 提醒与健康 ============ */}
      <IOSSettingGroup title="提醒与健康">
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
          <div className="bg-muted/60 px-4 py-3">
            {next && (
              <p className="text-[13px] text-muted-foreground">
                预测下次经期：{next}
              </p>
            )}
            <p className="mt-2 text-[12px] text-muted-foreground">
              在「首页 → 日历」里点选日期即可标记经期。
            </p>
          </div>
        )}

        {/*
          睡前提醒：2026-10-18 之前同样是摆设（只写 localStorage）。
          现在由 `BedtimeNudge` 读取：22:00–02:59 之间在应用里弹一次夜间提醒，
          点「去晚安页」直接跳 /goodnight，关掉当天不再出现。
        */}
        <IOSSettingItem
          icon={<Moon className="h-4 w-4" />}
          iconBg="bg-indigo-400"
          title="睡前提醒"
          subtitle={bedReminder ? '22:00 后会在应用里提醒你一次，可直达晚安页' : '关闭中'}
          trailing={<IOSSwitch checked={bedReminder} onCheckedChange={setBedReminder} />}
        />
      </IOSSettingGroup>

      <div className="h-5" />

      {/* ============ 5. 数据与同步 ============ */}
      <IOSSettingGroup title="数据与同步">
        {/*
          数据中枢：以前是常驻的 600px 内嵌滚动框（手机整页下滑时手指会被它吃掉）。
          现在跟其他项一样点开才展开，`inline` 模式没有自己的滚动条，跟着整页一起滚。
        */}
        <IOSSettingItem
          icon={<HardDrive className="h-4 w-4" />}
          iconBg="bg-indigo-400"
          title="数据中枢"
          subtitle="存储占用、主角可见上下文、记忆区、快照备份"
          showChevron
          onClick={() => toggle('datacore')}
        />
        {expanded === 'datacore' && (
          <div className="bg-muted/60 px-3 py-3" style={theme === 'dark' ? BB_DARK : BB_LIGHT}>
            <DataCorePage inline panels={['storage', 'bridge', 'memory', 'backup']} />
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
          <div className="bg-muted/60 px-3 py-3">
            <SyncPanel />
          </div>
        )}
      </IOSSettingGroup>

      {/* 删除站子确认：站子里存着 API Key，一步就删太容易误触 */}
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除「{confirmDel?.name}」？</DialogTitle>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              站子里存的 Base URL 与 API Key 会一起删掉，删了得重新填。其他站子不受影响。
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void (confirmDel && doRemoveStation(confirmDel))}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

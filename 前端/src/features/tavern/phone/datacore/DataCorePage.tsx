/**
 * 数据中枢 · 设置面板
 *
 * 四块：数据看板 / 主角可见 / 备份迁移 / 外观美化。
 *
 * 这里的配色刻意沿用 `bg-white`、`text-[#8e8e93]`、`bg-[#F2F2F2]` 这类已被
 * 主题引擎接管的 Tailwind 原子类——所以这一页本身也会跟着主题一起换色，
 * 不需要再单独接一遍变量。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Palette,
  ShieldCheck,
  HardDrive,
  ChevronRight,
  Trash2,
  Plus,
  X,
  Check,
  RotateCcw,
  Download,
  Upload,
  AlertTriangle,
  Brain,
  Scissors,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhoneStore } from '../phoneStore';
import { PhoneNavBar } from '../PhoneShell';
import { BUCKET_META } from './registry';
import {
  scanUsage,
  humanSize,
  clearBucket,
  bucketHasData,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  downloadBackup,
  importAll,
  type UsageReport,
  type ImportMode,
} from './storageCore';
import {
  buildSupportContext,
  loadBridge,
  saveBridge,
  previewBlocks,
  SOURCE_META,
  SOURCE_GROUPS,
  DEFAULT_BRIDGE,
  type BridgeConfig,
  type SourceId,
} from './contextBridge';
import {
  useThemeEngine,
  addFont,
  fontFileToDataUrl,
  imageToDataUrl,
  type ThemeScope,
} from './themeCore';
import {
  loadWindowCfg,
  saveWindowCfg,
  composeContext,
  archiveShorts,
  editShort,
  removeShort,
  renameVolume,
  removeVolume,
  listSessionMemory,
} from './windowEngine';

type Panel = 'storage' | 'bridge' | 'memory' | 'backup' | 'theme';

const PANELS: { key: Panel; label: string; icon: typeof Database }[] = [
  { key: 'storage', label: '数据', icon: HardDrive },
  { key: 'bridge', label: '主角可见', icon: ShieldCheck },
  { key: 'memory', label: '记忆', icon: Brain },
  { key: 'backup', label: '备份', icon: Database },
  { key: 'theme', label: '外观', icon: Palette },
];

/* ------------------------------ 基础零件 ------------------------------ */

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <p className="mb-1 px-4 text-[11px] uppercase tracking-wide text-[#8e8e93]">{title}</p>
      <div className="overflow-hidden rounded-[10px] bg-white">{children}</div>
      {hint && <p className="mt-1 px-4 text-[11px] leading-relaxed text-[#8e8e93]">{hint}</p>}
    </section>
  );
}

function Divider() {
  return <div className="ml-4 h-[1px] bg-black/[0.06]" />;
}

/**
 * 一行列表项。
 *
 * 注意 `actions` 与 `right` 的区别：
 * - `right`：纯展示内容（开关、箭头、数字），可以安全地待在主按钮里。
 * - `actions`：**本身可点击的元素**（删除、编辑按钮），必须渲染在主按钮**外面**。
 *   否则就成了 <button> 套 <button>，React 会报 validateDOMNesting，
 *   而且内层的点击在部分浏览器上根本不触发。
 */
function Row({
  label,
  sub,
  right,
  actions,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const interactive = !!onClick && !disabled;
  return (
    <div className={cn('flex items-center transition', interactive && 'active:bg-black/[0.04]', disabled && 'opacity-40')}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px]', danger ? 'text-[#FF3B30]' : 'text-black')}>{label}</span>
          {sub && <span className="mt-0.5 block text-[11px] leading-snug text-[#8e8e93]">{sub}</span>}
        </span>
        {!actions && (right ?? <ChevronRight className="h-4 w-4 shrink-0 text-[#C7C7CC]" />)}
      </button>
      {actions && <div className="flex shrink-0 items-center gap-2 pr-4">{actions}{right}</div>}
    </div>
  );
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      aria-label={label}
      className={cn(
        'relative block h-[31px] w-[51px] shrink-0 rounded-full transition-colors',
        on ? 'bg-[#34C759]' : 'bg-[#E9E9EB]',
      )}
    >
      <motion.span
        className="absolute left-[2px] top-[2px] block h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,.2)]"
        animate={{ x: on ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </span>
  );
}

function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[14px] text-black">{label}</span>
        <span className="text-[13px] tabular-nums text-[#8e8e93]">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-[6px] w-full cursor-pointer appearance-none rounded-full bg-[#E9E9EB] accent-[#007AFF]"
      />
    </div>
  );
}

/** iOS 风格二次确认：危险操作必须过这一道 */
function ConfirmSheet({
  title,
  body,
  confirmText,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmText: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      className="absolute inset-0 z-50 flex flex-col bg-white"
      data-testid="confirm-page"
    >
      <PhoneNavBar title={title} onBack={onCancel} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#3C3C43]">{body}</p>
      </div>
      <div className="shrink-0 space-y-2 border-t border-black/[0.07] px-4 py-3">
        <button
          type="button"
          onClick={onConfirm}
          aria-label={confirmText}
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-white transition active:scale-[0.99]',
            danger ? 'bg-[#FF3B30]' : 'bg-[#007AFF]',
          )}
        >
          {confirmText}
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="取消"
          className="flex h-11 w-full items-center justify-center rounded-xl bg-[#E9E9EB] text-[15px] font-medium text-[#3C3C43] transition active:scale-[0.99]"
        >
          取消
        </button>
      </div>
    </motion.div>
  );
}

function Toast({ text, tone }: { text: string; tone: 'ok' | 'err' }) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      className={cn(
        'pointer-events-none absolute left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full px-3.5 py-2 text-[12px] text-white shadow-lg',
        tone === 'ok' ? 'bg-[#34C759]' : 'bg-[#FF3B30]',
      )}
    >
      {text}
    </motion.div>
  );
}

/* ------------------------------ 主面板 ------------------------------ */

/**
 * 数据中枢
 *
 * `panels` 用来裁剪显示哪些分块。「我」页里只放数据/主角可见/记忆/备份——
 * 外观已经搬到「我 → 外观」自己的分区了，不在这里重复一遍。
 *
 * `inline` 给设置页用：**去掉 `h-full` 与内嵌滚动条**，内容跟着整页一起滚。
 * 之前设置页把它塞进一个固定 `h-[600px]` 的盒子里，手机上想往下滑整页时
 * 手指一进这块就被里面那层滚动容器吃掉——改成点开内联展开就没有这个夹层了。
 */
export function DataCorePage({ panels, inline }: { panels?: Panel[]; inline?: boolean } = {}) {
  const shown = panels && panels.length ? PANELS.filter((p) => panels.includes(p.key)) : PANELS;
  const [panel, setPanel] = useState<Panel>(shown[0]?.key ?? 'storage');
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const flash = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <div
      className={cn(
        'relative flex flex-col bg-[#F2F2F7]',
        inline ? 'rounded-xl' : 'h-full min-h-0',
      )}
      data-inline={inline ? '1' : undefined}
    >
      {/* 顶栏：内联展开时外层设置项已经有标题了，不再重复一行 */}
      {!inline && (
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <p className="text-[17px] font-semibold text-black">数据中枢</p>
        </div>
      )}

      {/* 分段切换 */}
      <div className={cn('shrink-0 px-4 pb-3', inline && 'pt-3')}>
        <div className="flex rounded-[9px] bg-white p-0.5">
          {shown.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPanel(p.key)}
              aria-label={p.label}
              aria-pressed={panel === p.key}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-[7px] py-1.5 text-[11px] transition',
                panel === p.key ? 'bg-[#007AFF] font-medium text-white' : 'text-[#8e8e93]',
              )}
            >
              <p.icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'px-4 pb-4',
          // 内联模式：**不设 overflow**，让内容自然撑开，跟着设置页一起滚
          inline ? 'min-h-0' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6',
        )}
      >
        <AnimatePresence>
          {toast && <Toast key={toast.text + Date.now()} {...toast} />}
        </AnimatePresence>
        {panel === 'storage' && <StoragePanel flash={flash} />}
        {panel === 'bridge' && <BridgePanel />}
        {panel === 'memory' && <MemoryPanel flash={flash} />}
        {panel === 'backup' && <BackupPanel flash={flash} />}
        {panel === 'theme' && <ThemePanel flash={flash} />}
      </div>
    </div>
  );
}

/* ------------------------------ 数据看板 ------------------------------ */

function StoragePanel({ flash }: { flash: (t: string, tone?: 'ok' | 'err') => void }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [pending, setPending] = useState<{ key: Parameters<typeof clearBucket>[0]; label: string } | null>(null);

  const refresh = useCallback(() => setReport(scanUsage()), []);
  useEffect(() => refresh(), [refresh]);

  const pct = report ? Math.min(100, (report.total / report.quotaHint) * 100) : 0;

  return (
    <>
      <Group title="占用总览" hint="配额按 5MB 估算，浏览器实际上限各家不同；接近上限时应先做清理或导出备份。">
        <div className="px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[22px] font-semibold tabular-nums text-black">{humanSize(report?.total ?? 0)}</span>
            <span className="text-[12px] text-[#8e8e93]">
              / {humanSize(report?.quotaHint ?? 5 * 1024 * 1024)} · {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-[8px] overflow-hidden rounded-full bg-[#E9E9EB]">
            <motion.div
              className={cn('h-full rounded-full', pct > 80 ? 'bg-[#FF3B30]' : pct > 60 ? 'bg-[#FF9500]' : 'bg-[#34C759]')}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, pct)}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 18 }}
            />
          </div>
        </div>
      </Group>

      <Group title="按模块">
        {BUCKET_META.map((b, i) => {
          const usage = report?.buckets.find((x) => x.bucket === b.key);
          const has = bucketHasData(b.key);
          return (
            <div key={b.key}>
              {i > 0 && <Divider />}
              <Row
                label={b.label}
                sub={b.desc}
                disabled={!has}
                danger={false}
                onClick={has ? () => setPending({ key: b.key, label: b.label }) : undefined}
                right={
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-[13px] tabular-nums text-[#8e8e93]">{humanSize(usage?.bytes ?? 0)}</span>
                    <Trash2 className="h-3.5 w-3.5 text-[#C7C7CC]" />
                  </span>
                }
              />
            </div>
          );
        })}
      </Group>

      <Group title="明细">
        {report && report.keys.length > 0 ? (
          report.keys.slice(0, 14).map((k, i) => (
            <div key={`${k.key}-${k.label}`}>
              {i > 0 && <Divider />}
              <Row label={k.label} sub={humanSize(k.bytes)} right={null} />
            </div>
          ))
        ) : (
          <Row label="暂无数据" sub="先在别处产生一些记录吧" right={null} />
        )}
      </Group>

      <AnimatePresence>
        {pending && (
          <ConfirmSheet
            title={`清空「${pending.label}」？`}
            body="该模块的数据会被永久删除，且不可从回收站恢复。如果只是想留后路，建议先去「备份」做一份快照。"
            confirmText="确认清空"
            danger
            onCancel={() => setPending(null)}
            onConfirm={() => {
              const r = clearBucket(pending.key);
              refresh();
              setPending(null);
              flash(r.freedBytes > 0 ? `已释放 ${humanSize(r.freedBytes)}` : '该模块已无数据');
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------ 主角可见 ------------------------------ */

function BridgePanel() {
  const [cfg, setCfg] = useState<BridgeConfig>(() => loadBridge());
  useEffect(() => saveBridge(cfg), [cfg]);

  const preview = useMemo(() => previewBlocks(cfg), [cfg]);
  const built = useMemo(() => buildSupportContext(cfg), [cfg]);

  const toggleSource = (id: SourceId) =>
    setCfg((c) => ({ ...c, sources: { ...c.sources, [id]: { ...c.sources[id], on: !c.sources[id].on } } }));

  return (
    <>
      <Group
        title="总开关"
        hint="打开后，聊天发起时会把下面勾选的记录整理成一段上下文交给模型。关掉则完全不注入，模型只看到当前会话。"
      >
        <Row
          label="让主角看到这些记录"
          sub={cfg.enabled ? '已启用' : '已停用'}
          onClick={() => setCfg((c) => ({ ...c, enabled: !c.enabled }))}
          right={<Toggle on={cfg.enabled} label="总开关" />}
        />
      </Group>

      {SOURCE_GROUPS.map((g) => (
        <Group key={g.title} title={`记录来源 · ${g.title}`} hint={g.hint}>
          {g.ids.map((id, i) => {
            const m = SOURCE_META.find((x) => x.id === id)!;
            const sc = cfg.sources[id];
            return (
              <div key={id}>
                {i > 0 && <Divider />}
                <Row
                  label={m.label}
                  sub={m.desc}
                  onClick={() => toggleSource(id)}
                  right={<Toggle on={sc.on} label={`${m.label}开关`} />}
                />
                {sc.on && (
                  <Slider
                    label="取几条"
                    value={sc.limit}
                    min={1}
                    max={20}
                    onChange={(v) => setCfg((c) => ({ ...c, sources: { ...c.sources, [id]: { ...sc, limit: v } } }))}
                    format={(v) => `${v} 条`}
                  />
                )}
              </div>
            );
          })}
        </Group>
      ))}

      <Group title="预算与口径" hint="优先级从高到低：长期记忆 › 聊天 › 书库 › 片单。超出预算时从优先级最低的开始整段丢弃。">
        <Slider
          label="上下文字符上限"
          value={cfg.maxChars}
          min={600}
          max={8000}
          step={200}
          onChange={(v) => setCfg((c) => ({ ...c, maxChars: v }))}
          format={(v) => `${v} 字`}
        />
        <Divider />
        <Row
          label="附免责说明"
          sub="告诉模型这些只是背景素材、不是此刻正在发生（建议保持开启）"
          onClick={() => setCfg((c) => ({ ...c, withDisclaimer: !c.withDisclaimer }))}
          right={<Toggle on={cfg.withDisclaimer} label="免责说明" />}
        />
        <Divider />
        <Row label="恢复默认" sub="回到初始配置" onClick={() => setCfg(DEFAULT_BRIDGE)} right={<RotateCcw className="h-4 w-4 text-[#007AFF]" />} />
      </Group>

      <Group
        title={`预览 · 实发 ${built.stats.chars} 字`}
        hint={built.stats.droppedSources.length > 0 ? `已因超预算丢弃：${built.stats.droppedSources.join('、')}` : '这是模型实际会收到的内容'}
      >
        <div className="px-4 py-3">
          {preview.length === 0 ? (
            <p className="text-[13px] text-[#8e8e93]">当前没有可注入的记录。</p>
          ) : (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-[#3C3C43]">
              {built.text || '（空）'}
            </pre>
          )}
        </div>
      </Group>
    </>
  );
}

/* ------------------------------ 记忆区 ------------------------------ */

const MODE_LABEL: Record<'online' | 'offline', string> = { online: '线上', offline: '线下' };

function MemoryPanel({ flash }: { flash: (t: string, tone?: 'ok' | 'err') => void }) {
  const sessions = usePhoneStore((s) => s.sessions);
  const setSessionMode = usePhoneStore((s) => s.setSessionMode);
  const [sessionId, setSessionId] = useState<string>(() => sessions[0]?.id ?? '');
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [cfg, setCfg] = useState(() => loadWindowCfg());
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0] ?? null;
  useEffect(() => {
    if (!sessionId && session) setSessionId(session.id);
  }, [session, sessionId]);

  useEffect(() => saveWindowCfg(cfg), [cfg]);

  const composed = useMemo(
    () =>
      session
        ? composeContext({ sessionId: session.id, messages: session.messages, mode, cfg })
        : null,
    [session, mode, cfg, tick],
  );
  const memory = useMemo(
    () => (session ? listSessionMemory(session.id, mode, cfg.modeSplit) : { shorts: [], volumes: [], splits: [] }),
    [session, mode, cfg.modeSplit, tick],
  );

  const doManualSplit = () => {
    if (!composed || !session) return;
    if (composed.stats.pendingCount === 0) return flash('窗口内还没有可归档的内容', 'err');
    const saved = archiveShorts({
      sessionId: session.id,
      mode,
      pending: composed.stats.pending,
      aiFields: null,
      by: 'manual',
    });
    setTick((t) => t + 1);
    flash(saved ? `已归档 ${composed.stats.pendingCount} 条` : '归档失败', saved ? 'ok' : 'err');
  };

  const patchCfg = (p: Partial<typeof cfg>) => setCfg((c) => ({ ...c, ...p }));

  return (
    <>
      <Group
        title="滑动窗口"
        hint="不再整条会话全塞给模型。最近若干条留原文，溢出部分即时归档成短期记忆，短期攒够归纳成卷——上下文体积恒定，所以永远不用「换窗」。"
      >
        <Row
          label={session ? session.title : '选择会话'}
          sub={session ? `${session.messages.length} 条消息 · ${MODE_LABEL[mode]}模式` : '当前没有会话'}
          onClick={() => {
            if (sessions.length <= 1) return flash('目前只有一个会话', 'err');
            const i = sessions.findIndex((s) => s.id === session?.id);
            setSessionId(sessions[(i + 1) % sessions.length].id);
          }}
          right={<ChevronRight className="h-4 w-4 text-[#007AFF]" />}
        />
        <Divider />
        <div className="flex gap-1 px-4 py-2.5">
          {(['online', 'offline'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); if (session) setSessionMode(session.id, m); }}
              aria-pressed={mode === m}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-[12px] transition',
                mode === m ? 'bg-[#007AFF] text-white' : 'bg-[#E9E9EB] text-[#3C3C43]',
              )}
            >
              {MODE_LABEL[m]}记忆
            </button>
          ))}
        </div>
        <div className="px-4 pb-2.5">
          <p className="text-[11px] leading-relaxed text-[#8e8e93]">
            切换会同时改变当前会话的相处模式，之后的发言记进对应那条线；
            之前积累的记忆留在线上（或线下）那边，不会被带过来。
          </p>
        </div>
      </Group>

      <Group title="窗口参数">
        <Slider label="滚动上下文（原文条数）" value={cfg.turns} min={6} max={120} step={2}
          onChange={(v) => patchCfg({ turns: v })} format={(v) => `${v} 条`} />
        <Divider />
        <Slider label="自动归档阈值" value={cfg.autoTurns} min={0} max={80} step={2}
          onChange={(v) => patchCfg({ autoTurns: v })} format={(v) => (v === 0 ? '关闭' : `满 ${v} 条`)} />
        <Divider />
        <Slider label="间隔多久算换话题" value={cfg.autoGapMin} min={0} max={1440} step={30}
          onChange={(v) => patchCfg({ autoGapMin: v })}
          format={(v) => (v === 0 ? '关闭' : v < 60 ? `${v} 分钟` : `${(v / 60).toFixed(1)} 小时`)} />
        <Divider />
        <Slider label="几条短期归纳成一卷" value={cfg.condenseEvery} min={0} max={20} step={1}
          onChange={(v) => patchCfg({ condenseEvery: v })} format={(v) => (v === 0 ? '不归纳' : `${v} 条`)} />
        <Divider />
        <Slider label="上下文保留几卷" value={cfg.keepVolumes} min={0} max={10}
          onChange={(v) => patchCfg({ keepVolumes: v })} format={(v) => `${v} 卷`} />
        <Divider />
        <Slider label="上下文保留几条短期" value={cfg.keepShorts} min={0} max={20}
          onChange={(v) => patchCfg({ keepShorts: v })} format={(v) => `${v} 条`} />
        <Divider />
        <Row label="线上/线下记忆隔离" sub="同一角色的两种相处轨迹互不污染"
          onClick={() => patchCfg({ modeSplit: !cfg.modeSplit })} right={<Toggle on={cfg.modeSplit} label="隔离" />} />
        <Divider />
        <Row label="用模型改写摘要" sub="关闭则只用本地抽取式摘要（离线可用、不花钱）"
          onClick={() => patchCfg({ useAi: !cfg.useAi })} right={<Toggle on={cfg.useAi} label="AI摘要" />} />
      </Group>

      <Group title="当前状态" hint="「待归档」是已经滚出窗口、但还没变成摘要的条数。它涨到阈值就会自动归档；不想等就点手动切。">
        <Row label="会话消息总数" sub="本地全量保存，一条都不会丢"
          right={<span className="text-[13px] tabular-nums text-[#8e8e93]">{composed?.stats.totalMsgs ?? 0}</span>} />
        <Divider />
        <Row label="滚动上下文（实际发送）" sub="原文直送，一字不动"
          right={<span className="text-[13px] tabular-nums text-[#8e8e93]">{composed?.stats.keptTurns ?? 0} 条</span>} />
        <Divider />
        <Row label="待归档" sub="溢出窗口但还没摘要"
          right={<span className={cn('text-[13px] tabular-nums', (composed?.stats.pendingCount ?? 0) > 0 ? 'text-[#FF9500]' : 'text-[#8e8e93]')}>{composed?.stats.pendingCount ?? 0} 条</span>} />
        <Divider />
        <Row label="本次请求体积" sub="摘要 + 原文，恒定可控"
          right={<span className="text-[13px] tabular-nums text-[#8e8e93]">{composed?.stats.chars ?? 0} 字</span>} />
        <Divider />
        <Row label="手动切一刀" sub="把当前待归档的部分立刻归档"
          onClick={doManualSplit} right={<Scissors className="h-4 w-4 text-[#007AFF]" />} />
      </Group>

      <Group title={`长期记忆（${memory.volumes.length} 卷）`} hint="由多条短期归纳而来，卷名自动生成，也可以手改。">
        {memory.volumes.length === 0 ? (
          <Row label="还没有成卷" sub={`短期记忆攒到 ${cfg.condenseEvery} 条会自动归纳`} right={null} />
        ) : (
          memory.volumes.map((v, i) => (
            <div key={v.id}>
              {i > 0 && <Divider />}
              <Row
                label={v.name}
                sub={`${v.shortIds.length} 个片段 · ${new Date(v.createdAt).toLocaleDateString('zh-CN')}`}
                onClick={() => {
                  const name = window.prompt('给这一卷起个名字', v.name);
                  if (name !== null) { renameVolume(v.id, name); setTick((t) => t + 1); flash('已重命名'); }
                }}
                right={<Pencil className="h-4 w-4 text-[#007AFF]" />}
                actions={
                  <button type="button" aria-label="删除这一卷"
                    onClick={() => { removeVolume(v.id); setTick((t) => t + 1); flash('已删除'); }}>
                    <Trash2 className="h-4 w-4 text-[#FF3B30]" />
                  </button>
                }
              />
              <div className="px-4 pb-2.5">
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#8e8e93]">{v.summary}</p>
              </div>
            </div>
          ))
        )}
      </Group>

      <Group title={`短期记忆（${memory.shorts.length} 条）`} hint="点开可以直接改四个字段；改完立即写回，下次请求就用新版本。">
        {memory.shorts.length === 0 ? (
          <Row label="还没有短期记忆" sub="继续聊天，或点上方「手动切一刀」" right={null} />
        ) : (
          memory.shorts.map((s, i) => (
            <div key={s.id}>
              {i > 0 && <Divider />}
              <Row
                label={`${s.msgCount} 条 · ${s.source === 'heuristic' ? '本地摘要' : s.source === 'manual' ? '手动归档' : 'AI 摘要'}`}
                sub={new Date(s.fromTs).toLocaleString('zh-CN')}
                onClick={() => setEditing(editing === s.id ? null : s.id)}
                right={
                  <ChevronRight
                    className={cn('h-4 w-4 text-[#C7C7CC] transition-transform', editing === s.id && 'rotate-90')}
                  />
                }
                actions={
                  <button type="button" aria-label="删除这条记忆"
                    onClick={() => { removeShort(s.id); setTick((t) => t + 1); flash('已删除'); }}>
                    <Trash2 className="h-4 w-4 text-[#FF3B30]" />
                  </button>
                }
              />
              {editing === s.id ? (
                <ShortEditor chip={s} onDone={() => setTick((t) => t + 1)} />
              ) : (
                <div className="px-4 pb-2.5">
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#8e8e93]">
                    起因 {s.cause}
                    {'\n'}经过 {s.process}
                    {'\n'}结果 {s.result}
                    {'\n'}关系 {s.relation}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </Group>
    </>
  );
}

/** 短期记忆四字段编辑器 */
function ShortEditor({ chip, onDone }: { chip: ReturnType<typeof listSessionMemory>['shorts'][number]; onDone: () => void }) {
  const [v, setV] = useState({ cause: chip.cause, process: chip.process, result: chip.result, relation: chip.relation });
  const fields: { k: keyof typeof v; label: string }[] = [
    { k: 'cause', label: '起因' },
    { k: 'process', label: '经过' },
    { k: 'result', label: '结果' },
    { k: 'relation', label: '关系进展' },
  ];
  return (
    <div className="border-t border-black/[0.06] px-4 py-3">
      {fields.map((f) => (
        <div key={f.k} className="mb-2">
          <label className="mb-1 block text-[11px] text-[#8e8e93]">{f.label}</label>
          <textarea
            value={v[f.k]}
            onChange={(e) => setV((x) => ({ ...x, [f.k]: e.target.value }))}
            rows={2}
            aria-label={f.label}
            className="w-full resize-none rounded-lg bg-[#E9E9EB] px-2.5 py-1.5 text-[12px] text-black outline-none"
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" aria-label="保存记忆修改"
          onClick={() => { editShort(chip.id, v); onDone(); }}
          className="flex-1 rounded-xl bg-[#007AFF] py-2 text-[13px] font-medium text-white active:opacity-80">保存</button>
        <button type="button" aria-label="放弃修改" onClick={onDone}
          className="rounded-xl bg-[#E9E9EB] px-4 py-2 text-[13px] text-[#8e8e93] active:opacity-70">收起</button>
      </div>
    </div>
  );
}

/* ------------------------------ 备份迁移 ------------------------------ */

function BackupPanel({ flash }: { flash: (t: string, tone?: 'ok' | 'err') => void }) {
  const [snaps, setSnaps] = useState(() => listSnapshots());
  const [pending, setPending] = useState<{ kind: 'restore'; id: string; label: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setSnaps(listSnapshots()), []);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImportText(await f.text());
      flash('已读取文件，确认下方选项后点导入');
    } catch {
      flash('文件读取失败', 'err');
    }
  };

  const doImport = () => {
    const r = importAll(importText, importMode);
    if (!r.ok) return flash(r.error ?? '导入失败', 'err');
    setImportText('');
    refresh();
    flash(`已导入 ${r.applied} 项${r.skipped ? `，跳过 ${r.skipped} 项` : ''}`);
  };

  return (
    <>
      <Group title="即时快照" hint="最多留存最近 5 份，超出自动淘汰最旧的。恢复前会自动再存一份「恢复前」快照，可来回退;">
        <Row
          label="创建快照"
          sub="把当前全量数据存一份"
          onClick={() => {
            const s = createSnapshot();
            refresh();
            flash(s ? `已保存：${s.label}` : '暂无数据可备份', s ? 'ok' : 'err');
          }}
          right={<Plus className="h-4 w-4 text-[#007AFF]" />}
        />
        <Divider />
        {snaps.length === 0 ? (
          <Row label="还没有快照" sub="点上方「创建快照」建第一份" right={null} />
        ) : (
          snaps.map((s) => (
            <div key={s.id}>
              <Divider />
              <Row
                label={s.label}
                sub={`${new Date(s.createdAt).toLocaleString('zh-CN')} · ${humanSize(s.bytes)}`}
                onClick={() => setPending({ kind: 'restore', id: s.id, label: s.label })}
                right={<RotateCcw className="h-4 w-4 text-[#007AFF]" />}
              />
            </div>
          ))
        )}
      </Group>

      {snaps.length > 0 && (
        <Group title="删除快照">
          {snaps.map((s, i) => (
            <div key={s.id}>
              {i > 0 && <Divider />}
              <Row
                label={s.label}
                danger
                onClick={() => {
                  deleteSnapshot(s.id);
                  refresh();
                  flash('已删除');
                }}
                right={<Trash2 className="h-4 w-4 text-[#FF3B30]" />}
              />
            </div>
          ))}
        </Group>
      )}

      <Group title="全量导出 / 导入" hint="导出为单个 JSON 文件，可在另一台设备或浏览器恢复。">
        <Row
          label="导出全部数据"
          sub="生成 .json 备份文件"
          onClick={() => {
            downloadBackup();
            flash('已开始下载');
          }}
          right={<Download className="h-4 w-4 text-[#007AFF]" />}
        />
        <Divider />
        <Row
          label="选择备份文件"
          sub="读取本地 .json"
          onClick={() => fileRef.current?.click()}
          right={<Upload className="h-4 w-4 text-[#007AFF]" />}
        />
        {importText && (
          <>
            <Divider />
            <div className="flex gap-1 px-4 py-2.5">
              {(['merge', 'replace'] as ImportMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setImportMode(m)}
                  aria-pressed={importMode === m}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-[12px] transition',
                    importMode === m ? 'bg-[#007AFF] text-white' : 'bg-[#E9E9EB] text-[#3C3C43]',
                  )}
                >
                  {m === 'merge' ? '合并（推荐）' : '整体替换'}
                </button>
              ))}
            </div>
            <div className="px-4 pb-2.5">
              {importMode === 'replace' && (
                <p className="mb-2 flex items-start gap-1 text-[11px] text-[#FF9500]">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  替换模式会清空现有数据再写入，开始前会自动存一份回滚快照。
                </p>
              )}
              <button
                type="button"
                onClick={doImport}
                aria-label="执行导入"
                className="w-full rounded-xl bg-[#007AFF] py-2.5 text-[14px] font-medium text-white active:opacity-80"
              >
                执行导入
              </button>
            </div>
          </>
        )}
      </Group>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <AnimatePresence>
        {pending && (
          <ConfirmSheet
            title={`恢复到「${pending.label}」？`}
            body="当前数据会先自动存成一份「恢复前」快照，之后可以再退回来。"
            confirmText="恢复"
            onCancel={() => setPending(null)}
            onConfirm={() => {
              const r = restoreSnapshot(pending.id);
              refresh();
              setPending(null);
              flash(r.restoredKeys > 0 ? `已恢复 ${r.restoredKeys} 项` : '恢复失败', r.restoredKeys > 0 ? 'ok' : 'err');
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------ 外观 ------------------------------ */

function ThemePanel({ flash }: { flash: (t: string, tone?: 'ok' | 'err') => void }) {
  const { cfg, patch, presets } = useThemeEngine();
  const [cssDraft, setCssDraft] = useState(cfg.customCss);
  const fileFontRef = useRef<HTMLInputElement>(null);
  const wallRef = useRef<HTMLInputElement>(null);
  const [urlComposer, setUrlComposer] = useState({ family: '', href: '' });

  // 外部改动（如恢复快照）同步回编辑框
  useEffect(() => setCssDraft(cfg.customCss), [cfg.customCss]);

  const addFontByUrl = () => {
    const family = urlComposer.family.trim();
    const href = urlComposer.href.trim();
    if (!family || !href) return flash('字体名和链接都要填', 'err');
    patch({ fonts: addFont(cfg.fonts, { family, source: 'url', href }), activeFontId: null });
    setUrlComposer({ family: '', href: '' });
    flash('已添加');
  };

  return (
    <>
      <Group title="内置主题" hint="样式会实时生效，无需重启。">
        {presets.map((p, i) => {
          const on = cfg.presetId === p.id;
          return (
            <div key={p.id}>
              {i > 0 && <Divider />}
              <Row
                label={p.name}
                sub={p.desc}
                onClick={() => patch({ presetId: p.id })}
                right={
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className="h-5 w-5 rounded-full ring-1 ring-black/10"
                      style={{ background: p.vars['--bb-accent'] }}
                      aria-hidden
                    />
                    {on ? <Check className="h-4 w-4 text-[#007AFF]" /> : null}
                  </span>
                }
              />
            </div>
          );
        })}
      </Group>

      <Group title="作用域" hint="「仅手机」更安全：写得再野也不会影响其它页面。确认稳定后可切到「整个站点」。">
        {(['phone', 'global'] as ThemeScope[]).map((s) => (
          <div key={s}>
            <Divider />
            <Row
              label={s === 'phone' ? '仅作用于小手机' : '作用于整个站点'}
              sub={s === 'phone' ? '推荐 · 出问题随时可关' : '全局生效，请自行确认兼容性'}
              onClick={() => patch({ scope: s })}
              right={cfg.scope === s ? <Check className="h-4 w-4 text-[#007AFF]" /> : null}
            />
          </div>
        ))}
        <Divider />
        <Row
          label="启用自定义外观"
          sub={cfg.enabled ? '已启用' : '已停用，回到原生配色'}
          onClick={() => patch({ enabled: !cfg.enabled })}
          right={<Toggle on={cfg.enabled} label="启用" />}
        />
      </Group>

      <Group title="自定义字体" hint="字体缺失会自动回落到系统字体，不会导致文字消失;">
        {cfg.fonts.length > 0 && (
          <>
            {cfg.fonts.map((f, i) => (
              <div key={f.id}>
                {i > 0 && <Divider />}
                <Row
                  label={f.family}
                  sub={f.source === 'url' ? '网络链接' : '本地文件'}
                onClick={() => patch({ activeFontId: cfg.activeFontId === f.id ? null : f.id })}
                right={cfg.activeFontId === f.id ? <Check className="h-4 w-4 text-[#007AFF]" /> : null}
                actions={
                  <button
                    type="button"
                    aria-label={`删除字体 ${f.family}`}
                    onClick={() => patch({ fonts: cfg.fonts.filter((x) => x.id !== f.id), activeFontId: null })}
                  >
                    <X className="h-4 w-4 text-[#FF3B30]" />
                  </button>
                }
              />
              </div>
            ))}
            <Divider />
          </>
        )}
        <div className="px-4 py-3">
          <p className="mb-2 text-[13px] text-black">用链接添加</p>
          <input
            value={urlComposer.family}
            onChange={(e) => setUrlComposer((s) => ({ ...s, family: e.target.value }))}
            placeholder="字体名，如 LXGW WenKai"
            aria-label="字体名称"
            className="mb-1.5 w-full rounded-lg bg-[#E9E9EB] px-3 py-2 text-[13px] text-black outline-none placeholder:text-[#8e8e93]"
          />
          <input
            value={urlComposer.href}
            onChange={(e) => setUrlComposer((s) => ({ ...s, href: e.target.value }))}
            placeholder="https://…/font.ttf"
            aria-label="字体链接"
            className="mb-2 w-full rounded-lg bg-[#E9E9EB] px-3 py-2 text-[13px] text-black outline-none placeholder:text-[#8e8e93]"
          />
          <button
            type="button"
            onClick={addFontByUrl}
            aria-label="添加字体"
            className="w-full rounded-xl bg-[#007AFF] py-2 text-[13px] font-medium text-white active:opacity-80"
          >
            添加
          </button>
          <button
            type="button"
            onClick={() => fileFontRef.current?.click()}
            aria-label="从文件添加字体"
            className="mt-2 w-full rounded-xl bg-[#E9E9EB] py-2 text-[13px] text-[#007AFF] active:opacity-70"
          >
            从本地文件添加（ttf / otf）
          </button>
        </div>
      </Group>

      <Group title="自定义 CSS" hint="支持导入或手写。留空则不注入；作用域仍受上方设置限制。">
        <div className="px-4 py-3">
          <textarea
            value={cssDraft}
            onChange={(e) => setCssDraft(e.target.value)}
            rows={6}
            placeholder={'例：\n.bg-white{ box-shadow: 0 1px 6px rgba(0,0,0,.08); }'}
            aria-label="自定义 CSS"
            className="w-full resize-y rounded-lg bg-[#E9E9EB] p-3 font-mono text-[11px] leading-relaxed text-black outline-none placeholder:text-[#8e8e93]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => patch({ customCss: cssDraft })}
              aria-label="应用 CSS"
              className="flex-1 rounded-xl bg-[#007AFF] py-2 text-[13px] font-medium text-white active:opacity-80"
            >
              应用
            </button>
            <button
              type="button"
              onClick={() => {
                setCssDraft('');
                patch({ customCss: '' });
              }}
              aria-label="清空 CSS"
              className="rounded-xl bg-[#E9E9EB] px-4 py-2 text-[13px] text-[#FF3B30] active:opacity-70"
            >
              清空
            </button>
          </div>
        </div>
      </Group>

      <Group title="壁纸" hint="用作聊天空闲处的背景图，透明度可调;">
        <div className="px-4 py-3">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => wallRef.current?.click()}
              aria-label="选择壁纸"
              className="flex-1 rounded-xl bg-[#007AFF] py-2 text-[13px] font-medium text-white active:opacity-80"
            >
              选择图片
            </button>
            {cfg.wallpaper && (
              <button
                type="button"
                onClick={() => patch({ wallpaper: null })}
                aria-label="移除壁纸"
                className="rounded-xl bg-[#E9E9EB] px-4 py-2 text-[13px] text-[#FF3B30] active:opacity-70"
              >
                移除
              </button>
            )}
          </div>
          {cfg.wallpaper && (
            <img src={cfg.wallpaper} alt="壁纸预览" className="mb-2 h-24 w-full rounded-lg object-cover" />
          )}
        </div>
        <Divider />
        <Slider
          label="不透明度"
          value={Math.round(cfg.wallpaperAlpha * 100)}
          min={10}
          max={100}
          onChange={(v) => patch({ wallpaperAlpha: v / 100 })}
          format={(v) => `${v}%`}
        />
      </Group>

      <input
        ref={fileFontRef}
        type="file"
        accept=".ttf,.otf,.woff,font/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const href = await fontFileToDataUrl(f);
            const family = f.name.replace(/\.(ttf|otf|woff)$/i, '') || '本地字体';
            patch({ fonts: addFont(cfg.fonts, { family, source: 'file', href }) });
            flash('字体已加载');
          } catch {
            flash('字体读取失败', 'err');
          }
        }}
      />
      <input
        ref={wallRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            patch({ wallpaper: await imageToDataUrl(f) });
            flash('壁纸已应用');
          } catch {
            flash('图片读取失败', 'err');
          }
        }}
      />
    </>
  );
}

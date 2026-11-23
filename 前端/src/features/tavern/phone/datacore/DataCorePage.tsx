/**
 * 数据中枢 · 设置面板
 *
 * 最多四块：数据看板 / 上下文注入 / 备份迁移 / 外观美化。
 * 设置页只取前三块（外观在设置里有自己的分区）；小手机「中枢」保留外观这一块。
 * 原来的「记忆」分块已删除，不再展示也不再作为可选 panels。
 *
 * 这里的配色统一走 `phone` 系列语义色（`bg-phone-*` / `text-phone-*`），
 * 由 tailwind 配置随整体深浅主题切换，不再使用固定的 iOS 硬编码色值。
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
  PlugZap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { probeStStatus } from '@/lib/api/tavern';
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
  type UsageReport,
  type ImportMode,
} from './storageCore';
import { smartImport } from './smartImport';
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
  saveCurrentAsTheme,
  deleteSavedTheme,
  applySavedTheme,
  type ThemeScope,
} from './themeCore';

type Panel = 'storage' | 'bridge' | 'backup' | 'theme';

const PANELS: { key: Panel; label: string; icon: typeof Database }[] = [
  { key: 'storage', label: '数据', icon: HardDrive },
  { key: 'bridge', label: '上下文注入', icon: ShieldCheck },
  { key: 'backup', label: '备份', icon: Database },
  { key: 'theme', label: '外观', icon: Palette },
];

/* ------------------------------ 基础零件 ------------------------------ */

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <p className="mb-1 px-4 text-[11px] uppercase tracking-wide text-phone-muted">{title}</p>
      <div className="overflow-hidden rounded-[10px] bg-phone-surface">{children}</div>
      {hint && <p className="mt-1 px-4 text-[11px] leading-relaxed text-phone-muted">{hint}</p>}
    </section>
  );
}

function Divider() {
  return <div className="ml-4 h-[1px] bg-phone-sep" />;
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
    <div className={cn('flex items-center transition', interactive && 'active:bg-phone-grouped', disabled && 'opacity-40')}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px]', danger ? 'text-[#FF3B30]' : 'text-phone-ink')}>{label}</span>
          {sub && <span className="mt-0.5 block text-[11px] leading-snug text-phone-muted">{sub}</span>}
        </span>
        {!actions && (right ?? <ChevronRight className="h-4 w-4 shrink-0 text-phone-muted" />)}
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
        on ? 'bg-[#34C759]' : 'bg-phone-sep',
      )}
    >
      <motion.span
        className="absolute left-[2px] top-[2px] block h-[27px] w-[27px] rounded-full bg-phone-surface shadow-[0_2px_4px_rgba(0,0,0,.2)]"
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
        <span className="text-[14px] text-phone-ink">{label}</span>
        <span className="text-[13px] tabular-nums text-phone-muted">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-[6px] w-full cursor-pointer appearance-none rounded-full bg-phone-sep accent-phone-blue"
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
      className="absolute inset-0 z-50 flex flex-col bg-phone-bg"
      data-testid="confirm-page"
    >
      <PhoneNavBar title={title} onBack={onCancel} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-phone-muted">{body}</p>
      </div>
      <div className="shrink-0 space-y-2 border-t border-phone-sep px-4 py-3">
        <button
          type="button"
          onClick={onConfirm}
          aria-label={confirmText}
          className={cn(
            'flex h-11 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition active:scale-[0.99]',
            danger ? 'bg-[#FF3B30] text-white' : 'bg-phone-blue text-primary-foreground',
          )}
        >
          {confirmText}
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="取消"
          className="flex h-11 w-full items-center justify-center rounded-xl bg-phone-grouped text-[15px] font-medium text-phone-muted transition active:scale-[0.99]"
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
 * `panels` 用来裁剪显示哪些分块。设置页里只放数据/上下文注入/备份——
 * 外观已经搬到「设置 → 外观」自己的分区了，不在这里重复一遍。
 *
 * `inline` 给设置页用：**去掉 `h-full` 与内嵌滚动条**，内容跟着整页一起滚。
 * 之前设置页把它塞进一个固定 `h-[600px]` 的盒子里，手机上想往下滑整页时
 * 手指一进这块就被里面那层滚动容器吃掉——改成点开内联展开就没有这个夹层了。
 */
export function DataCorePage({
  panels,
  inline,
  onOpenStConfig,
}: { panels?: Panel[]; inline?: boolean; onOpenStConfig?: () => void } = {}) {
  const shown = panels && panels.length ? PANELS.filter((p) => panels.includes(p.key)) : PANELS;
  const [panel, setPanel] = useState<Panel>(shown[0]?.key ?? 'storage');
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const [stUp, setStUp] = useState(false);
  const flash = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => {
    void probeStStatus().then(setStUp);
  }, []);

  return (
    <div
      className={cn(
        'relative flex flex-col bg-phone-grouped',
        inline ? 'rounded-xl' : 'h-full min-h-0',
      )}
      data-inline={inline ? '1' : undefined}
    >
      {/* 顶栏：内联展开时外层设置项已经有标题了，不再重复一行 */}
      {!inline && (
        <div className="flex h-11 shrink-0 items-center justify-between px-4">
          <p className="text-[17px] font-semibold text-phone-ink">数据中枢</p>
        </div>
      )}

      {/* 分段切换 */}
      <div className={cn('shrink-0 px-4 pb-3', inline && 'pt-3')}>
        <div className="flex rounded-[9px] bg-phone-surface p-0.5">
          {shown.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPanel(p.key)}
              aria-label={p.label}
              aria-pressed={panel === p.key}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-[7px] py-1.5 text-[11px] transition',
                panel === p.key ? 'bg-phone-blue font-medium text-primary-foreground' : 'text-phone-muted',
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

        {/* 连接 SillyTavern 入口（酒馆数据源切换） */}
        {onOpenStConfig && (
          <button
            type="button"
            onClick={onOpenStConfig}
            className="mb-4 flex w-full items-center gap-3 rounded-[10px] bg-phone-surface px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                stUp ? 'bg-phone-blue text-primary-foreground' : 'bg-phone-grouped text-phone-muted',
              )}
            >
              <PlugZap className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-phone-ink">连接 SillyTavern</span>
              <span className="block text-[11px] text-phone-muted">
                {stUp ? '已连接 · 酒馆数据存于 ST' : '未连接 · 当前使用本地数据'}
              </span>
            </span>
            <span
              className={cn('h-2.5 w-2.5 shrink-0 rounded-full', stUp ? 'bg-[#34C759]' : 'bg-phone-sep')}
            />
            <ChevronRight className="h-4 w-4 shrink-0 text-phone-muted" />
          </button>
        )}

        {panel === 'storage' && <StoragePanel flash={flash} />}
        {panel === 'bridge' && <BridgePanel />}
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
            <span className="text-[22px] font-semibold tabular-nums text-phone-ink">{humanSize(report?.total ?? 0)}</span>
            <span className="text-[12px] text-phone-muted">
              / {humanSize(report?.quotaHint ?? 5 * 1024 * 1024)} · {pct.toFixed(1)}%
            </span>
          </div>
          <div className="h-[8px] overflow-hidden rounded-full bg-phone-sep">
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
                    <span className="text-[13px] tabular-nums text-phone-muted">{humanSize(usage?.bytes ?? 0)}</span>
                    <Trash2 className="h-3.5 w-3.5 text-phone-muted" />
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

/* ------------------------------ 上下文注入 ------------------------------ */

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
        hint="打开后，聊天发起时会把下面勾选的记录整理成一段上下文交给 TA。关掉则完全不注入，TA 只看到当前会话。"
      >
        <Row
          label="让他记住这些日常"
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
        <Row label="恢复默认" sub="回到初始配置" onClick={() => setCfg(DEFAULT_BRIDGE)} right={<RotateCcw className="h-4 w-4 text-phone-blue" />} />
      </Group>

      <Group
        title={`预览 · 实发 ${built.stats.chars} 字`}
        hint={built.stats.droppedSources.length > 0 ? `已因超预算丢弃：${built.stats.droppedSources.join('、')}` : '这是模型实际会收到的内容'}
      >
        <div className="px-4 py-3">
          {preview.length === 0 ? (
            <p className="text-[13px] text-phone-muted">当前没有可注入的记录。</p>
          ) : (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-phone-muted">
              {built.text || '（空）'}
            </pre>
          )}
        </div>
      </Group>
    </>
  );
}

/* ------------------------------ 备份迁移 ------------------------------ */

function BackupPanel({ flash }: { flash: (t: string, tone?: 'ok' | 'err') => void }) {
  const [snaps, setSnaps] = useState(() => listSnapshots());
  const [pending, setPending] = useState<{ kind: 'restore'; id: string; label: string } | null>(null);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [importing, setImporting] = useState(false);
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

  const doImport = async () => {
    if (importing || !importText.trim()) return;
    setImporting(true);
    try {
      const r = await smartImport(importText, importMode);
      if (!r.ok) {
        flash(r.error ?? '导入失败', 'err');
        return;
      }
      setImportText('');
      refresh();
      const tail = [r.skipped ? `跳过 ${r.skipped} 项` : '', r.note ?? ''].filter(Boolean).join('，');
      flash(`已导入 ${r.applied} 项${tail ? `（${tail}）` : ''}`);
    } finally {
      setImporting(false);
    }
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
          right={<Plus className="h-4 w-4 text-phone-blue" />}
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
                right={<RotateCcw className="h-4 w-4 text-phone-blue" />}
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

      <Group
        title="全量导出 / 导入"
        hint="导入支持任意 JSON：本项目备份、旧记忆文件、零散记忆数组都能吃；认不出的内容也会原文留存，不再报格式不对。"
      >
        <Row
          label="导出全部数据"
          sub="生成 .json 备份文件"
          onClick={() => {
            downloadBackup();
            flash('已开始下载');
          }}
          right={<Download className="h-4 w-4 text-phone-blue" />}
        />
        <Divider />
        <Row
          label="选择 JSON 文件"
          sub="任意结构，识别后导入"
          onClick={() => fileRef.current?.click()}
          right={<Upload className="h-4 w-4 text-phone-blue" />}
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
                    importMode === m ? 'bg-phone-blue text-primary-foreground' : 'bg-phone-grouped text-phone-muted',
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
                  「整体替换」只对本项目全量备份生效；其他 JSON 一律按合并导入，并自动留一份回滚快照。
                </p>
              )}
              <button
                type="button"
                onClick={() => void doImport()}
                disabled={importing}
                aria-label="执行导入"
                className="w-full rounded-xl bg-phone-blue py-2.5 text-[14px] font-medium text-primary-foreground active:opacity-80 disabled:opacity-60"
              >
                {importing ? '导入中…' : '执行导入'}
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
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

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

  const confirmSaveTheme = () => {
    patch(saveCurrentAsTheme(cfg, nameDraft));
    setNaming(false);
    setNameDraft('');
    flash('主题已保存');
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
                      className="h-5 w-5 rounded-full ring-1 ring-phone-sep"
                      style={{ background: p.vars['--bb-accent'] }}
                      aria-hidden
                    />
                    {on ? <Check className="h-4 w-4 text-phone-blue" /> : null}
                  </span>
                }
              />
            </div>
          );
        })}
      </Group>

      <Group
        title="我的主题"
        hint="把当前「作用域 + 配色 + 自定义 CSS + 壁纸 + 字体」整套存成一个名字，随时一键套用。存进本机设置（localStorage），刷新不丢。"
      >
        <Row
          label="保存当前搭配为新主题"
          sub="取个名字，记住现在这套外观"
          onClick={() => {
            setNameDraft('');
            setNaming(true);
          }}
        />
        {naming && (
          <div className="flex items-center gap-2 px-4 py-2.5">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSaveTheme();
                if (e.key === 'Escape') {
                  setNaming(false);
                  setNameDraft('');
                }
              }}
              placeholder="例如：奶油薄荷"
              className="h-9 flex-1 rounded-[10px] bg-phone-grouped px-3 text-[14px] text-phone-ink outline-none placeholder:text-phone-muted"
            />
            <button
              type="button"
              onClick={confirmSaveTheme}
              className="h-9 rounded-[10px] bg-phone-blue px-3 text-[13px] font-medium text-primary-foreground active:opacity-80"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setNaming(false);
                setNameDraft('');
              }}
              className="h-9 rounded-[10px] bg-phone-grouped px-3 text-[13px] text-phone-muted active:opacity-70"
            >
              取消
            </button>
          </div>
        )}
        {cfg.customPresets.length > 0 ? (
          cfg.customPresets.map((t, i) => {
            const on = cfg.presetId === t.id;
            return (
              <div key={t.id}>
                {(i > 0 || naming) && <Divider />}
                <Row
                  label={t.name}
                  sub={t.desc}
                  onClick={() => patch(applySavedTheme(cfg, t))}
                  right={
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className="h-5 w-5 rounded-full ring-1 ring-phone-sep"
                        style={{ background: t.vars['--bb-accent'] }}
                        aria-hidden
                      />
                      {on ? <Check className="h-4 w-4 text-phone-blue" /> : null}
                    </span>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        patch(deleteSavedTheme(cfg, t.id));
                      }}
                      aria-label={`删除主题 ${t.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#FF3B30] active:bg-phone-sep"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  }
                />
              </div>
            );
          })
        ) : (
          !naming && <p className="px-4 py-2 text-[12px] text-phone-muted">还没有保存过的主题，点上面那行存一个吧。</p>
        )}
      </Group>

      <Group title="作用域" hint="「仅手机」更安全：写得再野也不会影响其它页面。确认稳定后可切到「整个站点」。">
        {(['phone', 'global'] as ThemeScope[]).map((s) => (
          <div key={s}>
            <Divider />
            <Row
              label={s === 'phone' ? '仅作用于小手机' : '作用于整个站点'}
              sub={s === 'phone' ? '推荐 · 出问题随时可关' : '全局生效，请自行确认兼容性'}
              onClick={() => patch({ scope: s })}
              right={cfg.scope === s ? <Check className="h-4 w-4 text-phone-blue" /> : null}
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
        <Divider />
        <Row
          label="恢复默认外观"
          sub="清空自定义 CSS 与字体，回到午夜深蓝"
          danger
          onClick={() =>
            patch({
              presetId: 'midnight',
              customCss: '',
              fonts: [],
              activeFontId: null,
              enabled: true,
            })
          }
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
                right={cfg.activeFontId === f.id ? <Check className="h-4 w-4 text-phone-blue" /> : null}
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
          <p className="mb-2 text-[13px] text-phone-ink">用链接添加</p>
          <input
            value={urlComposer.family}
            onChange={(e) => setUrlComposer((s) => ({ ...s, family: e.target.value }))}
            placeholder="字体名，如 LXGW WenKai"
            aria-label="字体名称"
            className="mb-1.5 w-full rounded-lg bg-phone-grouped px-3 py-2 text-[13px] text-phone-ink outline-none placeholder:text-phone-muted"
          />
          <input
            value={urlComposer.href}
            onChange={(e) => setUrlComposer((s) => ({ ...s, href: e.target.value }))}
            placeholder="https://…/font.ttf"
            aria-label="字体链接"
            className="mb-2 w-full rounded-lg bg-phone-grouped px-3 py-2 text-[13px] text-phone-ink outline-none placeholder:text-phone-muted"
          />
          <button
            type="button"
            onClick={addFontByUrl}
            aria-label="添加字体"
            className="w-full rounded-xl bg-phone-blue py-2 text-[13px] font-medium text-primary-foreground active:opacity-80"
          >
            添加
          </button>
          <button
            type="button"
            onClick={() => fileFontRef.current?.click()}
            aria-label="从文件添加字体"
            className="mt-2 w-full rounded-xl bg-phone-grouped py-2 text-[13px] text-phone-blue active:opacity-70"
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
            placeholder={'例：\n.bg-phone-surface{ box-shadow: 0 1px 6px rgba(0,0,0,.08); }'}
            aria-label="自定义 CSS"
            className="w-full resize-y rounded-lg bg-phone-grouped p-3 font-mono text-[11px] leading-relaxed text-phone-ink outline-none placeholder:text-phone-muted"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => patch({ customCss: cssDraft })}
              aria-label="应用 CSS"
              className="flex-1 rounded-xl bg-phone-blue py-2 text-[13px] font-medium text-primary-foreground active:opacity-80"
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
              className="rounded-xl bg-phone-grouped px-4 py-2 text-[13px] text-[#FF3B30] active:opacity-70"
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
              className="flex-1 rounded-xl bg-phone-blue py-2 text-[13px] font-medium text-primary-foreground active:opacity-80"
            >
              选择图片
            </button>
            {cfg.wallpaper && (
              <button
                type="button"
                onClick={() => patch({ wallpaper: null })}
                aria-label="移除壁纸"
                className="rounded-xl bg-phone-grouped px-4 py-2 text-[13px] text-[#FF3B30] active:opacity-70"
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

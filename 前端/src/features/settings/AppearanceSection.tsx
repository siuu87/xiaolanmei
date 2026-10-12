/**
 * 「我」页 · 外观
 *
 * 从中枢里搬出来的那一块，做了两件适配：
 * 1. **去掉 App 用不到的项**——壁纸（只有小手机聊天背景用）、作用域（默认就是全站）、
 *    数字字体这类只影响手机的开关都清掉了，剩下的每一项在 App 里都能立刻看到效果。
 * 2. **每一项都能点开**——深浅模式内联展开，强调色 / 配色 / 字体 / CSS 各自弹窗，
 *    自定义字体给整页，符合「点开之后是新页或弹窗或拓展」。
 *
 * 数据仍然走 themeCore 的同一份 localStorage，所以这里改完，小手机里的配色同步变化。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Braces,
  Brush,
  CaseSensitive,
  Check,
  Moon,
  Palette,
  RotateCcw,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ACCENT_HSL,
  ACCENT_PRESETS,
  useAppStore,
  type Accent,
  type NumFont,
  type Theme,
} from '@/stores/appStore';
import {
  useThemeEngine,
  addFont,
  fontFileToDataUrl,
} from '@/features/tavern/phone/datacore/themeCore';
import { IOSSettingGroup } from '@/components/ios/IOSSettingGroup';
import { IOSSettingItem } from '@/components/ios/IOSSettingItem';
import { IOSSwitch } from '@/components/ios/IOSSwitch';

type SheetKey = 'accent' | 'preset' | 'numfont' | 'font' | 'css';

const NUM_FONT_PRESETS: { key: NumFont; name: string; fontFamily: string }[] = [
  { key: 'serif', name: '飘逸衬线', fontFamily: "'Playfair Display', Georgia, serif" },
  { key: 'sans', name: '现代无衬线', fontFamily: 'Inter, system-ui, sans-serif' },
];

/* ------------------------------ 弹层 ------------------------------ */

/** 底部弹窗；full=true 时铺满整屏，当「新页」用。 */
function Sheet({
  open,
  title,
  subtitle,
  full,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  full?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-background shadow-2xl',
          full
            ? 'h-full max-w-none rounded-none'
            : 'h-[80vh] max-w-md rounded-t-2xl sm:h-[68vh] sm:rounded-2xl',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
            {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`关闭${title}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground active:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** 弹层里的可选项：左侧说明 + 右侧对勾 */
function OptionRow({
  label,
  sub,
  on,
  onClick,
  leading,
  onDelete,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onClick: () => void;
  leading?: React.ReactNode;
  onDelete?: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-foreground">{label}</span>
          {sub && <span className="mt-0.5 block text-[12px] text-muted-foreground">{sub}</span>}
        </span>
        {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`删除 ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:opacity-70"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------ 外观分区 ------------------------------ */

export function AppearanceSection() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const accent = useAppStore((s) => s.accent);
  const setAccent = useAppStore((s) => s.setAccent);
  const numFont = useAppStore((s) => s.numFont);
  const setNumFont = useAppStore((s) => s.setNumFont);

  const { cfg, patch, presets } = useThemeEngine();

  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [expandMode, setExpandMode] = useState(false);
  const [cssDraft, setCssDraft] = useState(cfg.customCss);
  const [fontDraft, setFontDraft] = useState({ family: '', href: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const curPreset = presets.find((p) => p.id === cfg.presetId) ?? presets[0];
  const curAccent = ACCENT_PRESETS.find((p) => p.key === accent);
  const curNumFont = NUM_FONT_PRESETS.find((p) => p.key === numFont);

  useEffect(() => setCssDraft(cfg.customCss), [cfg.customCss]);

  return (
    <>
      <IOSSettingGroup title="外观">
        <IOSSettingItem
          icon={<Moon className="h-4 w-4" />}
          iconBg="bg-indigo-500"
          title="深色模式"
          subtitle="整站统一深色，夜间更护眼"
          value={theme === 'dark' ? '深色' : '浅色'}
          showChevron
          onClick={() => setExpandMode((v) => !v)}
        />
        {expandMode && (
          <div className="bg-muted/50 px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              {(['dark', 'light'] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-label={t === 'dark' ? '深色模式' : '浅色模式'}
                  aria-pressed={theme === t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    theme === t
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card',
                  )}
                >
                  <span
                    className={cn(
                      'mb-2 block h-10 w-full rounded-lg',
                      t === 'dark' ? 'bg-[#171D2B]' : 'bg-[#F2F2F7]',
                    )}
                  />
                  <span className="text-[14px] font-medium text-foreground">
                    {t === 'dark' ? '深色' : '浅色'}
                  </span>
                  {t === 'dark' && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">推荐</span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              目前整站已统一为深色；浅色保留着，方便以后做美化时对照。
            </p>
          </div>
        )}

        <IOSSettingItem
          icon={<Palette className="h-4 w-4" />}
          iconBg="bg-amber-500"
          title="强调色"
          subtitle="按钮、选中态与高亮的颜色"
          value={curAccent?.name}
          showChevron
          onClick={() => setSheet('accent')}
        />

        <IOSSettingItem
          icon={<Brush className="h-4 w-4" />}
          iconBg="bg-violet-500"
          title="配色方案"
          subtitle="卡片、气泡与文字的整体色板"
          value={curPreset?.name}
          showChevron
          onClick={() => setSheet('preset')}
        />

        <IOSSettingItem
          icon={<Type className="h-4 w-4" />}
          iconBg="bg-sky-500"
          title="数字字体"
          subtitle="日期与数字的字形"
          value={curNumFont?.name}
          showChevron
          onClick={() => setSheet('numfont')}
        />

        <IOSSettingItem
          icon={<CaseSensitive className="h-4 w-4" />}
          iconBg="bg-teal-500"
          title="自定义字体"
          subtitle="加载本地或网络字体"
          value={cfg.fonts.length ? `${cfg.fonts.length} 个` : undefined}
          showChevron
          onClick={() => setSheet('font')}
        />

        <IOSSettingItem
          icon={<Braces className="h-4 w-4" />}
          iconBg="bg-slate-500"
          title="自定义 CSS"
          subtitle="高级：手写样式覆盖"
          value={cfg.customCss.trim() ? '已设置' : undefined}
          showChevron
          onClick={() => setSheet('css')}
        />

        <IOSSettingItem
          icon={<RotateCcw className="h-4 w-4" />}
          iconBg="bg-gray-400"
          title="启用自定义外观"
          subtitle="关掉则回到原生配色"
          trailing={
            <IOSSwitch
              checked={cfg.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              aria-label="启用自定义外观"
            />
          }
        />
      </IOSSettingGroup>

      {/* 强调色 */}
      <Sheet
        open={sheet === 'accent'}
        title="强调色"
        subtitle="影响按钮、选中与高亮"
        onClose={() => setSheet(null)}
      >
        <div className="space-y-1">
          {ACCENT_PRESETS.map((p) => (
            <OptionRow
              key={p.key}
              label={p.name}
              on={accent === p.key}
              onClick={() => setAccent(p.key as Accent)}
              leading={
                <span
                  className="h-6 w-6 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ background: `hsl(${ACCENT_HSL[p.key]})` }}
                  aria-hidden
                />
              }
            />
          ))}
        </div>
      </Sheet>

      {/* 配色方案 */}
      <Sheet
        open={sheet === 'preset'}
        title="配色方案"
        subtitle="作用于整个 App，实时生效"
        onClose={() => setSheet(null)}
      >
        <div className="space-y-1">
          {presets.map((p) => (
            <OptionRow
              key={p.id}
              label={p.name}
              sub={p.desc}
              on={cfg.presetId === p.id}
              onClick={() => patch({ presetId: p.id })}
              leading={
                <span className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-black/10">
                  <span className="h-6 w-3" style={{ background: p.vars['--bb-bg'] }} />
                  <span className="h-6 w-3" style={{ background: p.vars['--bb-card'] }} />
                  <span className="h-6 w-3" style={{ background: p.vars['--bb-accent'] }} />
                </span>
              }
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            patch({
              presetId: 'midnight',
              customCss: '',
              fonts: [],
              activeFontId: null,
              enabled: true,
            })
          }
          aria-label="恢复默认外观"
          className="mt-4 w-full rounded-xl bg-muted py-2 text-[13px] text-foreground active:opacity-70"
        >
          恢复默认（午夜深蓝）
        </button>
      </Sheet>

      {/* 数字字体 */}
      <Sheet
        open={sheet === 'numfont'}
        title="数字字体"
        subtitle="日期、计数等数字的字形"
        onClose={() => setSheet(null)}
      >
        <div className="grid grid-cols-2 gap-2">
          {NUM_FONT_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setNumFont(p.key)}
              aria-pressed={numFont === p.key}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-3 transition',
                numFont === p.key ? 'border-primary bg-primary/10' : 'border-border bg-card',
              )}
            >
              <span className="text-xl leading-none text-foreground" style={{ fontFamily: p.fontFamily }}>
                0123456789
              </span>
              <span className="text-xs text-foreground">{p.name}</span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* 自定义字体（整页） */}
      <Sheet
        open={sheet === 'font'}
        full
        title="自定义字体"
        subtitle="缺失会自动回落系统字体，不会导致文字消失"
        onClose={() => setSheet(null)}
      >
        {cfg.fonts.length > 0 && (
          <div className="mb-4 space-y-1 rounded-xl bg-muted/40 p-1">
            {cfg.fonts.map((f) => (
              <OptionRow
                key={f.id}
                label={f.family}
                sub={f.source === 'url' ? '网络链接' : '本地文件'}
                on={cfg.activeFontId === f.id}
                onClick={() => patch({ activeFontId: cfg.activeFontId === f.id ? null : f.id })}
                onDelete={() =>
                  patch({
                    fonts: cfg.fonts.filter((x) => x.id !== f.id),
                    activeFontId: null,
                  })
                }
              />
            ))}
          </div>
        )}

        <p className="mb-2 text-[13px] font-medium text-foreground">用链接添加</p>
        <input
          value={fontDraft.family}
          onChange={(e) => setFontDraft((s) => ({ ...s, family: e.target.value }))}
          placeholder="字体名，如 LXGW WenKai"
          aria-label="字体名称"
          className="mb-2 w-full rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <input
          value={fontDraft.href}
          onChange={(e) => setFontDraft((s) => ({ ...s, href: e.target.value }))}
          placeholder="https://…/font.ttf"
          aria-label="字体链接"
          className="mb-2 w-full rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="添加字体"
          onClick={() => {
            const family = fontDraft.family.trim();
            const href = fontDraft.href.trim();
            if (!family || !href) return;
            patch({ fonts: addFont(cfg.fonts, { family, source: 'url', href }), activeFontId: null });
            setFontDraft({ family: '', href: '' });
          }}
          className="w-full rounded-xl bg-primary py-2 text-[13px] font-medium text-primary-foreground active:opacity-80"
        >
          添加
        </button>
        <button
          type="button"
          aria-label="从文件添加字体"
          onClick={() => fileRef.current?.click()}
          className="mt-2 w-full rounded-xl bg-muted py-2 text-[13px] text-foreground active:opacity-70"
        >
          从本地文件添加（ttf / otf）
        </button>
        <input
          ref={fileRef}
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
            } catch {
              /* 读取失败就静默，UI 上已有提示文案 */
            }
          }}
        />
      </Sheet>

      {/* 自定义 CSS */}
      <Sheet
        open={sheet === 'css'}
        title="自定义 CSS"
        subtitle="留空则不注入；写得再野也可以随时关掉总开关"
        onClose={() => setSheet(null)}
      >
        <textarea
          value={cssDraft}
          onChange={(e) => setCssDraft(e.target.value)}
          rows={10}
          placeholder={'例：\n.bg-white{ box-shadow: 0 1px 6px rgba(0,0,0,.08); }'}
          aria-label="自定义 CSS"
          className="w-full resize-y rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            aria-label="应用 CSS"
            onClick={() => patch({ customCss: cssDraft })}
            className="flex-1 rounded-xl bg-primary py-2 text-[13px] font-medium text-primary-foreground active:opacity-80"
          >
            应用
          </button>
          <button
            type="button"
            aria-label="清空 CSS"
            onClick={() => {
              setCssDraft('');
              patch({ customCss: '' });
            }}
            className="rounded-xl bg-muted px-4 py-2 text-[13px] text-destructive active:opacity-70"
          >
            清空
          </button>
        </div>
      </Sheet>
    </>
  );
}

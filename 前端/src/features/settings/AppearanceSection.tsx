/**
 * 「我」页 · 外观
 *
 * 本区只管**全站外观**：深色模式 / 强调色 / 气泡颜色 / 字体。
 *
 * ~~高级外观（小手机配色方案 + 自定义 CSS + 启用开关）~~ 已移走：那套只作用于小手机，
 * 与全站主题互不影响，归小手机自己的界面管——进小手机「中枢」Tab 的「外观」即可设置，
 * 不在整体设置里改。数据仍走 themeCore 同一份 localStorage，两边共享。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  MessageCircle,
  Moon,
  Palette,
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
import { BUBBLE_THEMES, useBubbleTheme } from '@/features/chat/bubbleTheme';

type SheetKey = 'accent' | 'font' | 'bubble';

/* 分组卡磨砂底由 IOSSettingGroup 组件自身处理（.glass + 16px 圆角） */

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
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-surface text-foreground shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]',
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground active:opacity-70"
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

/** 弹层里的分区小标题 */
function SheetHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-3 px-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80 first:mt-0">{children}</p>;
}

/* ------------------------------ 外观分区 ------------------------------ */

export function AppearanceSection() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const accent = useAppStore((s) => s.accent);
  const setAccent = useAppStore((s) => s.setAccent);
  const numFont = useAppStore((s) => s.numFont);
  const setNumFont = useAppStore((s) => s.setNumFont);
  const bubbleTheme = useBubbleTheme((s) => s.theme);
  const setBubbleTheme = useBubbleTheme((s) => s.setTheme);

  const { cfg, patch } = useThemeEngine();

  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [expandMode, setExpandMode] = useState(false);
  const [fontDraft, setFontDraft] = useState({ family: '', href: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const curAccent = ACCENT_PRESETS.find((p) => p.key === accent);
  const curNumFont = NUM_FONT_PRESETS.find((p) => p.key === numFont);

  return (
    <>
      <IOSSettingGroup title="外观">
        <IOSSettingItem
          icon={<Moon className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="深色模式"
          subtitle="整站统一深色，夜间更护眼"
          value={theme === 'dark' ? '深色' : '浅色'}
          showChevron
          onClick={() => setExpandMode((v) => !v)}
        />
        {expandMode && (
          <div className="bg-surface-2 px-4 py-3">
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
                      t === 'dark' ? 'bg-[#17181A]' : 'bg-[#F2F3F4]',
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
              浅色为白水灰调，深色为中性石墨灰；切换即时生效。
            </p>
          </div>
        )}

        <IOSSettingItem
          icon={<Palette className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="强调色"
          subtitle="按钮、选中态与高亮的颜色"
          value={curAccent?.name}
          showChevron
          onClick={() => setSheet('accent')}
        />

        <IOSSettingItem
          icon={<MessageCircle className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="气泡颜色"
          subtitle="聊天里两边气泡的底色（2026-11-18 起开放）"
          value={BUBBLE_THEMES.find((t) => t.key === bubbleTheme)?.name}
          showChevron
          onClick={() => setSheet('bubble')}
        />

        <IOSSettingItem
          icon={<Type className="h-4 w-4" />}
          iconBg="bg-violet-400"
          title="字体"
          subtitle="数字字形 + 自定义字体"
          value={curNumFont?.name ?? (cfg.fonts.length ? `${cfg.fonts.length} 个自定义` : undefined)}
          showChevron
          onClick={() => setSheet('font')}
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

      {/* 气泡颜色（三十五改）：五套主题，选完即时生效（挂 html 的 .bubble-* 类） */}
      <Sheet
        open={sheet === 'bubble'}
        title="气泡颜色"
        subtitle="聊天里己方 / 对方气泡的底色，其余界面不受影响"
        onClose={() => setSheet(null)}
      >
        <div className="space-y-1">
          {BUBBLE_THEMES.map((t) => (
            <OptionRow
              key={t.key}
              label={t.name}
              on={bubbleTheme === t.key}
              onClick={() => setBubbleTheme(t.key)}
              leading={
                <span className="flex shrink-0 items-center" aria-hidden>
                  <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: t.swatch[0] }} />
                  <span
                    className="-ml-2 h-6 w-6 rounded-full ring-1 ring-black/10"
                    style={{ background: t.swatch[1] }}
                  />
                </span>
              }
            />
          ))}
        </div>
      </Sheet>

      {/* 字体：数字字体 + 自定义字体 合并 */}
      <Sheet
        open={sheet === 'font'}
        title="字体"
        subtitle="数字字形与自定义字体，缺失会自动回落系统字体"
        full
        onClose={() => setSheet(null)}
      >
        <SheetHeading>数字字体</SheetHeading>
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

        <SheetHeading>自定义字体</SheetHeading>
        {cfg.fonts.length > 0 && (
          <div className="mb-2 space-y-1 rounded-xl bg-surface-2 p-1">
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

        <input
          value={fontDraft.family}
          onChange={(e) => setFontDraft((s) => ({ ...s, family: e.target.value }))}
          placeholder="字体名，如 LXGW WenKai"
          aria-label="字体名称"
          className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <input
          value={fontDraft.href}
          onChange={(e) => setFontDraft((s) => ({ ...s, href: e.target.value }))}
          placeholder="https://…/font.ttf"
          aria-label="字体链接"
          className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
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
          className="mt-2 w-full rounded-xl bg-surface-2 py-2 text-[13px] text-foreground active:opacity-70"
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

    </>
  );
}

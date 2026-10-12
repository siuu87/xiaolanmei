/**
 * 数据中枢 · 外观中枢
 *
 * 主题 / 自定义 CSS / 自定义字体 / 壁纸。
 *
 * 三个原则：
 * 1. **可卸载**——每条样式都写进带固定 id 的 <style>，卸载时按 id 精确移除，不留残留。
 * 2. **默认收口**——样式默认只作用在手机上（属性选择器限定），要扩到全站需用户显式切换作用域。
 *    这样即使写了很野的 CSS 也不会把其它页面搞崩。
 * 3. **可读兜底**——字体缺失自动回落系统字体；自定义 CSS 语法异常不影响其余样式。
 *
 * 为什么主题是「覆盖已知类名」而不是逐个改组件：
 * 现有小手机用的是 Tailwind 原子类（bg-white / text-[#007AFF] / bg-[#F2F2F7]），
 * 32+ 处 bg-white、56 处 text-[#8e8e93]，逐个改极易漏且 diff 巨大。
 * 这里用一层作用域限定的覆盖规则统一接管，组件一行不动；
 * 将来要换实现，也只需要动这一个文件。
 */
import { useEffect, useState } from 'react';

export type FontSource = 'url' | 'file';

export interface FontEntry {
  id: string;
  family: string;
  source: FontSource;
  /** url 模式：字体文件直链；file 模式：dataURL */
  href: string;
  weight?: string;
  style?: 'normal' | 'italic';
}

export type ThemeScope = 'phone' | 'global';

export interface ThemeConfig {
  presetId: string;
  scope: ThemeScope;
  customCss: string;
  fonts: FontEntry[];
  activeFontId: string | null;
  wallpaper: string | null;
  /** 壁纸不透明度 0~1，越低越淡 */
  wallpaperAlpha: number;
  /** 关闭后完全不注入任何样式，用于排查问题 */
  enabled: boolean;
}

/**
 * v2：默认配色从「iOS 原色（浅）」换成「午夜深蓝」，并把作用域默认改为全站，
 * 这样整个 App（不只是小手机）都是深色。换 key 是为了让老配置自然失效一次；
 * 用户之后在「我 → 外观」里的选择会正常存下来。
 */
const CFG_KEY = 'tavern.support.theme.v2';

/* ------------------------------ 内置主题 ------------------------------ */

export interface Preset {
  id: string;
  name: string;
  desc: string;
  vars: Record<string, string>;
}

export const PRESETS: Preset[] = [
  {
    id: 'ios-light',
    name: 'iOS 原色',
    desc: '系统默认，白底蓝强调',
    vars: {
      '--bb-bg': '#F2F2F7',
      '--bb-card': '#FFFFFF',
      '--bb-text': '#000000',
      '--bb-muted': '#8E8E93',
      '--bb-border': 'rgba(0,0,0,0.06)',
      '--bb-edge': '#C7C7CC',
      '--bb-accent': '#007AFF',
      '--bb-bubble-in': '#E9E9EB',
      '--bb-bubble-out': '#007AFF',
      '--bb-bubble-out-text': '#FFFFFF',
      '--bb-bar': '#F9F9F9',
    },
  },
  {
    id: 'midnight',
    name: '午夜深蓝',
    desc: '暗色系，长时间聊更省眼',
    vars: {
      '--bb-bg': '#0F1420',
      '--bb-card': '#171D2B',
      '--bb-text': '#E6EAF2',
      '--bb-muted': '#8A93A6',
      '--bb-border': 'rgba(255,255,255,0.08)',
      '--bb-edge': '#2C3547',
      '--bb-accent': '#4DA3FF',
      '--bb-bubble-in': '#232B3D',
      '--bb-bubble-out': '#1F6FEB',
      '--bb-bubble-out-text': '#FFFFFF',
      '--bb-bar': '#111725',
    },
  },
  {
    id: 'sepia',
    name: '羊皮纸',
    desc: '米黄护眼，适合读长文',
    vars: {
      '--bb-bg': '#F3EBDD',
      '--bb-card': '#FBF6EC',
      '--bb-text': '#3B2F23',
      '--bb-muted': '#8B7A63',
      '--bb-border': 'rgba(80,60,40,0.14)',
      '--bb-edge': '#C6B393',
      '--bb-accent': '#A9703A',
      '--bb-bubble-in': '#EADFC9',
      '--bb-bubble-out': '#A9703A',
      '--bb-bubble-out-text': '#FFF7EC',
      '--bb-bar': '#F6EEDF',
    },
  },
  {
    id: 'sakura',
    name: '樱灰',
    desc: '低饱和粉灰调',
    vars: {
      '--bb-bg': '#F7F1F3',
      '--bb-card': '#FFFFFF',
      '--bb-text': '#33262C',
      '--bb-muted': '#9A8792',
      '--bb-border': 'rgba(120,80,100,0.10)',
      '--bb-edge': '#D6C3CC',
      '--bb-accent': '#D4668A',
      '--bb-bubble-in': '#F0E4E9',
      '--bb-bubble-out': '#D4668A',
      '--bb-bubble-out-text': '#FFFFFF',
      '--bb-bar': '#FBF5F7',
    },
  },
  {
    id: 'forest',
    name: '松墨',
    desc: '深绿低明度',
    vars: {
      '--bb-bg': '#101A16',
      '--bb-card': '#16231D',
      '--bb-text': '#DDE9E2',
      '--bb-muted': '#7F958A',
      '--bb-border': 'rgba(255,255,255,0.08)',
      '--bb-edge': '#2C3B34',
      '--bb-accent': '#4CAF82',
      '--bb-bubble-in': '#1E2E27',
      '--bb-bubble-out': '#2E7D5B',
      '--bb-bubble-out-text': '#FFFFFF',
      '--bb-bar': '#121F19',
    },
  },
];

export const DEFAULT_THEME: ThemeConfig = {
  presetId: 'midnight',
  scope: 'global',
  customCss: '',
  fonts: [],
  activeFontId: null,
  wallpaper: null,
  wallpaperAlpha: 0.45,
  enabled: true,
};

export function loadTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return DEFAULT_THEME;
    const d = JSON.parse(raw) as Partial<ThemeConfig>;
    return { ...DEFAULT_THEME, ...d, fonts: Array.isArray(d.fonts) ? d.fonts : [] };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(cfg: ThemeConfig): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {
    /* 忽略配额错误 */
  }
}

/* ------------------------------ 样式注入 ------------------------------ */

const STYLE_ID = 'bb-theme-runtime';
const FONT_ID = 'bb-theme-fonts';
const CUSTOM_ID = 'bb-theme-custom';

function upsertStyle(id: string, css: string): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function presetOf(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/**
 * 需要接管的 Tailwind 类 → 主题变量。
 * 只列**语义中立**的类；红色徽标、暖色卡片这类携带语义的颜色不接管，
 * 否则换个主题连「未读/警告」的含义都会变。
 */
const OVERRIDE_MAP: [sel: string, decl: string][] = [
  // 排除 .rounded-full：开关滑块、小圆点这类装饰件必须是纯白，跟着卡片变暗就会看不见
  ['.bg-white:not(.rounded-full)', 'background-color:var(--bb-card)!important'],
  ['.bg-black\\/\\[0\\.06\\]', 'background-color:var(--bb-border)!important'],
  ['.bg-\\[\\#F2F2F7\\]', 'background-color:var(--bb-bg)!important'],
  ['.bg-\\[\\#F9F9F9\\]', 'background-color:var(--bb-bar)!important'],
  // 带透明度修饰符的写法类名不同，得单独列（如导航条 bg-[#F9F9F9]/95）
  ['.bg-\\[\\#F9F9F9\\]\\/95', 'background-color:var(--bb-bar)!important'],
  ['.border-black\\/\\[0\\.0[5-9]\\]', 'border-color:var(--bb-border)!important'],
  ['.active\\:bg-black\\/\\[0\\.06\\]:active', 'background-color:var(--bb-border)!important'],
  ['.bg-\\[\\#E9E9EB\\]', 'background-color:var(--bb-bubble-in)!important'],
  ['.bg-\\[\\#007AFF\\]', 'background-color:var(--bb-bubble-out)!important;color:var(--bb-bubble-out-text)!important'],
  ['.text-black', 'color:var(--bb-text)!important'],
  ['.text-\\[\\#000000\\]', 'color:var(--bb-text)!important'],
  ['.text-\\[\\#3C3C43\\]', 'color:var(--bb-text)!important'],
  ['.text-\\[\\#8e8e93\\]', 'color:var(--bb-muted)!important'],
  ['.text-\\[\\#007AFF\\]', 'color:var(--bb-accent)!important'],
  ['.border-\\[\\#C7C7CC\\]', 'border-color:var(--bb-edge)!important'],
  ['.border-black\\/\\[0\\.06\\]', 'border-color:var(--bb-border)!important'],
  ['.disabled\\:bg-\\[\\#C7C7CC\\]:disabled', 'background-color:var(--bb-edge)!important'],
];

/** #RRGGBB → rgba(...)，用于壁纸遮罩 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function buildThemeCss(cfg: ThemeConfig): string {
  const preset = presetOf(cfg.presetId);
  const vars = Object.entries(preset.vars).map(([k, v]) => `${k}:${v}`).join(';');
  const activeFont = cfg.fonts.find((f) => f.id === cfg.activeFontId);
  const fontDecl = activeFont
    ? `--bb-font:${JSON.stringify(activeFont.family)},system-ui,-apple-system,"PingFang SC",sans-serif;`
    : '--bb-font:inherit;';

  const mask = hexToRgba(preset.vars['--bb-bg'] ?? '#FFFFFF', cfg.wallpaperAlpha);
  const wallDecl = cfg.wallpaper
    ? `--bb-wall:url("${cfg.wallpaper}");--bb-wall-mask:${mask};`
    : '--bb-wall:none;--bb-wall-mask:transparent;';

  const rootSel = cfg.scope === 'global' ? ':root' : '[data-bb-phone="1"]';
  const rules = OVERRIDE_MAP.map(([sel, decl]) => {
    // 全局作用域时直接命中类；手机作用域时限定在小手机内部，避免污染其它页面
    const target = cfg.scope === 'global' ? sel : `[data-bb-phone="1"] ${sel}`;
    return `${target}{${decl}}`;
  }).join('\n');

  // 没有启用任何自定义字体时就别发 font-family 规则——
  // 否则 --bb-font:inherit 会把整站的字体打回浏览器默认。
  const fontRule = !activeFont
    ? ''
    : cfg.scope === 'global'
      ? '*{font-family:var(--bb-font)!important}'
      : '[data-bb-phone="1"] *{font-family:var(--bb-font)!important}';

  // 壁纸铺在「屏幕」层（PhoneShell 内容区），这层下面是各页面自己的背景
  const wallRule = cfg.wallpaper
    ? `[data-bb-screen="1"]{background-image:linear-gradient(var(--bb-wall-mask),var(--bb-wall-mask)),var(--bb-wall);
        background-size:cover;background-position:center;background-repeat:no-repeat;}`
    : '';

  return `${rootSel}{${vars};${fontDecl}${wallDecl}}\n${fontRule}\n${wallRule}\n${rules}`;
}

function buildFontCss(cfg: ThemeConfig): string {
  return cfg.fonts
    .map(
      (f) =>
        `@font-face{font-family:${JSON.stringify(f.family)};` +
        `src:url("${f.href}") format("truetype");` +
        `font-weight:${f.weight ?? 'normal'};font-style:${f.style ?? 'normal'};font-display:swap;}`,
    )
    .join('\n');
}

/** 把配置写进 DOM。纯函数式，重复调用幂等。 */
export function applyTheme(cfg: ThemeConfig): void {
  if (typeof document === 'undefined') return;
  if (!cfg.enabled) {
    uninstallTheme();
    return;
  }
  upsertStyle(STYLE_ID, buildThemeCss(cfg));
  upsertStyle(FONT_ID, buildFontCss(cfg));
  upsertStyle(CUSTOM_ID, cfg.customCss.trim() ? `/* 用户自定义 CSS */\n${cfg.customCss}` : '');
}

/** 彻底卸载（组件卸载 / 用户关闭主题时调用） */
export function uninstallTheme(): void {
  if (typeof document === 'undefined') return;
  for (const id of [STYLE_ID, FONT_ID, CUSTOM_ID]) document.getElementById(id)?.remove();
}

/* ------------------------------ React Hook ------------------------------ */

export function useThemeEngine() {
  const [cfg, setCfg] = useState<ThemeConfig>(() => loadTheme());

  useEffect(() => {
    applyTheme(cfg);
    saveTheme(cfg);
  }, [cfg]);

  /**
   * 注意：**不在卸载时卸载样式**。
   * 外观是全局设置，离开「我」页或关掉小手机后配色必须留着；
   * 只有用户主动把「启用自定义外观」关掉时才 uninstall（见 applyTheme）。
   */
  const patch = (p: Partial<ThemeConfig>) => setCfg((c) => ({ ...c, ...p }));
  return { cfg, setCfg, patch, presets: PRESETS };
}

/* ------------------------------ 字体 / 壁纸工具 ------------------------------ */

export function addFont(
  fonts: FontEntry[],
  input: { family: string; source: FontSource; href: string; weight?: string; style?: 'normal' | 'italic' },
): FontEntry[] {
  const entry: FontEntry = {
    id: `font-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    family: input.family.trim() || '自定义字体',
    source: input.source,
    href: input.href.trim(),
    weight: input.weight,
    style: input.style,
  };
  return [...fonts, entry];
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`读取失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

export const fontFileToDataUrl = toDataUrl;
export const imageToDataUrl = toDataUrl;

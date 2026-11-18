import { create } from 'zustand';

/**
 * 聊天气泡配色（2026-11-18 三十五改，用户开放气泡颜色）：
 * 五套主题 = index.css 里的 .bubble-* 类（覆盖 --chat-me / --chat-ai 及其字色，浅深两档）。
 * classic 是原版极简黑白（不加任何类）。挂 html 元素上，切主题不用重渲染聊天页。
 */

export type BubbleTheme = 'classic' | 'rose' | 'peach' | 'mint' | 'lavender';

export const BUBBLE_THEMES: {
  key: BubbleTheme;
  name: string;
  /** swatch 两色：己方气泡底 / 对方气泡底（设置里的预览圆点） */
  swatch: [string, string];
}[] = [
  { key: 'classic', name: '经典黑白', swatch: ['#1A1A1A', '#FFFFFF'] },
  { key: 'rose', name: '玫瑰粉', swatch: ['#C97485', '#FDEFF1'] },
  { key: 'peach', name: '蜜桃橘', swatch: ['#D98E5F', '#FDF3EA'] },
  { key: 'mint', name: '薄荷绿', swatch: ['#5E9C8B', '#EDF7F3'] },
  { key: 'lavender', name: '雾紫', swatch: ['#8B7FB8', '#F3F1FA'] },
];

const KEY = 'bubble-theme';
const ALL_CLASSES = BUBBLE_THEMES.filter((t) => t.key !== 'classic').map((t) => `bubble-${t.key}`);

function apply(key: BubbleTheme) {
  const el = document.documentElement;
  el.classList.remove(...ALL_CLASSES);
  if (key !== 'classic') el.classList.add(`bubble-${key}`);
}

function readStored(): BubbleTheme {
  try {
    const v = localStorage.getItem(KEY) as BubbleTheme | null;
    return v && BUBBLE_THEMES.some((t) => t.key === v) ? v : 'classic';
  } catch {
    return 'classic';
  }
}

interface BubbleThemeState {
  theme: BubbleTheme;
  setTheme: (t: BubbleTheme) => void;
}

export const useBubbleTheme = create<BubbleThemeState>((set) => ({
  theme: readStored(),
  setTheme: (t) => {
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    set({ theme: t });
  },
}));

// 模块加载即应用一次：聊天页直开也能拿到上次选的主题
apply(readStored());

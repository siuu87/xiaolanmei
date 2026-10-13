import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
/** 数字字体预设：serif = 飘逸衬线（Playfair），sans = 现代无衬线（Inter） */
export type NumFont = 'serif' | 'sans';
export type Accent = 'blue' | 'violet' | 'rose' | 'teal' | 'amber';

/** 强调色预设：key → HSL（同时写入 --primary 与 --ring；ins 风已调柔） */
export const ACCENT_HSL: Record<Accent, string> = {
  blue: '214 70% 55%',
  violet: '260 60% 62%',
  rose: '350 65% 68%',
  teal: '170 45% 44%',
  amber: '36 70% 54%',
};

export const ACCENT_PRESETS: { key: Accent; name: string }[] = [
  { key: 'blue', name: '蓝莓蓝' },
  { key: 'violet', name: '紫罗兰' },
  { key: 'rose', name: '玫瑰粉' },
  { key: 'teal', name: '薄荷绿' },
  { key: 'amber', name: '暖琥珀' },
];

interface AppState {
  theme: Theme;
  numFont: NumFont;
  accent: Accent;
  setTheme: (theme: Theme) => void;
  setNumFont: (numFont: NumFont) => void;
  setAccent: (accent: Accent) => void;
}

/** 全局应用状态（主题、强调色、字体），localStorage 持久化 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'light',
      numFont: 'serif',
      accent: 'blue',
      setTheme: (theme) => set({ theme }),
      setNumFont: (numFont) => set({ numFont }),
      setAccent: (accent) => set({ accent }),
    }),
    {
      name: 'blueberry.app',
      version: 3,
      migrate: (persisted, from) => {
        // 清理旧版手动填的 tokenBudget / accountBalance（余额已改为后端自动查询，不再本地存）
        const s = (persisted ?? {}) as Record<string, unknown>;
        const next: Record<string, unknown> = { ...s };
        delete next.tokenBudget;
        delete next.accountBalance;
        /**
         * v3：全局默认主题由深色改为浅色（chat 页按参考图做了暖白改造）。
         * 只改默认值没用——老用户 localStorage 里存着 theme:'dark'，会被持久化覆盖回去，
         * 所以在这里显式改一次；之后用户自己切回深色仍然会被尊重（不会再动）。
         */
        if ((from ?? 0) < 3) next.theme = 'light';
        return next as unknown as AppState;
      },
    },
  ),
);

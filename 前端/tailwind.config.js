import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // 覆盖层页面统一底：所有二级页面都铺这一层不透明底（在 index.css 的 --page-* 里）
        page: {
          bg: 'hsl(var(--page-bg))',
          line: 'hsl(var(--page-line))',
        },
        // 阅读主题（一起读）：米白纸面 / 暗夜 / 墨色
        paper: '#FBF7F0',
        night: '#1A1A1F',
        ink: '#2E2A26',
        'ink-night': '#E8E4DD',
        // chat 页专用调色板：浅色 = 参考图的暖白 + 玫瑰，深色另一档（都在 index.css 的 --chat-* 里）
        chat: {
          bg: 'hsl(var(--chat-bg))',
          bar: 'hsl(var(--chat-bar))',
          pill: 'hsl(var(--chat-pill))',
          'pill-fg': 'hsl(var(--chat-pill-fg))',
          line: 'hsl(var(--chat-line))',
          me: 'hsl(var(--chat-me))',
          'me-fg': 'hsl(var(--chat-me-fg))',
          ai: 'hsl(var(--chat-ai))',
          'ai-fg': 'hsl(var(--chat-ai-fg))',
          meta: 'hsl(var(--chat-meta))',
          quote: 'hsl(var(--chat-quote))',
          'quote-line': 'hsl(var(--chat-quote-line))',
          accent: 'hsl(var(--chat-accent))',
          'accent-fg': 'hsl(var(--chat-accent-fg))',
          'call-in': 'hsl(var(--chat-call-in))',
          'call-out': 'hsl(var(--chat-call-out))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Playfair Digits', 'Inter', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
        // 信箱「深夜来信 Live」卡片专用：复古优雅的衬线体
        letter: ['"Averia Serif Libre"', '"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [animate],
};

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
        // 抬升面板：比页面底更亮一档，用于卡片 / 抽屉内块 / 弹层（深浅色各自定义）
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          2: 'hsl(var(--surface-2))',
          3: 'hsl(var(--surface-3))',
          sunken: 'hsl(var(--surface-sunken))',
        },
        // 弹层纯色背板（不透明，替代半透明黑遮罩）
        scrim: 'hsl(var(--scrim))',
        // 品牌辅助色：陶土主调 / 余晖金 / 蓝莓墨
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          soft: 'hsl(var(--brand-soft))',
          ink: 'hsl(var(--brand-ink))',
        },
        gold: {
          DEFAULT: 'hsl(var(--gold))',
          soft: 'hsl(var(--gold-soft))',
          on: 'hsl(var(--on-gold))',
        },
        // 阅读主题（一起读）：米白纸面 / 暗夜 / 墨色（跟随主题换档）
        paper: 'hsl(var(--paper))',
        night: 'hsl(var(--night))',
        ink: 'hsl(var(--ink))',
        'ink-night': 'hsl(var(--ink-night))',
        // 小手机（iOS 外壳）：独立的一套配色，不随全站深浅主题切换，
        // 由 themeCore 的 --bb-* 预设单独控制；这里只做默认值映射
        phone: {
          bg: 'hsl(var(--phone-bg))',
          surface: 'hsl(var(--phone-surface))',
          nav: 'hsl(var(--phone-nav))',
          ink: 'hsl(var(--phone-ink))',
          muted: 'hsl(var(--phone-muted))',
          sep: 'hsl(var(--phone-sep))',
          blue: 'hsl(var(--phone-blue))',
          'bubble-me': 'hsl(var(--phone-bubble-me))',
          'bubble-ai': 'hsl(var(--phone-bubble-ai))',
          grouped: 'hsl(var(--phone-grouped))',
        },
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
        // 浅灰韩系：全站统一无衬线，数字按设置可切回 Playfair（见 index.css 的 --font-sans-stack）
        sans: ['Inter', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        // 眉标 / 小标题沿用同一套无衬线，仅靠字距与字重区分
        serif: ['Inter', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        // 页面标题：无衬线 + 收紧字距（.display 里有 letter-spacing）
        display: ['Inter', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        // 信箱「深夜来信 Live」卡片专用：复古优雅的衬线体
        letter: ['"Averia Serif Libre"', '"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        paper: '0 1px 0 hsl(0 0% 100% / 0.7) inset, 0 8px 24px -20px hsl(var(--shadow-color) / 0.26)',
        lift: '0 10px 28px -18px hsl(var(--shadow-color) / 0.3)',
        glow: '0 0 20px -6px hsl(var(--glow) / 0.3)',
      },
      keyframes: {
        'soft-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
      },
      animation: {
        'soft-float': 'soft-float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};

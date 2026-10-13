import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatNoteDate, type InspirationNote } from './notesData';

/**
 * 「深夜来信 Live」Daily Card
 *
 * 视觉规范：
 * - 容器：圆角 18px，暗色毛玻璃（午夜蓝半透明）+ 1px 极细高光边框 + 柔和外阴影；
 * - 顶部状态栏：左侧胶囊标签「深夜来信 Live」带情绪微光点，右侧信件时间（等宽数字）；
 * - 主视觉 + 标题：标题用 Averia Serif Libre 衬线体，字号稍大、排版疏朗；
 * - 正文：2~3 行摘要，行距与字距舒适，底部渐变截断；
 * - 底部：左侧心境小标签，右侧轻量火漆印章微光图标；
 * - 点击整张卡片 → 沉浸式全屏信件阅读器（/letter/:id）。
 *
 * 纯视觉组件，不读取任何本地真实文件。
 */

/** 收信时间：2026.10.13 01:20 */
export function formatMailTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

/** 取首句当标题（遇到句号/问号/叹号/换行就断），太长就截断 */
export function mailTitle(note: InspirationNote): string {
  const first = note.content.split(/[。！？!?\n]/)[0].trim();
  if (!first) return '一封没写标题的信';
  return first.length > 18 ? `${first.slice(0, 17)}…` : first;
}

/** 心境小标签：按时段 + 内容里的天气/夜色意象 */
export function mailMoodTag(note: InspirationNote): string {
  const h = new Date(note.createdAt).getHours();
  if (/雨|雪/.test(note.content)) return '🌧️ 雨夜微风';
  if (/风|云/.test(note.content)) return '🍃 晚风徐来';
  if (h >= 22 || h < 5) return '📻 磁带白噪音';
  if (h < 11) return '🌤️ 晨光微露';
  if (h < 18) return '☕ 午后慢递';
  return '🌆 黄昏信箱';
}

/* ------------------------------ 单张卡片 ------------------------------ */

export function DailyLetterCard({
  note,
  unread,
  onClick,
}: {
  note: InspirationNote;
  unread: boolean;
  onClick: () => void;
}) {
  const title = useMemo(() => mailTitle(note), [note]);
  const mood = useMemo(() => mailMoodTag(note), [note]);
  const time = useMemo(() => formatMailTime(note.createdAt), [note]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`阅读 ${formatNoteDate(note.createdAt)} 的深夜来信`}
      data-testid="daily-letter-card"
      data-note-id={note.id}
      whileTap={{ scale: 0.985 }}
      className={cn(
        'group relative block w-full overflow-hidden rounded-[18px] border border-white/[0.09]',
        'bg-[#0f1424]/70 p-3.5 text-left backdrop-blur-xl',
        'shadow-[0_10px_30px_-14px_rgba(0,0,0,0.65)] transition-all duration-300',
        'hover:-translate-y-[2px] hover:border-white/[0.16] hover:bg-[#131a2c]/80',
        'hover:shadow-[0_16px_38px_-14px_rgba(0,0,0,0.75)]',
      )}
    >
      {/* 顶部极细高光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      {/* 顶部状态栏 */}
      <div className="flex items-center justify-between gap-2">
        <span
          data-testid="mail-live-pill"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.06] px-2 py-[3px]"
        >
          <span
            aria-hidden
            data-testid="mail-live-dot"
            className="block h-1 w-1 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))]"
          />
          <span className="font-letter text-[10px] leading-none tracking-wide text-[#c3cade]">
            深夜来信 Live
          </span>
        </span>
        <span
          data-testid="mail-time"
          className="truncate text-[10px] font-light tabular-nums text-[#6b7488]"
        >
          {time}
        </span>
      </div>

      {/* 主视觉：极简夜空 + 月亮微光 */}
      <div
        data-testid="mail-cover"
        className="relative mt-3 h-[72px] overflow-hidden rounded-[12px] bg-gradient-to-b from-[#242e4b] via-[#171e33] to-[#101726]"
      >
        <span
          aria-hidden
          className="absolute right-4 top-3 block h-7 w-7 rounded-full bg-gradient-to-br from-[#f7e6ba] to-[#e0c489] opacity-90 shadow-[0_0_22px_6px_rgba(247,230,186,0.18)]"
        />
        {['left-[18%] top-[26%]', 'left-[34%] top-[62%]', 'left-[52%] top-[20%]'].map((pos) => (
          <span
            key={pos}
            aria-hidden
            className={cn('absolute block h-[2px] w-[2px] rounded-full bg-white/60', pos)}
          />
        ))}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0e1322] to-transparent"
        />
      </div>

      {/* 标题 + 摘要 */}
      <div className="mt-3">
        <h3
          data-testid="mail-title"
          className="line-clamp-2 font-letter text-[18px] font-normal leading-snug tracking-[0.01em] text-[#e8ecf6]"
        >
          {title}
        </h3>
        <div className="relative mt-1.5">
          <p
            data-testid="mail-summary"
            className="line-clamp-3 text-[12px] leading-[19px] tracking-[0.015em] text-[#98a1b6]"
          >
            {note.content}
          </p>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-[#0e1322] via-[#0e1322]/80 to-transparent"
        />
        </div>
      </div>

      {/* 底部：心境标签 + 火漆印章 */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {unread && (
            <span
              aria-label="未读"
              data-testid="mail-unread-dot"
              className="block h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
            />
          )}
          <span
            data-testid="mail-mood"
            className="truncate rounded-full bg-white/[0.04] px-2 py-[3px] text-[9px] font-light tracking-wide text-[#7f879b]"
          >
            {mood}
          </span>
        </span>
        <span
          aria-hidden
          data-testid="mail-seal"
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            'bg-gradient-to-br from-[#b4554c] to-[#8d3b34] text-[10px] text-white/95',
            'shadow-[0_0_12px_-2px_rgba(180,85,76,0.7)] transition-transform duration-300',
            'group-hover:scale-105',
          )}
        >
          🫐
        </span>
      </div>
    </motion.button>
  );
}

/* ------------------------------ 横向卡片流 ------------------------------ */

/**
 * 横向平滑滑动的卡片流：一张卡片 = 一封来信，左右滑动翻阅。
 * `maxLetters` 限制几张（抽屉里地方小，只放最近 5 封，其余走「全部」）。
 */
export function LetterSwiper({
  notes,
  readIds,
  onOpen,
  maxLetters,
  emptyHint = '还没有来信，稍后再来看看吧',
}: {
  notes: InspirationNote[];
  readIds: string[];
  onOpen: (id: string) => void;
  maxLetters?: number;
  emptyHint?: string;
}) {
  const list = maxLetters ? notes.slice(0, maxLetters) : notes;
  const [active, setActive] = useState(0);

  if (list.length === 0) {
    return (
      <div className="py-4 text-center text-[10px] text-muted-foreground/60" data-testid="mail-empty">
        {emptyHint}
      </div>
    );
  }

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 12 : el.clientWidth;
    setActive(Math.max(0, Math.min(list.length - 1, Math.round(el.scrollLeft / step))));
  };

  return (
    <div data-testid="mail-swiper">
      <div
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="mail-scroller"
      >
        {list.map((n, i) => (
          <div key={n.id} className="w-[78%] shrink-0 snap-center" data-testid="mail-slide" data-slide-index={i}>
            <DailyLetterCard note={n} unread={!readIds.includes(n.id)} onClick={() => onOpen(n.id)} />
          </div>
        ))}
      </div>

      {/* 页码点 */}
      {list.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1" data-testid="mail-dots">
          {list.map((n, i) => (
            <span
              key={n.id}
              className={cn(
                'h-1 rounded-full transition-all duration-300',
                i === active ? 'w-3 bg-primary' : 'w-1 bg-white/20',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

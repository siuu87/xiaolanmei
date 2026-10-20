import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatNoteDate, normalizeLetterTheme, type InspirationNote } from './notesData';
import { letterParts } from './LetterArt';
import { EnvelopeArt } from './LetterEnvelope';

/**
 * 「深夜来信」信封卡（2026-10-20 重做）
 *
 * 用户要求：「每个信封都是一个卡片，参考恋与制作人的心动邀约的信封，点开是一个弹窗」。
 * 所以这里不再是「封面图 + 标题 + 摘要」的那种信息卡，而是**一枚信封本身就是卡片**：
 *
 * - 卡片主体 = `EnvelopeArt`（背板 / 信纸 / 前面板倒 V 口 / 可翻开的封盖 / 火漆 / 丝带）；
 * - **已读的信封盖是翻开的**（能看见里面的信纸），未读的还是封着的 —— 一眼能分出看过没有，
 *   这是信封造型比普通卡片最值钱的地方；
 * - 信封上只留最少的字：顶部「深夜来信 · 第 N 封」，下面日期与心境标签；
 * - 火漆印跟着 `letter_theme` 换色（素雅暗红 / 纪念日金箔 / 夜色银蓝）。
 *
 * 点整张卡 → 弹窗（`LetterReaderLayer`），不再跳整页路由。
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

/* ------------------------------ 单张信封卡 ------------------------------ */

export function DailyLetterCard({
  note,
  unread,
  seq,
  onClick,
}: {
  note: InspirationNote;
  unread: boolean;
  /** 第几封（1 = 最早那封） */
  seq?: number;
  onClick: () => void;
}) {
  const title = useMemo(() => mailTitle(note), [note]);
  const mood = useMemo(() => mailMoodTag(note), [note]);
  const time = useMemo(() => formatMailTime(note.createdAt), [note]);
  const theme = normalizeLetterTheme(note.letterTheme);
  const parts = letterParts(theme);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`拆开 ${formatNoteDate(note.createdAt)} 的深夜来信`}
      data-testid="letter-card"
      data-note-id={note.id}
      data-letter-theme={theme}
      data-unread={unread ? '1' : '0'}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'group block w-full text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
      )}
    >
      {/* 卡片外壳：深色玻璃托底，让暖色信封在上面「浮」出来 */}
      <div
        className={cn(
          'relative overflow-hidden rounded-[16px] border border-white/[0.08] p-2.5',
          'bg-[#0f1424]/70 backdrop-blur-xl',
          'shadow-[0_10px_26px_-14px_rgba(0,0,0,0.7)] transition-all duration-300',
          'group-hover:-translate-y-[2px] group-hover:border-white/[0.16]',
          'group-hover:shadow-[0_16px_34px_-14px_rgba(0,0,0,0.8)]',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />

        {/* 顶栏：深夜来信 · 第 N 封 ｜ 未读点 */}
        <div className="flex items-center justify-between gap-1.5 px-0.5">
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 text-[10px] leading-none">💌</span>
            <span
              data-testid="mail-live-pill"
              className="truncate font-letter text-[10px] leading-none tracking-[0.06em] text-[#c3cade]"
            >
              深夜来信{seq ? ` · 第 ${seq} 封` : ''}
            </span>
          </span>
          {unread && (
            <span
              aria-label="未读"
              data-testid="mail-unread-dot"
              className="block h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
            />
          )}
        </div>

        {/* 信封本体：3:2 实体信封，已读的封盖半掀开（卡片里空间小，掀到底会被裁掉） */}
        <div className="mt-2 px-0.5">
          <EnvelopeArt
            theme={theme}
            opened={!unread}
            flapAngle={88}
            sealClass="h-5 w-5 text-[9px]"
            className="aspect-[3/2] w-full"
          >
            {/* 信封口里露出的那一小截：首句 */}
            <p
              data-testid="mail-summary"
              className={cn(
                'px-2 pt-2 text-[8px] leading-[13px] tracking-[0.02em]',
                parts.ink,
                'opacity-75',
              )}
            >
              {title}
            </p>
          </EnvelopeArt>
        </div>

        {/* 底部：日期 + 心境 */}
        <div className="mt-2 flex items-center justify-between gap-1.5 px-0.5">
          <span
            data-testid="mail-time"
            className="truncate text-[9px] font-light tabular-nums text-[#6b7488]"
          >
            {time}
          </span>
          <span
            data-testid="mail-mood"
            className="shrink-0 truncate rounded-full bg-white/[0.05] px-1.5 py-[2px] text-[8px] font-light tracking-wide text-[#7f879b]"
          >
            {mood}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

/* ------------------------------ 信封网格 ------------------------------ */

/**
 * **每封信一枚信封卡**的网格：一行两张，像一册收着的信。
 *
 * 为什么不用原来的横向滑动流：横向流里卡片被裁掉大半（一屏只能完整看到一张），
 * 而「一枚信封」的乐趣在于**一眼看到一沓**——哪封拆过、哪封还没，扫一眼就知道。
 * 所以改成两列网格往下排。
 */
export function LetterGrid({
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

  if (list.length === 0) {
    return (
      <div
        data-testid="mail-empty"
        className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center"
      >
        <span className="text-2xl opacity-40">💌</span>
        <span className="text-[12px] text-muted-foreground/70">{emptyHint}</span>
      </div>
    );
  }

  // 第 N 封：最新的编号最大，跟抽屉收信匣一致
  const total = notes.length;

  return (
    <div
      data-testid="mail-grid"
      className="grid grid-cols-2 gap-3"
    >
      {list.map((n, i) => (
        <DailyLetterCard
          key={n.id}
          note={n}
          unread={!readIds.includes(n.id)}
          seq={total - i}
          onClick={() => onOpen(n.id)}
        />
      ))}
    </div>
  );
}

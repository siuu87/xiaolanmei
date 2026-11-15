import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/BottomSheet';
import {
  LETTER_THEMES,
  LETTER_THEME_LABEL,
  formatNoteDate,
  normalizeLetterTheme,
  type InspirationNote,
  type LetterTheme,
} from './notesData';
import { LETTER_THEME_PARTS, letterParts } from './LetterArt';
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
 * 点整张卡 → 弹窗（`LetterSheetModal`，固定尺寸信纸），不再跳整页路由。
 */

/** 收信时间：2026.10.13 01:20 */
export function formatMailTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

/**
 * 取首句当标题（遇到句号/问号/叹号/换行就断），太长就截断。
 * 2026-11-11 起长回信第一行是「亲爱的你：」、最后一行是「—— 小蓝莓」，
 * 拿它们当标题等于没写，所以先把这两行摘掉再取正文首句；旧短信没这两行时行为不变。
 */
export function mailTitle(note: InspirationNote): string {
  const lines = note.content.split('\n').map((l) => l.trim()).filter(Boolean);
  const body = lines.filter((l, i) => {
    if (i === 0 && /[:：]$/.test(l) && l.length <= 12) return false; // 称呼
    if (i === lines.length - 1 && /^[—–－-]/.test(l) && l.length <= 14) return false; // 落款
    return true;
  });
  const first = (body.join('\n') || note.content).split(/[。！？!?\n]/)[0].trim();
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
  onPalette,
}: {
  note: InspirationNote;
  unread: boolean;
  /** 第几封（1 = 最早那封） */
  seq?: number;
  onClick: () => void;
  /** 点右上角那小枚调色按钮：换信封颜色（不传就不显示这个入口） */
  onPalette?: () => void;
}) {
  const title = useMemo(() => mailTitle(note), [note]);
  const mood = useMemo(() => mailMoodTag(note), [note]);
  const time = useMemo(() => formatMailTime(note.createdAt), [note]);
  const theme = normalizeLetterTheme(note.letterTheme);
  const parts = letterParts(theme);

  return (
    <div className="relative" data-testid="letter-card-wrap">
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
      {/*
        卡片外壳：**不留 padding**。信封就是这张卡本身（横版长方形顶到边缘），
        文字只贴在信封上下的窄边里 —— 以前外壳 p-2.5 会把信封挤小一圈，
        看着像"卡片里放了个小信封"，而不是"这枚信封就是卡片"。
      */}
      <div
        className={cn(
          'relative overflow-hidden rounded-[16px] border border-border',
          'bg-card',
          'shadow-[0_8px_22px_-18px_hsl(var(--shadow-color)/0.28)] transition-all duration-300',
          'group-hover:-translate-y-[2px] group-hover:border-primary/30',
          'group-hover:shadow-[0_12px_26px_-18px_hsl(var(--shadow-color)/0.34)]',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
        />

        {/* 顶栏：深夜来信 · 第 N 封 ｜ 未读点 */}
        <div className="flex items-center justify-between gap-1.5 px-2.5 pt-2.5">
          <span className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 text-[10px] leading-none">💌</span>
            <span
              data-testid="mail-live-pill"
              className="truncate font-letter text-[10px] leading-none tracking-[0.06em] text-muted-foreground"
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

        {/* 信封本体：**横版长方形**（5:3），撑满卡片宽度，已读的封盖半掀开
            （卡片里空间小，掀到底会被 overflow 裁掉，所以用 88°）。
            底边留出一点空间给压在上面的日期条。 */}
        <div className="mt-2 pb-5">
          <EnvelopeArt
            theme={theme}
            opened={!unread}
            sealSize={25}
            className="aspect-[5/3] w-full"
          >
            {/* 信封口里露出的那一小截：首句 */}
            <p
              data-testid="mail-summary"
              className={cn(
                'mx-auto max-w-full truncate px-1 pt-[3px] text-center text-[7.5px] leading-[11px] tracking-[0.02em]',
                parts.ink,
                'opacity-80',
              )}
            >
              {title}
            </p>
          </EnvelopeArt>
        </div>

        {/*
          底部：日期 + 心境 —— **压在信封底边上**，不单独占一条。
          以前放在信封下面，卡片被撑高、信封显得小，下面那条深色还空着像没渲染出来。
          现在浮在信封下沿，用与卡片同色的渐变托底，深浅主题下都读得清。
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-card via-card/85 to-transparent px-2.5 pb-1.5 pt-4">
          <span
            data-testid="mail-time"
            className="truncate text-[9px] font-light tabular-nums text-muted-foreground"
          >
            {time}
          </span>
          <span
            data-testid="mail-mood"
            className="shrink-0 truncate rounded-full bg-surface-2 px-1.5 py-[2px] text-[8px] font-light tracking-wide text-muted-foreground"
          >
            {mood}
          </span>
        </div>
      </div>
    </motion.button>

    {/* 换信封：压在卡片右上角，避免和整卡点击打架（它在外层，不嵌在 button 里） */}
    {onPalette && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPalette();
        }}
        aria-label="换一个信封颜色"
        title="换个信封"
        data-testid="letter-palette-btn"
        className="absolute right-1.5 top-[26px] z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-border/70 bg-card/85 text-muted-foreground shadow-sm transition hover:text-foreground active:scale-90"
      >
        <Palette className="h-[11px] w-[11px]" />
      </button>
    )}
    </div>
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
  onSetTheme,
  emptyHint = '还没有来信，稍后再来看看吧',
}: {
  notes: InspirationNote[];
  readIds: string[];
  onOpen: (id: string) => void;
  maxLetters?: number;
  /** 换信封颜色：不传就不显示调色入口 */
  onSetTheme?: (id: string, theme: LetterTheme) => void;
  emptyHint?: string;
}) {
  const list = maxLetters ? notes.slice(0, maxLetters) : notes;
  const [paletteFor, setPaletteFor] = useState<InspirationNote | null>(null);
  const curTheme = normalizeLetterTheme(paletteFor?.letterTheme);

  if (list.length === 0) {
    return (
      <div
        data-testid="mail-empty"
        className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2 px-5 py-10 text-center"
      >
        <span className="text-2xl opacity-40">💌</span>
        <span className="text-[12px] text-muted-foreground">{emptyHint}</span>
      </div>
    );
  }

  // 第 N 封：最新的编号最大，跟抽屉收信匣一致
  const total = notes.length;

  return (
    <>
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
            onPalette={onSetTheme ? () => setPaletteFor(n) : undefined}
          />
        ))}
      </div>

      <BottomSheet
        open={!!paletteFor}
        onOpenChange={(v) => {
          if (!v) setPaletteFor(null);
        }}
        title="换个信封"
        testid="letter-palette-sheet"
      >
        <div className="px-4 pb-6 pt-1">
          <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
            同一封信换一层纸 —— 只改信封颜色，正文一个字都不动。
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {LETTER_THEMES.map((t) => {
              const p = LETTER_THEME_PARTS[t];
              const on = t === curTheme;
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`letter-theme-${t}`}
                  onClick={() => {
                    if (paletteFor && onSetTheme) onSetTheme(paletteFor.id, t);
                    setPaletteFor(null);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-2.5 transition active:scale-95',
                    on ? 'border-primary/60 bg-primary/5' : 'border-border bg-card hover:border-border/80',
                  )}
                >
                  <span
                    className="relative flex h-9 w-9 items-center justify-center rounded-[10px] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.25)]"
                    style={{ backgroundColor: p.envSolid, border: `1px solid ${p.flapStroke}` }}
                  >
                    {/* 小封盖 + 一枚小蜡：缩略图直接照着真信封画 */}
                    <span
                      className="absolute inset-x-0 top-0 h-[45%]"
                      style={{
                        background: p.flapFill,
                        clipPath: 'polygon(0 0, 50% 100%, 100% 0)',
                        borderBottom: `1px solid ${p.flapStroke}`,
                      }}
                    />
                    <span
                      className="absolute left-1/2 top-[38%] h-[9px] w-[9px] -translate-x-1/2 rounded-full"
                      style={{ backgroundColor: p.sealBase }}
                    />
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-foreground">
                    {LETTER_THEME_LABEL[t]}
                    {on && <Check className="h-3 w-3 text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

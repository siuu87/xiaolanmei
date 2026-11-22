import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/BottomSheet';
import {
  LETTER_THEMES,
  LETTER_THEME_LABEL,
  normalizeLetterTheme,
  parseLook,
  type InspirationNote,
  type LetterTheme,
} from './notesData';
import { LETTER_THEME_PARTS, letterParts } from './LetterArt';
import { FoldedLetter } from './FoldedLetter';

/**
 * 「深夜来信」列表（2026-11-18 晚第三版：照参考图改成**一沓信**）
 *
 * 参考（用户给的图）：一个抽屉里斜斜地叠着一沓信封，每封只露出上沿一段，
 * 正中一行拉开的「TO ME」+ 底下一行小字日期，右上角一枚小邮票，封与封之间
 * 靠投影分层。整组东西是**竖向叠**的，不是网格 —— 网格像商品目录，叠起来才像信。
 *
 * 所以：
 * - 一封一张，**整宽**、`5:3`，负 margin 往上叠 25%（≈42% 高度被下一封压住），
 *   交错 ±1° 的轻微歪斜，越新越靠下、越靠前（z-index 递增）；
 * - 信封上不画火漆（参考图是信封背面那道 V 折），字排正中：
 *   `TO 你` + `2026.11.18`；
 * - 读没读**看形态**（2026-11-18 晚第六版）：**拆过的 = 撕条被整条抽走**
 *   （顶上换一层翻下来的纸背，`torn`）；没拆的 = 顶上那条撕条还封着
 *   （打孔虚线 + 封口件）。**列表里不贴邮票** —— 邮票只留给首页那格小组件
 *   （用户 2026-11-18 晚：「邮票在里面的信封上就别做了」），看没看信看形态；
 * - 换信封颜色那颗小按钮在**左上角**，避开顶上那条撕条。
 *
 * 点一整封 → 弹窗（`LetterSheetModal`）：没拆过的进去先撕（`TearOpen`）。
 */

/** 交错倾斜：读起来像随手码起来的一沓，不是排版软件里对齐的 */
const TILT = ['-0.9deg', '0.7deg', '-0.5deg', '1deg', '-0.7deg', '0.4deg'];

/** 收信时间：2026.10.13 */
function stampDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ------------------------------ 单封信 ------------------------------ */

function StackLetter({
  note,
  unread,
  index,
  full,
  tilt,
  z,
  onOpen,
  onPalette,
}: {
  note: InspirationNote;
  unread: boolean;
  /** 这是第几封（从**最早**那封数起，第 1 封在最下面） */
  index: number;
  /** 整封都露在外面（即最上面那封）：日期才放得到真·右下角 */
  full: boolean;
  tilt: string;
  z: number;
  onOpen: () => void;
  onPalette?: () => void;
}) {
  const theme = normalizeLetterTheme(note.letterTheme);
  /** 包装：纸色 + 封口件 + 压纹（后端每封挑一组，见 `pickLetterLook`） */
  const look = parseLook(note.letterLook, theme, note.id);
  const parts = letterParts(look.theme);
  /** 字要压在**露出来的那一段**里：负 margin 压掉 42% 高度，所以 40% / 52% 是安全区 */
  const inkStyle: React.CSSProperties = {
    color: parts.inkSolid,
    fontFamily: 'Georgia, "Times New Roman", serif',
  };
  const num = String(index).padStart(2, '0');

  return (
    <div
      className="relative"
      style={{ zIndex: z, transform: `rotate(${tilt})` }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${unread ? '还没拆过' : '看过'}的第 ${index} 封来信，${stampDate(note.createdAt)}`}
        data-testid="letter-card"
        data-note-id={note.id}
        data-letter-theme={look.theme}
        data-letter-charm={look.charm}
        data-unread={unread ? '1' : '0'}
        data-torn={unread ? '0' : '1'}
        className={cn(
          'group block w-full text-left transition-transform duration-300',
          'hover:-translate-y-[3px] active:translate-y-0 focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
      >
        {/* 看过的整封**褪色**（降饱和 + 压暗），没看过的保持原样 —— 光靠右上那枚邮票
            在一沓错位的信封里还是容易看漏，加一层整体色差，扫一眼就分得出来。
            用 filter 不用 opacity：透明会让底下那封的边角透上来，叠信会显脏。

            注意 filter 只套在**信封纸**上，编号/日期/调色盘留在外面：
            以前它们跟纸一起被压暗，深墨色的日期在浅色纸上直接糊成一片灰，
            用户的原话是「分辨不出哪个看过哪个没看过」——看过的信也得能读日期。 */}
        <div
          className="transition-[filter] duration-300"
          style={unread ? undefined : { filter: 'saturate(0.42) brightness(0.8)' }}
        >
          <FoldedLetter
            look={look}
            address={false}
            flatFlap
            torn={!unread}
            className="aspect-[5/3] w-full [--letter-shadow:0_18px_30px_-18px_rgba(0,0,0,0.6)]"
          />
        </div>

        {/* 左上：第几封。用衬线数字 + 一点字距，像档案袋角上盖的编号，不是 UI 标签。
            往下让了 6%：左上角 first 一格被「换信封」那颗按钮占了，17% 才开始写字，
            否则调色图标正好压在「No.」上，看着像一团墨渍。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute text-[10px] leading-none"
          style={{
            left: '6%',
            top: '17%',
            ...inkStyle,
            letterSpacing: '0.12em',
            opacity: unread ? 0.8 : 0.55,
            fontWeight: 600,
          }}
        >
          No.{num}
        </span>

        {/* 正中那行「TO 你」：位置跟参考图一样，压在上沿露出的那一段里 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[35%] text-center text-[13px] uppercase leading-none"
          style={{ ...inkStyle, letterSpacing: '0.36em', textIndent: '0.36em' }}
        >
          TO 你
        </span>

        {/* 右下：日期（不再居中压在 TO 你 底下，两个信息分开站两端）
            `full` 只有最新那封（整封都露着）为真 —— 它是真·右下角；
            其余的信被下一封压掉四成，只能贴在「露出来那一段」的右下沿。 */}
        <span
          aria-hidden
          className="pointer-events-none absolute text-[9px] leading-none"
          style={{
            right: '6%',
            top: full ? '84%' : '52%',
            /* 用正文墨色的低透明度，不用 metaSolid —— 看过的信整封被 filter 压暗，
               metaSolid 叠上去就只剩一道影子（浅色纸上尤其看不清）。
               编号走的是同一套墨色，两者淡到同一个刻度才像同一个人写上去的。 */
            color: inkStyle.color,
            opacity: unread ? 0.7 : 0.55,
            fontWeight: 500,
            letterSpacing: '0.14em',
          }}
        >
          {stampDate(note.createdAt)}
        </span>
      </button>

      {/* 换信封：左上角（右上留给邮票），不嵌在 button 里，免得点它变成拆信 */}
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
          className="absolute left-2 top-[15px] z-10 flex h-5 w-5 items-center justify-center rounded-full transition active:scale-90 opacity-70 hover:opacity-100"
          style={{ color: parts.metaSolid }}
        >
          <Palette className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------ 一沓信 ------------------------------ */

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
  /** 换色面板的选中态看的是**整套包装**里的纸色（look 的第一段才是权威） */
  const curLook = parseLook(paletteFor?.letterLook, normalizeLetterTheme(paletteFor?.letterTheme), paletteFor?.id);

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

  const unreadCount = list.filter((n) => !readIds.includes(n.id)).length;

  return (
    <>
      {/* 「抽屉」：底色比页面沉一档 + 上沿一道内阴影，像从信箱口往里看。
          里面是一沓叠着的信 —— 不是网格。 */}
      <div
        data-testid="mail-drawer"
        className="rounded-[22px] border border-border/60 bg-surface-2/60 px-3 pb-6 pt-3 shadow-[inset_0_14px_26px_-20px_rgba(0,0,0,0.55)]"
      >
        <div className="mb-2 flex items-baseline justify-between px-0.5">
          <span className="text-[10px] tracking-[0.2em] text-muted-foreground/80">收信箱</span>
          <span className="text-[9px] tracking-[0.12em] text-muted-foreground/80">
            {unreadCount > 0 ? `还有 ${unreadCount} 封没拆` : '都看过了'}
          </span>
        </div>

        <div data-testid="mail-grid" className="relative px-1">
          {list.map((n, i) => (
            <div
              key={n.id}
              /* 负 margin 用百分比：它按**容器宽度**算，所以信封不管多宽，
                 压下去的高度永远是「信封高度 × 42%」，比例不会随屏宽跑掉。
                 后一封比前一封各宽 2px（左右各外扩 2px）：信封歪着叠的时候，
                 上面那封的右/左下角会从边缝里露出来（深色主题那封尤其明显，
                 看着像一条黑色毛刺），外扩 2px 正好把它盖住。 */
              style={
                i === 0
                  ? { marginTop: 0 }
                  : { marginTop: '-25.2%', width: 'calc(100% + 4px)', marginLeft: '-2px' }
              }
            >
              <StackLetter
                note={n}
                unread={!readIds.includes(n.id)}
                /* 编号从**最早**那封数起：notes 是「新→旧」，所以拿总数减序号。
                   用 notes.length 而不是 list.length —— 截断显示时编号也不能乱。 */
                index={notes.length - i}
                full={i === list.length - 1}
                tilt={TILT[i % TILT.length]}
                z={i + 1}
                onOpen={() => onOpen(n.id)}
                onPalette={onSetTheme ? () => setPaletteFor(n) : undefined}
              />
            </div>
          ))}
        </div>
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
              const on = t === curLook.theme;
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
                  {/* 缩略图 = 一枚合着的信封背面：V 折 + 右上角一点邮票位 */}
                  <span
                    className="relative block h-9 w-9 overflow-hidden rounded-[3px] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.25)]"
                    style={{ backgroundColor: p.envSolid, border: `1px solid ${p.flapStroke}` }}
                  >
                    <span
                      className="absolute inset-x-0 top-0"
                      style={{
                        height: '48%',
                        background: `linear-gradient(to bottom right, ${p.flapFill} 49.6%, transparent 50%), linear-gradient(to bottom left, ${p.flapFill} 49.6%, transparent 50%)`,
                        borderBottom: `1px solid ${p.flapStroke}80`,
                      }}
                    />
                    <span
                      className="absolute right-[2px] top-[2px] h-[8px] w-[6px] rounded-[1px]"
                      style={{ backgroundColor: '#EDF0DC', border: '1px dashed #93A87C' }}
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

export default LetterGrid;

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate, normalizeLetterTheme, parseLook } from './notesData';
import { letterParts } from './LetterArt';
import { TearOpen } from './TearOpen';

/**
 * 信件弹窗（2026-11-18 第五版：**没拆过的进来先撕**）
 *
 * 三版走过的弯路（别再来一遍）：
 *   ① 「插在开口信封里的信纸」—— 舞台要摆背板、V 折、火漆，信纸只能塞在上半截里滚；
 *   ② 「撕条 + 锯齿」整页 —— 一撕就得画毛边、画抽出来的半张纸，复杂度全砸在动画上；
 *   ③ 「点开就是一张纸」—— 干净了，可「拆信」这件事整个消失了。
 *
 * 现在这样分工（用户定的）：
 *   **外面**（卡片 / 列表）= 常规信封，合着 = 没拆，掀开 = 拆过；
 *   **里面**（这里）= 没拆过的先给第一屏撕条（`TearOpen`：拖住往左一拉，信纸升出来），
 *                撕开落地后才换成那张信纸；拆过的再点开直接就是信纸。
 *
 * 所以「已读」不再在打开弹窗时无脑标 —— **撕开落地** 才标（`onDone`），
 * 中途退出去，这封信还是没拆的。
 *
 * 尺寸照旧写死（`min(420px,86vw) × min(560px,72vh)`）：跟正文长短无关。
 * 舞台仍是**整屏纯色不透明**（项目硬规矩：叠层不许半透明，不透出底下的对话）。
 * 三种关法：右上「收起」、点空白处、Esc（capture 阶段吃掉，别把抽屉一起关掉）。
 */

/** 手写感用系统楷体，不引外部字体：断网也稳定，不需要改 tailwind 配置 */
const HAND_FONT = '"Kaiti SC", "STKaiti", KaiTi, "楷体", "FangSong", serif';

type StarKind = 'five' | 'four' | 'cross';

/** 手绘感空心星星：坐标全部写死，不随机，免得每次渲染乱跳 */
function Star({
  kind,
  size = 22,
  color,
  opacity = 1,
  rotate = 0,
  className,
  style,
}: {
  kind: StarKind;
  size?: number;
  color: string;
  opacity?: number;
  rotate?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      className={className}
      style={{ ...style, transform: `rotate(${rotate}deg)` }}
    >
      {kind === 'five' && (
        <path d="M12 2.8 L14.7 9.1 L21.5 9.6 L16.3 14.1 L18 21.1 L12 17.3 L6 21.1 L7.7 14.1 L2.5 9.6 L9.3 9.1 Z" />
      )}
      {kind === 'four' && (
        <path d="M12 1.8 C12.8 8.4 15.6 11.2 22.2 12 C15.6 12.8 12.8 15.6 12 22.2 C11.2 15.6 8.4 12.8 1.8 12 C8.4 11.2 11.2 8.4 12 1.8 Z" />
      )}
      {kind === 'cross' && (
        <>
          <path d="M12 5 V19" />
          <path d="M5 12 H19" />
        </>
      )}
    </svg>
  );
}

type StarSpec = {
  kind: StarKind;
  x: string;
  y: string;
  size: number;
  rotate?: number;
  opacity?: number;
};

/** 舞台四周的浅色小星星（避开中间那张纸） */
const STAGE_STARS: StarSpec[] = [
  { kind: 'five', x: '7%', y: '12%', size: 25, rotate: -10, opacity: 0.7 },
  { kind: 'cross', x: '18%', y: '26%', size: 13, opacity: 0.6 },
  { kind: 'four', x: '5%', y: '40%', size: 20, opacity: 0.65 },
  { kind: 'five', x: '10%', y: '57%', size: 17, rotate: 12, opacity: 0.6 },
  { kind: 'cross', x: '6%', y: '74%', size: 14, opacity: 0.6 },
  { kind: 'four', x: '15%', y: '88%', size: 19, opacity: 0.6 },
  { kind: 'five', x: '91%', y: '10%', size: 19, rotate: 14, opacity: 0.6 },
  { kind: 'cross', x: '84%', y: '22%', size: 14, opacity: 0.6 },
  { kind: 'four', x: '94%', y: '38%', size: 21, opacity: 0.65 },
  { kind: 'five', x: '88%', y: '55%', size: 22, rotate: -8, opacity: 0.6 },
  { kind: 'cross', x: '93%', y: '70%', size: 13, opacity: 0.6 },
  { kind: 'four', x: '84%', y: '85%', size: 18, opacity: 0.6 },
];

export function LetterSheetModal({ id, onClose }: { id: string; onClose: () => void }) {
  const notes = useNotesStore((s) => s.notes);
  const loaded = useNotesStore((s) => s.loaded);
  const load = useNotesStore((s) => s.load);
  const readIds = useNotesStore((s) => s.readIds);
  const markRead = useNotesStore((s) => s.markRead);

  const note = notes.find((n) => n.id === id) ?? null;

  /** 本次弹窗里刚撕开（`markRead` 之外再兜一层：localStorage 写不进去也不至于退回去） */
  const [torn, setTorn] = useState(false);
  /**
   * 这一封信「还封着」吗。
   * - 拆过的（readIds 里有）→ 直接给信纸；
   * - 没拆过的 → 先给撕条那一屏；
   * - 信还没取回来（`loaded=false`）→ 先不当封着，免得深链刷新时先闪一下「封着的信封」。
   */
  const sealed = loaded && !!note && !readIds.includes(id) && !torn;

  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLParagraphElement>(null);
  /** 正文比纸长时给一个「继续往下读」的小提示，纸本身绝不长高 */
  const [scrollable, setScrollable] = useState(false);

  // 直达（刷新在 /letter/xxx）时先把信拉下来
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // Esc 关。抽屉里也可能点开这层，capture 阶段吃掉，别让抽屉跟着一起关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /* 信纸跟着**信封那套包装的纸色**走，不是单独一个 theme ——
     不然换过包装的信，信封是苔绿、抽出来的纸还是米白 */
  const theme = parseLook(note?.letterLook, normalizeLetterTheme(note?.letterTheme), note?.id).theme;
  const parts = letterParts(theme);
  // 长回信正文自带「—— 小蓝莓」落款，右下角就别再印一次名字
  const hasSignature = /^\s*[—–－-]{1,2}\s*.{1,12}\s*$/m.test(note?.content ?? '');

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollHeight > el.clientHeight + 6);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // 字体晚到 / 正文变长都会撑高内容，只盯容器会漏判
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [note?.id, note?.content]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center px-4"
      data-testid="letter-page"
      data-letter-theme={theme}
      data-opened={sealed ? '0' : '1'}
    >
      {/* 舞台：整屏纯色不透明，点空白收起 */}
      <div
        onClick={onClose}
        data-testid="letter-page-mask"
        className="absolute inset-0"
        style={{ backgroundColor: parts.stage }}
      />

      {/* 背景浅星点 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {STAGE_STARS.map(({ x, y, ...spec }, i) => (
          <Star
            key={i}
            {...spec}
            color={theme === 'night' ? '#3E4A68' : '#C9D6E6'}
            className="absolute"
            style={{ left: x, top: y }}
          />
        ))}
      </div>

      {/* 右上角关闭：整屏叠层必须有带文字的退出键，不能只靠 Esc。
          z-20 在撕开层（z-15）之上 —— 不想撕的人可以随时跳过。 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="收起这封信"
        data-testid="letter-page-close"
        className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-medium transition active:scale-95"
        style={{ backgroundColor: parts.paperSolid, borderColor: parts.flapStroke, color: parts.metaSolid }}
      >
        <X size={14} />
        收起
      </button>

      {/* 第一屏：**还封着的信** —— 拖住撕条往左一拉（`TearOpen`）。
          撕开落地才标已读、才换信纸；中途关掉，这封信还是没拆的。
          撕条层 z-15 在「收起」按钮（z-20）之下：不想拆的随时能走。
          `bare`：底色用弹窗这层舞台（同色 + 星点），别盖成一块黑板。 */}
      {sealed && (
        <TearOpen
          theme={theme}
          dateText={note ? formatNoteDate(note.createdAt) : undefined}
          bare
          onDone={() => {
            setTorn(true);
            markRead(id);
          }}
          onSkip={onClose}
        />
      )}

      {/* 这张纸：尺寸写死，正文长短不影响宽高。拆过 / 刚撕开的才给。 */}
      {!sealed && (
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{ duration: 0.34, ease: 'easeOut' }}
        data-testid="letter-sheet"
        className="relative z-10 shrink-0"
        style={{ width: 'min(420px, 86vw)', height: 'min(560px, 72vh)' }}
      >
        <div
          data-testid="letter-paper"
          className="absolute inset-0 overflow-hidden rounded-[3px]"
          style={{
            backgroundColor: parts.paperSolid,
            border: `1px solid ${parts.flapStroke}`,
            boxShadow: '0 18px 48px -24px rgba(0,0,0,0.5)',
          }}
        >
          {/* 正文：整张纸都能滚（以前下半截被信封前面板挡着，只能在上半截里滚） */}
          <div
            ref={bodyRef}
            className="absolute inset-0 flex flex-col overflow-y-auto overscroll-contain px-7 pt-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ paddingBottom: 28 }}
          >
            <span
              aria-hidden
              className="block shrink-0 select-none"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 44,
                lineHeight: '0.8',
                color: parts.metaSolid,
                opacity: 0.45,
              }}
            >
              “
            </span>

            {note ? (
              <p
                ref={contentRef}
                className="mt-3 shrink-0 whitespace-pre-wrap break-words"
                style={{
                  fontFamily: HAND_FONT,
                  fontSize: 15,
                  lineHeight: 2,
                  letterSpacing: '0.03em',
                  color: parts.inkSolid,
                }}
              >
                {note.content}
              </p>
            ) : (
              <p className="mt-3 shrink-0 text-[13px]" style={{ fontFamily: HAND_FONT, color: parts.metaSolid }}>
                {loaded ? '这封信找不到了' : '取信中…'}
              </p>
            )}

            {/* 短信时 mt-auto 把日期/落款压到纸底；长信时自动退成正文后的普通留白 */}
            {note && (
              <div
                className="mt-auto flex shrink-0 flex-col items-end gap-1 pt-6"
                style={{ fontFamily: HAND_FONT, fontSize: 11, color: parts.metaSolid }}
              >
                <span>{formatNoteDate(note.createdAt)}</span>
                <span>{hasSignature ? '深夜来信' : NOTE_AUTHOR}</span>
              </div>
            )}
          </div>

          {scrollable && (
            <span
              className="pointer-events-none absolute bottom-2.5 right-4 text-[10px]"
              style={{ color: parts.metaSolid, fontFamily: HAND_FONT, opacity: 0.75 }}
            >
              继续往下读 ↓
            </span>
          )}
        </div>
      </motion.div>
      )}

      {/* 底部提示：封着的时候这行归 `TearOpen` 自己的引导，别两条打一架 */}
      {!sealed && (
        <span
          className="pointer-events-none absolute bottom-5 left-0 right-0 text-center text-[10px]"
          style={{ color: parts.metaSolid, fontFamily: HAND_FONT }}
        >
          轻点空白处收起
        </span>
      )}
    </div>,
    document.body,
  );
}

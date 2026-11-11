import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate, normalizeLetterTheme } from './notesData';

/**
 * 信件弹窗（2026-11-11 重做，替代旧的拆信动画层）
 *
 * 参考图是「一张插在开口信封里的信纸」：
 * - **信纸尺寸写死**（`min(420px,86vw) × min(560px,72vh)`），跟正文长短完全无关。
 *   正文只在信纸上半部的可见区里滚动，字数再多纸张也不长高、信封也不跟着往下跑。
 * - 信封后折翼在信纸后面，前面板盖住信纸下缘，蓝色空心星星画在前面板上。
 * - 舞台是**整屏纯色不透明**（项目硬规矩：叠层不许半透明，不透出底下的对话）。
 * - 三种关法：右上「收起」、点空白处、Esc（capture 阶段吃掉，别把抽屉一起关掉）。
 * - 打开即已读；直达 `/letter/:id` 刷新也能拿到信。
 */

const STAGE = '#FFFCF2';
const PAPER = '#FFFDF7';
const ENVELOPE_FRONT = '#FBF6EB';
const ENVELOPE_BACK = '#F7EFDC';
const BLUE = '#7EA3D1';
const INK = '#3B3A36';
const META = '#A39A86';
/** 手写感用系统楷体，不引外部字体：断网也稳定，不需要改 tailwind 配置 */
const HAND_FONT = '"Kaiti SC", "STKaiti", KaiTi, "楷体", "FangSong", serif';

type StarKind = 'five' | 'four' | 'cross';

/** 手绘感空心星星：坐标全部写死，不随机，免得每次渲染乱跳 */
function Star({
  kind,
  size = 22,
  color = BLUE,
  opacity = 1,
  rotate = 0,
  className,
  style,
}: {
  kind: StarKind;
  size?: number;
  color?: string;
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

/** 信封前面板上的蓝色空心星星 */
const FRONT_STARS: StarSpec[] = [
  { kind: 'five', x: '16%', y: '40%', size: 30, rotate: -10 },
  { kind: 'five', x: '79%', y: '36%', size: 27, rotate: 12 },
  { kind: 'four', x: '36%', y: '58%', size: 21 },
  { kind: 'four', x: '61%', y: '48%', size: 19, rotate: 8 },
  { kind: 'four', x: '69%', y: '72%', size: 27, rotate: -6 },
  { kind: 'five', x: '48%', y: '83%', size: 20, rotate: 14 },
  { kind: 'four', x: '24%', y: '80%', size: 17 },
];

export function LetterSheetModal({ id, onClose }: { id: string; onClose: () => void }) {
  const notes = useNotesStore((s) => s.notes);
  const loaded = useNotesStore((s) => s.loaded);
  const load = useNotesStore((s) => s.load);
  const markRead = useNotesStore((s) => s.markRead);

  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLParagraphElement>(null);
  /** 正文比纸长时给一个「继续往下读」的小提示，纸本身绝不长高 */
  const [scrollable, setScrollable] = useState(false);

  // 直达（刷新在 /letter/xxx）时先把信拉下来
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // 打开即已读
  useEffect(() => {
    if (id) markRead(id);
  }, [id, markRead]);

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

  const note = notes.find((n) => n.id === id) ?? null;
  const theme = normalizeLetterTheme(note?.letterTheme);
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
      data-opened="1"
    >
      {/* 舞台：整屏纯色不透明，点空白收起 */}
      <div
        onClick={onClose}
        data-testid="letter-page-mask"
        className="absolute inset-0"
        style={{ backgroundColor: STAGE }}
      />

      {/* 背景浅星点 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {STAGE_STARS.map(({ x, y, ...spec }, i) => (
          <Star
            key={i}
            {...spec}
            color="#C9D6E6"
            className="absolute"
            style={{ left: x, top: y }}
          />
        ))}
      </div>

      {/* 右上角关闭：整屏叠层必须有带文字的退出键，不能只靠 Esc */}
      <button
        type="button"
        onClick={onClose}
        aria-label="收起这封信"
        data-testid="letter-page-close"
        className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-medium transition active:scale-95"
        style={{ backgroundColor: '#FFFFFF', borderColor: '#DCE6F2', color: BLUE }}
      >
        <X size={14} />
        收起
      </button>

      {/* 信纸 + 信封：整块尺寸固定，正文长短不影响宽高 */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        data-testid="letter-sheet"
        className="relative z-10 shrink-0"
        style={{ width: 'min(420px, 86vw)', height: 'min(560px, 72vh)' }}
      >
        {/* 信封背板 + 后折翼（在信纸后面，露出两侧的 V 形折角） */}
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 420 560"
          preserveAspectRatio="none"
        >
          <rect x="0" y="196" width="420" height="364" fill={ENVELOPE_BACK} />
          <path d="M0 196 L210 372 L420 196 Z" fill="#FFF7E4" stroke="#EADCC0" strokeWidth="1.2" />
          <path d="M0 196 L210 372 L420 196" fill="none" stroke="#E3D2B0" strokeWidth="1.2" />
        </svg>

        {/* 信纸：固定尺寸。正文只在上方可见区里滚动，纸不会随字数变长 */}
        <div
          data-testid="letter-paper"
          className="absolute bottom-0 left-[8%] right-[8%] top-0 overflow-hidden"
          style={{ backgroundColor: PAPER, border: '1px solid #EFE7D5' }}
        >
          <div
            ref={bodyRef}
            className="absolute inset-x-0 top-0 flex flex-col overflow-y-auto overscroll-contain px-7 pt-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ bottom: '44%', paddingBottom: 22 }}
          >
            <span
              aria-hidden
              className="block shrink-0 select-none"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 44,
                lineHeight: '0.8',
                color: '#B4D0EE',
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
                  color: INK,
                }}
              >
                {note.content}
              </p>
            ) : (
              <p className="mt-3 shrink-0 text-[13px]" style={{ fontFamily: HAND_FONT, color: META }}>
                {loaded ? '这封信找不到了' : '取信中…'}
              </p>
            )}

            {/* 短信时 mt-auto 把日期/落款压到纸底；长信时自动退成正文后的普通留白 */}
            {note && (
              <div
                className="mt-auto flex shrink-0 flex-col items-end gap-1 pt-6"
                style={{ fontFamily: HAND_FONT, fontSize: 11, color: META }}
              >
                <span>{formatNoteDate(note.createdAt)}</span>
                <span>{hasSignature ? '深夜来信' : NOTE_AUTHOR}</span>
              </div>
            )}
          </div>

          {scrollable && (
            <span
              className="pointer-events-none absolute right-3 text-[10px]"
              style={{ bottom: 'calc(44% + 8px)', color: '#A9BEDA', fontFamily: HAND_FONT }}
            >
              继续往下读 ↓
            </span>
          )}
        </div>

        {/* 信封前面板：盖住信纸下缘，蓝色空心星星画在这一层 */}
        <div
          data-testid="letter-page-envelope"
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: '44%' }}
        >
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 420 246"
            preserveAspectRatio="none"
          >
            <path
              d="M0 46 Q210 6 420 46 L420 246 L0 246 Z"
              fill={ENVELOPE_FRONT}
              stroke="#E6DAC2"
              strokeWidth="1.2"
            />
            <path d="M0 246 L150 46" fill="none" stroke="#EADFC8" strokeWidth="1.2" />
            <path d="M420 246 L270 46" fill="none" stroke="#EADFC8" strokeWidth="1.2" />
          </svg>
          {FRONT_STARS.map(({ x, y, ...spec }, i) => (
            <Star key={i} {...spec} className="absolute" style={{ left: x, top: y }} />
          ))}
        </div>
      </motion.div>

      <span
        className="pointer-events-none absolute bottom-5 left-0 right-0 text-center text-[10px]"
        style={{ color: '#B6AE9B', fontFamily: HAND_FONT }}
      >
        轻点空白处收起
      </span>
    </div>,
    document.body,
  );
}

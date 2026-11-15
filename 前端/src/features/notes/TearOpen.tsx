import { useEffect, useRef, useState } from 'react';
import { letterParts, WaxSeal, type LetterTheme } from './LetterArt';

/**
 * 拆信：**按住封盖往上撕**（2026-11-16）
 *
 * 用户要的是「拆信那一瞬」——在这之前，点信封是直接跳到信纸，
 * 撕的那一下完全没有，只有结果（裂开的蜡封）。
 *
 * 交互：
 *   - 按住信封往上拖 → 封盖跟着手指走，撕口从中间向两侧长开，信纸从缺口里冒出来
 *   - 拖过 42% 松手 = 撕掉了：封盖带着火漆整片飞走，信封上留下毛边和半枚残蜡
 *   - 拖不够松手 = 回弹（信还是封着的，可以再撕）
 *   - **点一下也算拆**（位移 < 8px）：不然只用键盘 / 鼠标的人会以为没反应
 *
 * 为什么单独一个组件而不是改 `EnvelopeArt`：列表卡里的信封只要「封着 / 拆开」
 * 两个稳定状态，不该背一套手势；这里要的是连续进度，两者混在一起会互相拖累。
 *
 * **单位坑（别再犯）**：封盖和火漆都必须用「百分比」定位，不能用 px。
 * 第一版把封盖画在 SVG 里、位移写 `translateY(-96px)` —— 那是 viewBox 用户单位
 * （viewBox 高 124，实际渲染 204px），放大 1.65 倍；而火漆在 DOM 层用的是真 px。
 * 结果封盖飞了 137px、火漆只飞 76px，火漆留在信纸中间，看着像贴纸。
 * 现在两者都走 `top: X%`，百分比相对信封高度，天然同步。
 */

/** 撕口抖动点：沿 V 线上下抖，从中间（100,56）分别往左上、右上走 */
const TEAR_L = [
  [100, 56],
  [88, 49.2],
  [76, 42.6],
  [64, 35.4],
  [52, 28.8],
  [40, 21.6],
  [28, 14.9],
  [16, 7.8],
  [0, 0],
] as const;
const TEAR_R = [
  [100, 56],
  [112, 49.4],
  [124, 42.2],
  [136, 35.8],
  [148, 28.4],
  [160, 21.9],
  [172, 14.6],
  [184, 7.9],
  [200, 0],
] as const;

const toPath = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');

const PATH_L = toPath(TEAR_L);
const PATH_R = toPath(TEAR_R);
/** 信封正面：顶边是 V 形缺口，撕掉封盖后露出来的就是这条边 */
const FRONT = 'M0 0 L100 56 L200 0 L200 124 L0 124 Z';

export function TearOpen({ theme, onDone }: { theme: LetterTheme; onDone: () => void }) {
  const p = letterParts(theme);
  const [prog, setProgState] = useState(0);
  const [away, setAway] = useState(false);

  const progRef = useRef(0);
  const startY = useRef<number | null>(null);
  const base = useRef(0);
  const fired = useRef(false);
  const timer = useRef<number | null>(null);

  const setProg = (v: number) => {
    progRef.current = v;
    setProgState(v);
  };

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  /** 撕到底：封盖飞走，等它飘出去再把信纸交出来 */
  const finish = () => {
    if (fired.current) return;
    fired.current = true;
    setProg(1);
    setAway(true);
    timer.current = window.setTimeout(onDone, 470);
  };

  // Esc 直接跳过（别让这层把键盘用户关在门外）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onDone();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDone]);

  const onDown = (e: React.PointerEvent) => {
    if (fired.current) return;
    // 合成事件 / 已释放的 pointerId 会让 setPointerCapture 抛 NotFoundError，别让它打断手势
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 拿不到捕获也能靠 onPointerMove 拖，只是移出元素就断 */
    }
    startY.current = e.clientY;
    base.current = progRef.current;
  };

  const onMove = (e: React.PointerEvent) => {
    if (startY.current == null || fired.current) return;
    const dy = startY.current - e.clientY;
    setProg(Math.max(0, Math.min(1, base.current + dy / 108)));
  };

  const onUp = (e: React.PointerEvent) => {
    if (startY.current == null) return;
    const dy = startY.current - e.clientY;
    startY.current = null;
    // 没怎么动 = 当成点了一下：直接拆开
    if (Math.abs(dy) < 8) {
      finish();
      return;
    }
    if (progRef.current > 0.42) finish();
    else setProg(0);
  };

  /** 封盖往上走的距离（信封高度的百分比）—— 幂次大于 1，前半程跟手、后半程猛地离开 */
  const lift = Math.pow(prog, 1.4) * 72;
  const tilt = prog * -8;
  /**
   * 撕下来的封盖会**缩小着飘走**，不会悬在半空当一片大三角形。
   * 拖动到顶时已经缩到 78% 并淡到五成，松手后再飞一段彻底消失。
   */
  const flapTop = away ? -100 : -lift;
  const flapScale = 1 - prog * 0.22;
  const flapOpacity = away ? 0 : prog > 0.62 ? Math.max(0.38, 1 - (prog - 0.62) * 1.1) : 1;
  /** 松手后（回弹 / 撕开）才给过渡，拖动时跟手 */
  const easing = away
    ? 'top .47s cubic-bezier(.3,1.15,.5,1), transform .47s cubic-bezier(.3,1.15,.5,1), opacity .47s ease-in'
    : 'top .1s linear, transform .1s linear, opacity .12s linear';

  return (
    <div
      data-testid="tear-open"
      className="absolute inset-0 z-[15] flex flex-col items-center justify-center px-6 pb-[9vh]"
      style={{ backgroundColor: p.stage }}
    >
      {/* 一沓信：底下垫两张错位的纸边，让最上面这封「有厚度」 */}
      <div className="relative w-full max-w-[352px]">
        <div
          aria-hidden
          className="absolute inset-x-3 top-0 rounded-[3px]"
          style={{
            aspectRatio: '200 / 124',
            backgroundColor: p.envSolid,
            border: `1px solid ${p.flapStroke}55`,
            transform: 'rotate(2.4deg) translateY(7px)',
            opacity: 0.55,
            boxShadow: '0 10px 22px -14px rgba(0,0,0,.45)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-1.5 top-0 rounded-[3px]"
          style={{
            aspectRatio: '200 / 124',
            backgroundColor: p.envSolid,
            border: `1px solid ${p.flapStroke}66`,
            transform: 'rotate(-1.5deg) translateY(3px)',
            opacity: 0.8,
          }}
        />

        {/* ============ 最上面这一封（可撕） ============ */}
        <div
          role="button"
          tabIndex={0}
          aria-label="按住往上撕开这封信"
          data-progress={prog.toFixed(2)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => { startY.current = null; if (progRef.current <= 0.42) setProg(0); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }}
          className="relative w-full touch-none select-none rounded-[3px] outline-none"
          style={{
            aspectRatio: '200 / 124',
            cursor: away ? 'default' : 'grab',
            filter: 'drop-shadow(0 12px 20px rgba(0,0,0,.32))',
          }}
        >
          {/* 信封本体都关在这一层里裁剪：信纸往上冒的时候不能露出信封上沿。
              封盖（下面第 ⑤ 块）必须留在这一层**外面**，否则它撕不下来、
              也被裁在信封框里飞不出去。 */}
          <div className="absolute inset-0 overflow-hidden rounded-[3px]">
            {/* ① 背板：信封的纸 */}
            <div
              className="absolute inset-0 rounded-[3px]"
              style={{ backgroundColor: p.envSolid, boxShadow: `inset 0 0 0 1px ${p.flapStroke}66` }}
            />

          {/* 纸纹：极淡的横向纤维，平涂色块靠它像纸而不是塑料 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[3px] opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.03) 0 1px, transparent 1px 4px)',
            }}
          />

          {/* ② 信纸：从信封里往上冒（被前板 V 口盖住，只露上半截） */}
          <div
            className="absolute overflow-hidden"
            style={{
              left: '7%',
              right: '7%',
              height: '72%',
              top: `${20 - prog * 30}%`,
              backgroundColor: p.paperSolid,
              boxShadow: '0 2px 5px rgba(0,0,0,.2)',
              transition: away ? 'top .47s cubic-bezier(.3,1.15,.5,1)' : 'top .1s linear',
            }}
          >
            {/* 纸上几道字迹：只做「这里有字」的暗示，不假装是内容 */}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                aria-hidden
                className="absolute block rounded-full"
                style={{
                  left: '9%',
                  top: `${13 + i * 9}%`,
                  width: i % 3 === 2 ? '58%' : '82%',
                  height: 1.6,
                  backgroundColor: p.inkSolid,
                  opacity: 0.14 - i * 0.012,
                }}
              />
            ))}
          </div>

          {/* ③ 信封正面 + 撕口线（一个 SVG 搞定，线宽用 non-scaling-stroke 防拉粗） */}
          <svg viewBox="0 0 200 124" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {/* 内壁：V 口里那层比信封深一点的暗，纸和信封之间那道阴影 */}
            <path d="M0 0 L100 56 L200 0 Z" fill={p.flapStroke} opacity="0.18" />
            {/* 正面纸 */}
            <path d={FRONT} fill={p.envSolid} />
            <path d="M0 0 L100 56 L200 0" fill="none" stroke={p.flapStroke} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.85" />
            {/* 正面两侧的斜折痕 */}
            <path d="M0 124 L78 58" fill="none" stroke={p.flapStroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" opacity="0.3" />
            <path d="M200 124 L122 58" fill="none" stroke={p.flapStroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" opacity="0.3" />

            {/* 撕口毛边：从中间向两侧长开，dashoffset 即进度 */}
            <path
              d={PATH_L}
              fill="none"
              stroke={p.flapStroke}
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - prog}
              opacity={prog > 0.02 ? 0.95 : 0}
            />
            <path
              d={PATH_R}
              fill="none"
              stroke={p.flapStroke}
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - prog}
              opacity={prog > 0.02 ? 0.95 : 0}
            />
            {/* 挑出来的纸纤维：撕开一半之后才出现 */}
            {prog > 0.45 && (
              <g
                fill="none"
                stroke={p.paperSolid}
                strokeWidth="1.1"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={Math.min(0.75, (prog - 0.45) * 3)}
              >
                <path d="M74 43.6 l3.4 -2.6" />
                <path d="M48 27.4 l3 -2.8" />
                <path d="M126 44.2 l3.2 2.6" />
                <path d="M154 29.6 l2.8 2.4" />
              </g>
            )}
          </svg>

          {/* ④ 撕开后才有的：留在信封上的半枚蜡 */}
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: '44%',
              top: '40%',
              opacity: prog > 0.55 ? Math.min(1, (prog - 0.55) * 2.6) : 0,
              transform: 'translate(-50%,-50%) rotate(-14deg)',
              transition: 'opacity .2s',
            }}
          >
            <span className="flex gap-[2px]">
              <span aria-hidden className="block h-[9px] w-[12px] rounded-[45%]" style={{ backgroundColor: p.sealBase }} />
              <span aria-hidden className="mt-[4px] block h-[5px] w-[7px] rounded-[45%]" style={{ backgroundColor: p.sealBase, opacity: 0.8 }} />
            </span>
          </div>
          </div>{/* ← 裁剪层到此为止（信封本体） */}

          {/* ⑤ 封盖：撕的就是这一片。
              形状用 SVG 画（不用 clip-path），这样火漆能作为子元素挂在尖端 ——
              父级的 rotate/scale 会把它一起带走，不需要手算缩放后的坐标。 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{
              height: '45.2%',
              top: `${flapTop}%`,
              transform: `translateX(${-prog * 13}%) rotate(${tilt}deg) scale(${flapScale})`,
              transformOrigin: '50% 0%',
              opacity: flapOpacity,
              transition: easing,
              filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.28))',
            }}
          >
            <svg viewBox="0 0 200 56" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <path d="M0 0 L100 56 L200 0 Z" fill={p.flapFill} />
              {/* 封盖下半边稍暗：纸被压过的那一面 */}
              <path d="M0 0 L100 56 L200 0 Z" fill="url(#flapShade)" opacity="0.5" />
              <defs>
                <linearGradient id="flapShade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.flapStroke} stopOpacity="0" />
                  <stop offset="100%" stopColor={p.flapStroke} stopOpacity="0.5" />
                </linearGradient>
              </defs>
              <path
                d="M0 0 L100 56 L200 0"
                fill="none"
                stroke={p.flapStroke}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.9"
              />
            </svg>

            {/* 火漆：钉在封盖尖端（容器底边中点） */}
            <span
              className="pointer-events-none absolute"
              style={{ left: '50%', top: '100%', transform: 'translate(-50%, -50%)' }}
            >
              <WaxSeal parts={p} size={34} />
            </span>
          </div>
        </div>
      </div>

      {/* 引导：撕到一半就淡出 */}
      <p
        data-testid="tear-hint"
        className="mt-10 flex items-center gap-1.5 text-[12px] tracking-wide"
        style={{ color: p.metaSolid, opacity: away ? 0 : Math.max(0, 1 - prog * 2.4), transition: 'opacity .18s' }}
      >
        <span aria-hidden className="inline-block animate-bounce text-[13px]" style={{ animationDuration: '1.4s' }}>↑</span>
        按住信封往上撕开
      </p>
      <p
        className="mt-1.5 text-[10px]"
        style={{ color: p.metaSolid, opacity: away ? 0 : Math.max(0, 0.55 - prog) }}
      >
        轻点一下也可以直接拆
      </p>
    </div>
  );
}

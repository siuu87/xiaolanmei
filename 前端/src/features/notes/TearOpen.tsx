import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useProfileStore } from '@/stores/profileStore';
import { letterParts, type LetterTheme } from './LetterArt';

/**
 * 拆信：**拖住撕条往左一拉**（2026-11-17 重做，照小红书「界面之外」撕信封教程）
 *
 * 之前的版本是「按住封盖往上撕」，用户给了教程的三张截图：
 *   ① 信封**平放在桌面上**、微微倾斜，正面手写「To: xxx」+ 日期，右上一丛邮票邮戳；
 *   ② 顶边有一条**撕条**（右端一个小圆抓手），拖住往**左**拉，整条从封口里抽出来；
 *   ③ 抽到底信封沿顶边撕开，**白信纸从里面升出来**，再一折一折展开。
 *
 * 交互：
 *   - 抓手（撕条右端）跟手往左走；撕条走过的地方，封口露出一道缝 + 信纸边
 *   - 拉过 55% 松手 = 撕开了：撕条整条甩出去，信纸弹簧一样升出信封
 *   - 拉不够松手 = 撕条弹回去（信还封着，可以再拉）
 *   - **点一下也算拆**（位移 < 8px）：鼠标 / 键盘用户不至于没反应
 *
 * 为什么撕条不在信封的裁剪层里：拉出来之后它要**伸到信封左边界以外**，
 * 裁剪层会把它切掉；所以撕条挂在旋转容器上、跟信封一起歪，但不受裁剪。
 *
 * 2026-11-18：这一层从「拆信的整页」降级成**弹窗里的第一屏**。
 * 卡片外面改回常规信封（火漆），撕只发生在点开之后 —— 所以多了 `onSkip`
 * （Esc 关掉整个弹窗）和 `bare`（不要把弹窗的星点舞台盖掉）。
 */

const HAND_FONT = '"Kaiti SC", "STKaiti", KaiTi, "楷体", "FangSong", serif';

export function TearOpen({
  theme,
  dateText,
  onDone,
  onSkip,
  bare = false,
}: {
  theme: LetterTheme;
  /** 信封正面手写的日期（如「2026年11月17日」） */
  dateText?: string;
  /** 撕开落地：这一刻才算「拆过」（调用方在这里标已读、换信纸） */
  onDone: () => void;
  /** Esc：不想撕，直接跳过这一层。不传就等同 onDone（旧行为） */
  onSkip?: () => void;
  /** 不要自己的整屏底色 —— 弹窗里底下已经是同色舞台 + 星点，别盖掉 */
  bare?: boolean;
}) {
  const p = letterParts(theme);
  const myName = useProfileStore((s) => s.name);
  const [pull, setPullState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [away, setAway] = useState(false);

  const pullRef = useRef(0);
  const startX = useRef<number | null>(null);
  const base = useRef(0);
  const fired = useRef(false);
  const timer = useRef<number | null>(null);
  const skip = onSkip ?? onDone;

  const setPull = (v: number) => {
    pullRef.current = v;
    setPullState(v);
  };

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  /** 拉到底：撕条甩出去，等信纸升出来再把信纸交出去 */
  const finish = () => {
    if (fired.current) return;
    fired.current = true;
    setDragging(false);
    setPull(1);
    setAway(true);
    timer.current = window.setTimeout(onDone, 1080);
  };

  // Esc 直接跳过（别让这层把键盘用户关在门外）。`skipRef` 是为了让监听只挂一次：
  // onSkip / onDone 每次渲染都是新函数，直接进依赖会反复解绑重绑。
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      skipRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (fired.current) return;
    // 合成事件 / 已释放的 pointerId 会让 setPointerCapture 抛 NotFoundError，别让它打断手势
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 拿不到捕获也能靠 onPointerMove 拖，只是移出元素就断 */
    }
    startX.current = e.clientX;
    base.current = pullRef.current;
    setDragging(true);
  };

  /** 拉满 190px = 抽完整条，别真让手指跑完整个信封宽 */
  const onMove = (e: React.PointerEvent) => {
    if (startX.current == null || fired.current) return;
    const dx = startX.current - e.clientX;
    setPull(Math.max(0, Math.min(1, base.current + dx / 190)));
  };

  const onUp = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = startX.current - e.clientX;
    startX.current = null;
    setDragging(false);
    // 没怎么动 = 当成点了一下：直接拆开
    if (Math.abs(dx) < 8) {
      finish();
      return;
    }
    if (pullRef.current > 0.55) finish();
    else setPull(0);
  };

  /** 撕条往左抽的位移（自身宽度的百分比）—— 拉满正好整条退出封口 */
  const stripShift = -pull * 103;
  /** 拉的时候信封跟着歪一点点，像真的被拽住了 */
  const envTilt = -2.6 - pull * 1.4;
  const envShift = pull * -5;

  /** 松手后（回弹 / 撕开）才给过渡，拖动时跟手 */
  const stripEasing = dragging
    ? 'none'
    : away
      ? 'transform .5s cubic-bezier(.45,.05,.7,.4), opacity .32s ease-in .1s'
      : 'transform .5s cubic-bezier(.3,1.25,.5,1)';

  /** 信纸：没拆时藏在信封后面；撕开后升出去 */
  const letterTop = away ? -62 : 16 - pull * 8;
  const letterTransition = away
    ? 'top .62s cubic-bezier(.3,1.18,.5,1) .14s, transform .62s cubic-bezier(.3,1.18,.5,1) .14s'
    : 'top .1s linear';

  const toName = myName.trim() || '亲爱的你';

  return (
    <div
      data-testid="tear-open"
      className="absolute inset-0 z-[15] flex flex-col items-center justify-center px-6 pb-[9vh]"
      style={bare ? undefined : { backgroundColor: p.stage }}
    >
      <div className="w-full max-w-[340px]">
        <div
          role="button"
          tabIndex={0}
          aria-label="拖住撕条往左拉，拆开这封信"
          data-testid="tear-envelope"
          data-progress={pull.toFixed(2)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => { startX.current = null; setDragging(false); if (!fired.current && pullRef.current <= 0.55) setPull(0); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } }}
          className="relative w-full touch-none select-none outline-none"
          style={{
            aspectRatio: '200 / 124',
            cursor: away ? 'default' : dragging ? 'grabbing' : 'grab',
            transform: `translateX(${envShift}px) rotate(${envTilt}deg)`,
            transition: dragging ? 'none' : 'transform .5s cubic-bezier(.3,1.25,.5,1)',
            filter: 'drop-shadow(0 14px 22px rgba(0,0,0,.16))',
          }}
        >
          {/* ① 信纸：挂在信封**后面**、不裁剪 —— 升出来的时候上半截露在信封上沿之上 */}
          <div
            aria-hidden
            className="absolute rounded-t-[3px]"
            style={{
              left: '6.5%',
              right: '6.5%',
              height: '72%',
              top: `${letterTop}%`,
              backgroundColor: p.paperSolid,
              boxShadow: '0 2px 6px rgba(0,0,0,.16)',
              transform: away ? 'rotate(-1.6deg)' : 'none',
              transition: letterTransition,
            }}
          >
            {/* 折痕：一折一折的信纸，横着两道 */}
            <span aria-hidden className="absolute inset-x-0 block" style={{ top: '34%', height: 1, backgroundColor: p.flapStroke, opacity: 0.22 }} />
            <span aria-hidden className="absolute inset-x-0 block" style={{ top: '67%', height: 1, backgroundColor: p.flapStroke, opacity: 0.18 }} />
            {/* 字迹暗示：只做「这里有字」，不假装是内容 */}
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                aria-hidden
                className="absolute block rounded-full"
                style={{
                  left: '9%',
                  top: `${10 + i * 11}%`,
                  width: i % 3 === 2 ? '56%' : '82%',
                  height: 1.6,
                  backgroundColor: p.inkSolid,
                  opacity: 0.15 - i * 0.02,
                }}
              />
            ))}
          </div>

          {/* ② 信封正面：一块平纸（教程的信封没有大三角封盖） */}
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden rounded-[3px]"
            style={{ backgroundColor: p.envSolid, boxShadow: `inset 0 0 0 1px ${p.flapStroke}55` }}
          >
            {/* 纸纹：极淡的横向纤维，平涂色块靠它像纸而不是塑料 */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(255,255,255,.22) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.03) 0 1px, transparent 1px 4px)',
              }}
            />
            {/* 底角两道斜折痕：背面折页透过来的印子 */}
            <svg viewBox="0 0 200 124" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <path d="M0 124 L74 64" fill="none" stroke={p.flapStroke} strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity="0.28" />
              <path d="M200 124 L126 64" fill="none" stroke={p.flapStroke} strokeWidth="0.8" vectorEffect="non-scaling-stroke" opacity="0.28" />
              {/* 封口缝：撕条走过之后露出来的那道暗线，从右往左长 */}
              <rect
                x={200 - pull * 200}
                y="0"
                width={pull * 200}
                height="2.4"
                fill={p.flapStroke}
                opacity={pull > 0.03 ? 0.5 : 0}
              />
            </svg>
          </div>

          {/* ③ 封口里露出的信纸边：撕条经过的地方，白纸从缝里冒一点头 */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 overflow-hidden rounded-t-[2px]"
            style={{
              width: `${pull * 100}%`,
              height: `${3.5 + pull * 7}%`,
              opacity: pull > 0.04 && !away ? 1 : 0,
              transition: 'opacity .12s',
            }}
          >
            <div
              className="absolute inset-x-0 bottom-0"
              style={{ top: 2, backgroundColor: p.paperSolid, boxShadow: 'inset 0 3px 4px -2px rgba(0,0,0,.18)' }}
            />
          </div>

          {/* ④ 手写收信人 + 日期（教程左中区那两行） */}
          <div aria-hidden className="pointer-events-none absolute" style={{ left: '9%', top: '38%' }}>
            <p
              style={{
                fontFamily: HAND_FONT,
                fontSize: 17,
                letterSpacing: '0.04em',
                color: p.inkSolid,
                opacity: 0.85,
                lineHeight: 1.2,
              }}
            >
              To: {toName}
            </p>
            <p
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontStyle: 'italic',
                fontSize: 10,
                color: p.metaSolid,
                marginTop: 4,
              }}
            >
              {dateText ?? ''}
            </p>
          </div>

          {/* ⑤ 右上角邮票 + 邮戳一丛 */}
          <svg
            aria-hidden
            viewBox="0 0 66 42"
            className="pointer-events-none absolute"
            style={{ right: '5%', top: '9%', width: '30%', opacity: 0.92 }}
          >
            {/* 邮票一：粉色爱心（歪一点） */}
            <g transform="rotate(-3 13 16)">
              <rect x="2" y="3" width="22" height="27" rx="1.5" fill={p.paperSolid} stroke={p.flapStroke} strokeWidth="0.8" />
              <rect x="4.5" y="5.5" width="17" height="22" rx="1" fill="none" stroke={p.sealBase} strokeWidth="0.7" strokeDasharray="2 1.6" opacity="0.75" />
              <path d="M13 21.5 C9.5 18.6 8.4 15.9 10 14 C11.3 12.5 13 13.1 13 14.6 C13 13.1 14.7 12.5 16 14 C17.6 15.9 16.5 18.6 13 21.5 Z" fill={p.sealBase} opacity="0.85" />
            </g>
            {/* 邮票二：素色 + 波浪（歪另一边） */}
            <g transform="rotate(3 40 20)">
              <rect x="29" y="9" width="20" height="24" rx="1.5" fill={p.chip} stroke={p.flapStroke} strokeWidth="0.8" />
              <rect x="31.2" y="11.2" width="15.6" height="19.6" rx="1" fill="none" stroke={p.flapStroke} strokeWidth="0.6" strokeDasharray="2 1.6" opacity="0.6" />
              <path d="M33.5 22 q2.8 -2.6 5.6 0 q2.8 2.6 5.6 0 M33.5 25.6 q2.8 -2.6 5.6 0 q2.8 2.6 5.6 0" fill="none" stroke={p.sealDark} strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
            </g>
            {/* 圆邮戳两枚 */}
            <circle cx="52" cy="9" r="7" fill="none" stroke={p.flapStroke} strokeWidth="0.9" strokeDasharray="2.4 1.8" opacity="0.55" />
            <circle cx="47.5" cy="15.5" r="4.2" fill="none" stroke={p.flapStroke} strokeWidth="0.8" opacity="0.4" />
          </svg>

          {/* ⑥ 撕条：跟信封一起歪，但**不受信封裁剪** —— 抽出来要伸到左边界以外。
              外层是加大的热区（封口细条手指不好抓），里面才是看得见的纸条。 */}
          <div
            aria-hidden
            className="absolute"
            style={{
              left: '-2%',
              width: '104%',
              top: '-6%',
              height: '13%',
              zIndex: 30,
              transform: `translateX(${stripShift}%) rotate(${pull * -1.6}deg)`,
              transformOrigin: '50% 50%',
              opacity: away ? 0 : 1,
              transition: stripEasing,
              /** 探出信封上沿的部分也要能抓：开着指针事件，让事件冒泡到外层手势。
                  撕开飞走后就别再挡后面的「收起」按钮了。 */
              pointerEvents: away ? 'none' : 'auto',
            }}
          >
            {/* 纸条本体 */}
            <div
              className="absolute inset-x-0 rounded-full"
              style={{
                top: '28%',
                height: '40%',
                backgroundColor: p.paperSolid,
                border: `1px solid ${p.flapStroke}88`,
                boxShadow: '0 1px 3px rgba(0,0,0,.12)',
              }}
            />
            {/* 右端抓手：小圆片，待着的时候轻轻往左点头 */}
            <motion.span
              className="absolute flex items-center justify-center rounded-full"
              style={{
                right: -7,
                top: '50%',
                width: 22,
                height: 22,
                marginTop: -11,
                backgroundColor: p.paperSolid,
                border: `1.5px solid ${p.flapStroke}`,
                boxShadow: '0 2px 5px rgba(0,0,0,.18)',
              }}
              animate={dragging || away ? { x: 0 } : { x: [0, -5, 0] }}
              transition={dragging || away ? { duration: 0.2 } : { repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
            >
              <span className="block h-[7px] w-[7px] rounded-full" style={{ backgroundColor: p.flapStroke, opacity: 0.55 }} />
            </motion.span>
          </div>
        </div>
      </div>

      {/* 引导：教程同款提示胶囊，一拉就淡出 */}
      <p
        data-testid="tear-hint"
        className="mt-10 rounded-full px-4 py-2 text-[12px] tracking-wide"
        style={{
          backgroundColor: p.paperSolid,
          border: `1px solid ${p.flapStroke}55`,
          color: p.inkSolid,
          opacity: away ? 0 : Math.max(0, 1 - pull * 2.4),
          transition: 'opacity .2s',
          boxShadow: '0 2px 8px -4px rgba(0,0,0,.14)',
        }}
      >
        拖住撕条往左一拉 信封就被撕开
      </p>
      <p
        className="mt-1.5 text-[10px]"
        style={{ color: p.metaSolid, opacity: away ? 0 : Math.max(0, 0.55 - pull) }}
      >
        轻点一下也可以直接拆
      </p>
    </div>
  );
}

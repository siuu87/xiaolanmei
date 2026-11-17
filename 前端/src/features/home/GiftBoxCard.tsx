/**
 * 礼物盒小卡（2026-11-17 十九改：🎀 emoji 同款蝴蝶结，换色贴上）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户：「要 emoji 那个蝴蝶结，可以直接换色贴上去」——手画十几种都不对味，直接上
 * Twemoji 🎀（U+1F380，CC-BY）的矢量路径，造型 1:1，填色换成主题蓝：
 *   - 盒盖：银白缎面（渐变光泽），雪花暗纹 + 珍珠碎钻撒面；
 *   - 缎带：浅蓝**细缎带**一竖一横，交会点在左上角，中线一道亮光；
 *   - 蝴蝶结 = Twemoji 三块路径贴在交点上（结心锚定交点）：
 *     主体 → `--gb-bow1`、暗部折痕 → `--gb-bow0`、中心结 → `--gb-bow3`；
 *   - hover 轻轻放大歪一下。
 * 颜色全部走 CSS 变量（浅色/深色各一套），自动换主题。
 */
import { useNavigate } from 'react-router-dom';

/** 缎带十字交点（=蝴蝶结落点）：左上角，偏左 */
const CENTER = { x: 58, y: 32 };

/** Twemoji 🎀（viewBox 36×36）里结心的位置（三块路径的公共锚点，手工量的） */
const EMOJI_KNOT = { x: 17.5, y: 9.5 };

/** emoji 结的缩放：宽约 44px，和细缎带比例协调 */
const EMOJI_SCALE = 1.35;

/** 缎带宽度：细缎带 */
const RIBBON_W = 9;

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const rx0 = CENTER.x - RIBBON_W / 2;
  const ry0 = CENTER.y - RIBBON_W / 2;

  return (
    <button
      type="button"
      onClick={() => navigate('/gifts')}
      data-testid="gift-box-card"
      aria-label="打开礼物盒"
      title="礼物盒"
      className={`group relative flex aspect-[172/68] max-h-full w-full items-end justify-center overflow-hidden rounded-[20px] border border-[#C6D9EA] transition active:scale-[0.98] hover:border-[#A9C8E2]
        [--gb-box1:#FDFEFF] [--gb-box2:#EDF2F7] [--gb-box3:#DDE6EF] [--gb-rib1:#A6C6E0] [--gb-rib2:#C9DEF0] [--gb-rib3:#F2F8FD]
        [--gb-bow1:#8FB3D4] [--gb-bow2:#B7D3EA] [--gb-bow3:#EAF4FC] [--gb-bow0:#7AA0C4]
        [--gb-seam:#D3DDE8] [--gb-snow:#FFFFFF] [--gb-pearl:#FFFFFF]
        dark:border-[#46516B] dark:hover:border-[#5D6B8C]
        dark:[--gb-box1:#4E5871] dark:[--gb-box2:#465068] dark:[--gb-box3:#3C4559] dark:[--gb-rib1:#6E95B8] dark:[--gb-rib2:#8FB6D9] dark:[--gb-rib3:#D6E8F6]
        dark:[--gb-bow1:#5D87AD] dark:[--gb-bow2:#84ACD0] dark:[--gb-bow3:#C6DEF2] dark:[--gb-bow0:#4C739A]
        dark:[--gb-seam:#3A4356] dark:[--gb-snow:#C7D6E6] dark:[--gb-pearl:#D8E2EC] ${className}`}
    >
      {/* 底色：冰雪感的浅蓝雾面（深色 = 夜蓝） */}
      <div className="absolute inset-0 bg-[#E7F0F7] dark:bg-[#2E3648]" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,.9) 1.1px, transparent 1.6px), radial-gradient(rgba(255,255,255,.5) .8px, transparent 1.2px)',
          backgroundSize: '22px 22px, 22px 22px',
          backgroundPosition: '2px 3px, 13px 14px',
          opacity: 0.5,
        }}
      />

      <svg viewBox="0 0 240 100" preserveAspectRatio="xMidYMid meet" aria-hidden className="absolute inset-0 h-full w-full">
        <defs>
          {/* 盒盖银白缎面：上下渐变出光泽。颜色走 CSS 变量，深浅主题自动切换 */}
          <linearGradient id="gb-box" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gb-box1, #FDFEFF)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--gb-box2, #EDF2F7)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gb-box3, #DDE6EF)' }} />
          </linearGradient>
          {/* 竖缎带：沿带宽方向的高光（中线亮、两边暗） */}
          <linearGradient id="gb-rib-v" x1={rx0} y1="0" x2={rx0 + RIBBON_W} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--gb-rib1, #A6C6E0)' }} />
            <stop offset="0.3" style={{ stopColor: 'var(--gb-rib2, #C9DEF0)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--gb-rib3, #F2F8FD)' }} />
            <stop offset="0.7" style={{ stopColor: 'var(--gb-rib2, #C9DEF0)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gb-rib1, #A6C6E0)' }} />
          </linearGradient>
          {/* 横缎带：同上，沿高度方向 */}
          <linearGradient id="gb-rib-h" x1="0" y1={ry0} x2="0" y2={ry0 + RIBBON_W} gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--gb-rib1, #A6C6E0)' }} />
            <stop offset="0.3" style={{ stopColor: 'var(--gb-rib2, #C9DEF0)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--gb-rib3, #F2F8FD)' }} />
            <stop offset="0.7" style={{ stopColor: 'var(--gb-rib2, #C9DEF0)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gb-rib1, #A6C6E0)' }} />
          </linearGradient>
        </defs>

        {/* ============ 盒盖：银白缎面圆角矩形占满卡片（俯视） ============ */}
        <rect x="3" y="3" width="234" height="94" rx="16" fill="url(#gb-box)" />
        {/* 盖沿内缝线（盒盖和盒身的分缝，压出一点厚度感） */}
        <rect x="9" y="9" width="222" height="82" rx="13"
          fill="none" style={{ stroke: 'var(--gb-seam, #D3DDE8)' }} strokeWidth="1.6" />
        <rect x="10.5" y="10.5" width="219" height="79" rx="12"
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.8" />

        {/* ============ 雪花暗纹 + 珍珠碎钻（撒在缎面上，避开结区） ============ */}
        <g fill="none" style={{ stroke: 'var(--gb-snow, #FFFFFF)' }} strokeLinecap="round">
          {[
            { cx: 186, cy: 28, r: 6.5, o: 0.85 },
            { cx: 168, cy: 74, r: 9, o: 0.9 },
            { cx: 142, cy: 20, r: 4, o: 0.7 },
            { cx: 206, cy: 50, r: 4, o: 0.7 },
            { cx: 132, cy: 56, r: 4.5, o: 0.7 },
            { cx: 124, cy: 14, r: 4, o: 0.65 },
            { cx: 96, cy: 88, r: 4, o: 0.7 },
            { cx: 216, cy: 80, r: 4.5, o: 0.7 },
          ].map((s, i) => (
            <Snowflake key={i} cx={s.cx} cy={s.cy} r={s.r} o={s.o} />
          ))}
        </g>
        {/* 珍珠（小圆点带一点偏心高光） */}
        <g>
          {[
            { cx: 150, cy: 44, r: 2.4 },
            { cx: 126, cy: 18, r: 2 },
            { cx: 152, cy: 84, r: 2.2 },
            { cx: 196, cy: 68, r: 2.4 },
            { cx: 118, cy: 60, r: 2 },
            { cx: 226, cy: 44, r: 1.7 },
            { cx: 210, cy: 22, r: 1.7 },
          ].map((p, i) => (
            <g key={i}>
              <circle cx={p.cx} cy={p.cy} r={p.r} style={{ fill: 'var(--gb-pearl, #FFFFFF)' }} opacity="0.95" />
              <circle cx={p.cx - p.r * 0.3} cy={p.cy - p.r * 0.3} r={p.r * 0.3} fill="#fff" opacity="0.9" />
            </g>
          ))}
        </g>

        {/* ============ 浅蓝缎带十字：交会点在左上角（中线一道亮光 = 缎面） ============ */}
        {/* 竖条 */}
        <rect x={rx0} y="3" width={RIBBON_W} height="94" fill="url(#gb-rib-v)" />
        {/* 横条（压在竖条上面，交叉处自然分层） */}
        <rect x="3" y={ry0} width="234" height={RIBBON_W} fill="url(#gb-rib-h)" />
        {/* 带身边缘一道细暗线（缎带卷边的立体感） */}
        <rect x={rx0} y="3" width="1.2" height="94" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x={rx0 + RIBBON_W - 1.2} y="3" width="1.2" height="94" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x="3" y={ry0} width="234" height="1.2" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x="3" y={ry0 + RIBBON_W - 1.2} width="234" height="1.2" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />

        {/* ============ 🎀 emoji 同款蝴蝶结（Twemoji 路径换色），结心锚定交点（hover 轻轻歪一下） ============ */}
        <g
          className="transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
          style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px`, transformBox: 'view-box' }}
        >
          <g transform={`translate(${CENTER.x - EMOJI_KNOT.x * EMOJI_SCALE} ${CENTER.y - EMOJI_KNOT.y * EMOJI_SCALE}) scale(${EMOJI_SCALE})`}>
            {/* 主体：双环 + 两条垂尾（Twemoji 1f380 第一块路径，#DD2E44 → 中蓝） */}
            <path
              style={{ fill: 'var(--gb-bow1, #8FB3D4)' }}
              d="M19.281 6.392c0 .405-2.37.405-2.37 0 0-.9-14.911-9.899-14.911-2.7v13.499c0 2.487 3.476 1.947 7.193.361-1.429 3.525-4.498 9.68-7.05 13.934-.229.382-.178.868.124 1.194.303.325.783.415 1.181.215l5.258-2.629c.441.726.931 1.868 1.376 2.906.333.778.678 1.582 1.024 2.275.144.287.417.488.734.54.053.009.107.013.16.013.263 0 .518-.104.707-.293 1.42-1.419 3.429-8.395 4.793-14.093 1.364 5.698 3.373 12.674 4.793 14.093.188.189.444.293.707.293.053 0 .106-.004.16-.013.317-.052.591-.253.734-.54.347-.693.691-1.497 1.024-2.275.445-1.038.935-2.181 1.376-2.906l5.258 2.629c.398.198.879.111 1.181-.215.303-.326.352-.812.124-1.194-2.735-4.558-6.061-11.296-7.328-14.643C29.652 18.933 34 20.02 34 17.19V3.691c0-7.198-14.719 1.801-14.719 2.701z"
            />
            {/* 暗部：环内侧折痕（#A0041E → 深蓝） */}
            <path
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }}
              d="M2.114 17.869c1.177 3.199 11.468-1.787 14.86-5.179.31-.31.549-.602.758-.885-10.446.252-14.542 3.857-15.618 6.064zm16.482-6.068c.212.285.453.578.765.89 3.6 3.6 14.639 8.999 14.639 4.5v-.209c-1.671-2.199-6.037-5.022-15.404-5.181z"
            />
            {/* 中心结（#EA596E → 亮蓝） */}
            <path
              style={{ fill: 'var(--gb-bow3, #EAF4FC)' }}
              d="M22 11.4c0 1.988-1.611 3.6-3.599 3.6h-1.802C14.611 15 13 13.388 13 11.4V7.6C13 5.612 14.611 4 16.599 4h1.802C20.389 4 22 5.612 22 7.6v3.8z"
            />
          </g>
        </g>
      </svg>
    </button>
  );
}

/** 雪花：六向辐条 + 每根 55% 处两根小枝（stroke 用） */
function Snowflake({ cx, cy, r, o }: { cx: number; cy: number; r: number; o: number }) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const x2 = cx + r * Math.cos(a);
    const y2 = cy + r * Math.sin(a);
    d += `M${cx.toFixed(1)} ${cy.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} `;
    const bx = cx + r * 0.55 * Math.cos(a);
    const by = cy + r * 0.55 * Math.sin(a);
    for (const s of [-1, 1]) {
      const ba = a + s * (Math.PI / 4);
      const ex = bx + r * 0.32 * Math.cos(ba);
      const ey = by + r * 0.32 * Math.sin(ba);
      d += `M${bx.toFixed(1)} ${by.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} `;
    }
  }
  return (
    <path
      d={d}
      strokeWidth={Math.max(1, r / 5)}
      opacity={o}
    />
  );
}

export default GiftBoxCard;

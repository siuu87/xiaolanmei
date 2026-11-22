/**
 * 礼物盒小卡（2026-11-18 又改：**正方形半格**）
 *
 * 用户：「把礼物盒变成现在的一半，就是正方形，然后右边加一个待填入的小程序」——
 * 所以礼盒从「铺满整格的长条」缩成**一格正方形**，右边空出来给小程序的占位符。
 *
 * 画法照旧：盖沿 + 盒身 + 缎带十字 + 🎀（Twemoji 路径换色），一笔没删，
 * 只是把画布从 240×100 改成 200×200 —— 长条盒塞进正方形会被拉成扁片，
 * 必须重排：盖沿 22%、缎带十字交点 34%/32%（还是偏左，原来是这个味道）。
 *
 * 颜色全部走 CSS 变量（浅色/深色各一套），自动换主题。
 */
import { useNavigate } from 'react-router-dom';

/** 画布：正方形，容器也是正方形，`meet` 正好铺满、不留白边 */
const VIEW = 200;

/** 缎带十字交点（=蝴蝶结落点）：偏左上；横缎带压在盖沿缝下面，跟长条版一个关系 */
const CENTER = { x: 88, y: 64 };

/** Twemoji 🎀（viewBox 36×36）里结心的位置（三块路径的公共锚点，手工量的） */
const EMOJI_KNOT = { x: 17.5, y: 9.5 };

/** emoji 结的缩放：宽约 65（画布的 1/3），在 80px 的格子里还读得出是个蝴蝶结 */
const EMOJI_SCALE = 1.8;

/** 缎带宽度：细缎带 */
const RIBBON_W = 16;

/** 盖沿的几何：全宽、高 52（26%，跟长条版 26/100 同比例），顶角几乎方（直角礼盒） */
const LID = { x0: 0, x1: VIEW, y0: 0, h: 52, rx: 3 };
/** 盖缝线（盖沿底边下的一条深色细线） */
const LID_SEAM_Y = LID.y0 + LID.h;

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const rx0 = CENTER.x - RIBBON_W / 2;
  const ry0 = CENTER.y - RIBBON_W / 2;

  // 盖沿：顶上两角几乎直角、底边平
  const lidPath = `M${LID.x0 + LID.rx} ${LID.y0} H${LID.x1 - LID.rx} Q${LID.x1} ${LID.y0} ${LID.x1} ${LID.y0 + LID.rx} V${LID.y0 + LID.h} H${LID.x0} V${LID.y0 + LID.rx} Q${LID.x0} ${LID.y0} ${LID.x0 + LID.rx} ${LID.y0} Z`;

  return (
    <button
      type="button"
      onClick={() => navigate('/gifts')}
      data-testid="gift-box-card"
      aria-label="打开礼物盒"
      title="礼物盒"
      className={`group relative flex aspect-square w-full items-end justify-center overflow-hidden rounded-2xl
        [--gb-lid:#FFFFFF] [--gb-body:#F1F7FB] [--gb-edge:#C9D9E9]
        [--gb-rib1:#A6C6E0] [--gb-rib2:#C9DEF0] [--gb-rib3:#F2F8FD]
        [--gb-bow1:#8FB3D4] [--gb-bow3:#EAF4FC] [--gb-bow0:#7AA0C4]
        dark:[--gb-lid:#4F5B76] dark:[--gb-body:#363F55] dark:[--gb-edge:#28304A]
        dark:[--gb-rib1:#6E95B8] dark:[--gb-rib2:#8FB6D9] dark:[--gb-rib3:#D6E8F6]
        dark:[--gb-bow1:#5D87AD] dark:[--gb-bow3:#C6DEF2] dark:[--gb-bow0:#4C739A] ${className}`}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        className="absolute inset-0 h-full w-full"
      >
        <defs>
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

        {/* ============ 直角礼盒铺满格子：盒身 + 盖沿 + 盖缝线 ============ */}
        {/* 盒身（盖沿以下一直到格子底边，直角 rx 3） */}
        <rect x="0" y={LID_SEAM_Y} width={VIEW} height={VIEW - LID_SEAM_Y} rx="3"
          style={{ fill: 'var(--gb-body, #F1F7FB)' }} />
        {/* 盖沿（全宽） */}
        <path d={lidPath} style={{ fill: 'var(--gb-lid, #FFFFFF)' }} />
        {/* 盖缝线（盖沿底边） */}
        <rect x={LID.x0} y={LID_SEAM_Y} width={LID.x1 - LID.x0} height="3"
          style={{ fill: 'var(--gb-edge, #C9D9E9)' }} opacity="0.75" />

        {/* ============ 浅蓝缎带十字：交会点在左上角（中线一道亮光 = 缎面） ============ */}
        {/* 竖条 */}
        <rect x={rx0} y="0" width={RIBBON_W} height={VIEW} fill="url(#gb-rib-v)" />
        {/* 横条（压在竖条上面，交叉处自然分层） */}
        <rect x="0" y={ry0} width={VIEW} height={RIBBON_W} fill="url(#gb-rib-h)" />
        {/* 带身边缘一道细暗线（缎带卷边的立体感） */}
        <rect x={rx0} y="0" width="1.6" height={VIEW} style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x={rx0 + RIBBON_W - 1.6} y="0" width="1.6" height={VIEW} style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x="0" y={ry0} width={VIEW} height="1.6" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x="0" y={ry0 + RIBBON_W - 1.6} width={VIEW} height="1.6" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />

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

export default GiftBoxCard;

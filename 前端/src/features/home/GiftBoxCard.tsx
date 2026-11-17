/**
 * 礼物盒小卡（2026-11-17 十六改：细缎带 + 端正的立体蝴蝶结）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户：「细缎带的蝴蝶结」——细缎带（宽 9）配细缎带同款的结：
 *   - 盒盖：银白缎面（渐变光泽），雪花暗纹 + 珍珠碎钻撒面；
 *   - 缎带：浅蓝**细缎带**一竖一横，交会点在左上角，中线一道亮光；
 *   - 蝴蝶结**端正**趴在交点上（不旋转）：瘦长的立体环（下缘暗影 + 根部凹陷
 *     + 上缘高光）+ 小中心结（绕缠纹）+ 两条窄飘尾（根部亮尖端暗、燕尾剪口）；
 *   - hover 轻轻放大歪一下。
 * 颜色全部走 CSS 变量（浅色/深色各一套），渐变 stop 引用变量自动换主题。
 */
import { useNavigate } from 'react-router-dom';

/** 缎带十字交点（=蝴蝶结落点）：左上角，偏左 */
const CENTER = { x: 58, y: 32 };

/** 蝴蝶结方向：细缎带配端正的结（不旋转、不缩放） */
const BOW_ROTATE = 0;
const BOW_SCALE = 1;

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
          {/* 蝴蝶结缎面：专属的深一档蓝（和大环带分开，参考图里结明显比缎带深） */}
          <linearGradient id="gb-bow" x1="-26" y1="-14" x2="26" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--gb-bow1, #8FB3D4)' }} />
            <stop offset="0.3" style={{ stopColor: 'var(--gb-bow2, #B7D3EA)' }} />
            <stop offset="0.5" style={{ stopColor: 'var(--gb-bow3, #EAF4FC)' }} />
            <stop offset="0.7" style={{ stopColor: 'var(--gb-bow2, #B7D3EA)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gb-bow1, #8FB3D4)' }} />
          </linearGradient>
          {/* 飘尾缎面 ×2：根部亮、尖端暗（垂坠的立体感） */}
          <linearGradient id="gb-tail-l" x1="-2" y1="5" x2="-14" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--gb-bow2, #B7D3EA)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--gb-bow1, #8FB3D4)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gb-bow0, #7AA0C4)' }} />
          </linearGradient>
          <linearGradient id="gb-tail-r" x1="2" y1="5" x2="14" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: 'var(--gb-bow2, #B7D3EA)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--gb-bow1, #8FB3D4)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gb-bow0, #7AA0C4)' }} />
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

        {/* ============ 参考图同款蝴蝶结：趴在十字交点上（hover 轻轻放大歪一下） ============ */}
        <g
          className="transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105"
          style={{ transformOrigin: `${CENTER.x}px ${CENTER.y}px`, transformBox: 'view-box' }}
        >
          <g transform={`translate(${CENTER.x} ${CENTER.y}) rotate(${BOW_ROTATE}) scale(${BOW_SCALE})`}>
            {/* 细飘尾 ×2：窄窄一条 V 字垂下，燕尾剪口；根部折影 + 尖端渐暗（立体） */}
            <path
              d="M-3.5 3.5 C-8.5 10 -13 17 -15.5 29.5 L-10.8 25.8 L-7.2 31 C-6.5 21 -3 12.5 1.8 6.5 Z"
              fill="url(#gb-tail-l)"
            />
            <path d="M-3.5 3.5 C-7.5 9 -11.5 15.5 -13.8 25 L-10.8 23.5 C-8.5 16.5 -5 10.5 -0.8 6.8 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.3" />
            <path
              d="M3.5 3.5 C8.5 10 13 17 15.5 29.5 L10.8 25.8 L7.2 31 C6.5 21 3 12.5 -1.8 6.5 Z"
              fill="url(#gb-tail-r)"
            />
            <path d="M3.5 3.5 C7.5 9 11.5 15.5 13.8 25 L10.8 23.5 C8.5 16.5 5 10.5 0.8 6.8 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.3" />

            {/* 细缎带环 ×2：瘦长的缎面环 —— 底色 + 下缘暗影 + 根部凹陷 + 上缘高光 */}
            <path
              d="M-3.5 -2.5 C-4.5 -8.5 -9.5 -14 -16.5 -13.8 C-24 -13.5 -27.8 -7.5 -25 -2 C-22.2 3.5 -10.5 4.2 -4.8 1.2 C-3.6 0.4 -3.2 -1 -3.5 -2.5 Z"
              fill="url(#gb-bow)"
            />
            {/* 左环下缘暗影（缎面卷进去的暗部） */}
            <path d="M-24.5 -1.5 C-21.5 3.2 -11 4.4 -5.5 1.4 C-10 4.6 -20.5 4 -23.2 0.2 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.4" />
            {/* 左环根部凹陷（缎带折进结里的洞） */}
            <ellipse cx="-10" cy="0.2" rx="3.2" ry="1.8" style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.4" transform="rotate(-15 -10 0.2)" />
            <path
              d="M3.5 -2.5 C4.5 -8.5 9.5 -14 16.5 -13.8 C24 -13.5 27.8 -7.5 25 -2 C22.2 3.5 10.5 4.2 4.8 1.2 C3.6 0.4 3.2 -1 3.5 -2.5 Z"
              fill="url(#gb-bow)"
            />
            {/* 右环下缘暗影 */}
            <path d="M24.5 -1.5 C21.5 3.2 11 4.4 5.5 1.4 C10 4.6 20.5 4 23.2 0.2 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.4" />
            {/* 右环根部凹陷 */}
            <ellipse cx="10" cy="0.2" rx="3.2" ry="1.8" style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.4" transform="rotate(15 10 0.2)" />
            {/* 环上缘的立体高光（贴着环外上缘的亮面，填充式不悬空） */}
            <g fill="none" stroke="#fff" strokeLinecap="round" opacity="0.55">
              <path d="M-21.5 -11.5 C-17 -13.5 -12 -12.5 -8.5 -9.5" strokeWidth="1.6" />
              <path d="M8.5 -9.5 C12 -12.5 17 -13.5 21.5 -11.5" strokeWidth="1.6" />
            </g>

            {/* 环根处的柔和暗影（贴着结，分层次） */}
            <path d="M-3.5 -0.5 C-6 2 -10.5 2.5 -14.5 0.5 C-11 3.8 -6.5 3.8 -3.5 1 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.4" />
            <path d="M3.5 -0.5 C6 2 10.5 2.5 14.5 0.5 C11 3.8 6.5 3.8 3.5 1 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.4" />

            {/* 中心结：细缎带的收拢小结 —— 底色 + 左右绕缠暗部 + 中线高光 */}
            <ellipse cx="0" cy="0" rx="4.6" ry="5.2" fill="url(#gb-bow)" />
            <path d="M-3.4 -4.2 C-4.9 -1.5 -4.9 1.5 -3.4 4.2 C-4.3 1.5 -4.3 -1.5 -3.4 -4.2 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.5" />
            <path d="M3.4 -4.2 C4.9 -1.5 4.9 1.5 3.4 4.2 C4.3 1.5 4.3 -1.5 3.4 -4.2 Z"
              style={{ fill: 'var(--gb-bow0, #7AA0C4)' }} opacity="0.5" />
            <path d="M-0.9 -4.5 C-1.5 -1.5 -1.5 1.5 -0.9 4.5" fill="none" stroke="#fff" strokeWidth="1" opacity="0.55" strokeLinecap="round" />
            <circle cx="-1.9" cy="-2.3" r="1.2" fill="#fff" opacity="0.8" />
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

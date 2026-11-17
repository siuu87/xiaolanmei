/**
 * 礼物盒小卡（2026-11-17 九改：冰雪缎面版，俯视图）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户给了冰雪风礼盒照片（@小红书）：「我想要这种丝带样子这种盒子」——
 * 银白缎面雪花包装纸 + 浅蓝缎带十字 + 大缎面蝴蝶结带垂尾 + 雪花珍珠点缀。
 * 构图沿用上一版的**俯视**（盒盖正对观众、丝带十字交正中、蝴蝶结骑交点），
 * 材质整套换成照片同款：
 *   - 盒盖：银白缎面（上下渐变出光泽），雪花暗纹 + 珍珠碎钻撒面；
 *   - 丝带：浅蓝**缎带**——高光不是波点了，是沿带身中线的一道亮光；
 *   - 蝴蝶结：大缎面结（外环 + 内环两层 + 中心结），两条垂尾从结上飘下来、
 *     斜切口收尾，hover 放大歪一下。
 * 颜色全部走 CSS 变量（浅色/深色各一套），渐变 stop 引用变量自动换主题。
 */
import { useNavigate } from 'react-router-dom';

/** 丝带十字交点（=蝴蝶结落点）：照照片偏在左上角，结骑在交点上 */
const CENTER = { x: 72, y: 32 };

/** 丝带宽度（十字两条） */
const RIBBON_W = 14;

/** 蝴蝶结落点（=丝带十字交点，同 CENTER） */
const BOW = CENTER;

/** 雪花：六向辐条 + 每根 55% 处两根小枝，返回 stroke 用 path */
function snowflakePath(cx: number, cy: number, r: number): string {
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
  return d;
}

/** 面上的雪花：避开丝带十字与蝴蝶结区域（交点偏左上） */
const SNOWS: Array<{ cx: number; cy: number; r: number; o: number }> = [
  { cx: 44, cy: 74, r: 6, o: 0.85 },
  { cx: 96, cy: 76, r: 5, o: 0.75 },
  { cx: 186, cy: 28, r: 6.5, o: 0.85 },
  { cx: 168, cy: 74, r: 9, o: 0.9 },
  { cx: 30, cy: 50, r: 4.5, o: 0.7 },
  { cx: 206, cy: 50, r: 4, o: 0.7 },
  { cx: 142, cy: 20, r: 4, o: 0.7 },
  { cx: 112, cy: 44, r: 4, o: 0.6 },
  { cx: 22, cy: 20, r: 3.5, o: 0.6 },
];

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
        [--gb-seam:#D3DDE8] [--gb-snow:#FFFFFF] [--gb-pearl:#FFFFFF]
        dark:border-[#46516B] dark:hover:border-[#5D6B8C]
        dark:[--gb-box1:#4E5871] dark:[--gb-box2:#465068] dark:[--gb-box3:#3C4559] dark:[--gb-rib1:#6E95B8] dark:[--gb-rib2:#8FB6D9] dark:[--gb-rib3:#D6E8F6]
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
          {/* 蝴蝶结缎面：蓝底明显（照片里结和丝带是一色的蓝），中线一道亮光 */}
          <linearGradient id="gb-bow" x1="90" y1="30" x2="150" y2="70" gradientUnits="userSpaceOnUse">
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

        {/* ============ 雪花暗纹 + 珍珠碎钻（撒在缎面上） ============ */}
        <g fill="none" style={{ stroke: 'var(--gb-snow, #FFFFFF)' }} strokeLinecap="round">
          {SNOWS.map((s, i) => (
            <path key={i} d={snowflakePath(s.cx, s.cy, s.r)} strokeWidth={Math.max(1, s.r / 5)} opacity={s.o} />
          ))}
        </g>
        {/* 珍珠（小圆点带一点偏心高光） */}
        <g>
          {[
            { cx: 48, cy: 46, r: 2.4 },
            { cx: 100, cy: 24, r: 2 },
            { cx: 152, cy: 30, r: 2.2 },
            { cx: 196, cy: 68, r: 2.4 },
            { cx: 112, cy: 76, r: 2 },
            { cx: 66, cy: 80, r: 1.7 },
            { cx: 210, cy: 22, r: 1.7 },
          ].map((p, i) => (
            <g key={i}>
              <circle cx={p.cx} cy={p.cy} r={p.r} style={{ fill: 'var(--gb-pearl, #FFFFFF)' }} opacity="0.95" />
              <circle cx={p.cx - p.r * 0.3} cy={p.cy - p.r * 0.3} r={p.r * 0.3} fill="#fff" opacity="0.9" />
            </g>
          ))}
        </g>

        {/* ============ 浅蓝缎带十字：交在正中央（中线一道亮光 = 缎面） ============ */}
        {/* 竖条 */}
        <rect x={rx0} y="3" width={RIBBON_W} height="94" fill="url(#gb-rib-v)" />
        {/* 横条（压在竖条上面，交叉处自然分层） */}
        <rect x="3" y={ry0} width="234" height={RIBBON_W} fill="url(#gb-rib-h)" />
        {/* 带身边缘一道细暗线（缎带卷边的立体感） */}
        <rect x={rx0} y="3" width="1.2" height="94" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x={rx0 + RIBBON_W - 1.2} y="3" width="1.2" height="94" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x="3" y={ry0} width="234" height="1.2" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />
        <rect x="3" y={ry0 + RIBBON_W - 1.2} width="234" height="1.2" style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.8" />

        {/* ============ 大缎面蝴蝶结：骑在十字交点上（hover 放大歪一下） ============ */}
        <g
          className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          style={{ transformOrigin: `${BOW.x}px ${BOW.y}px`, transformBox: 'view-box' }}
        >
          <g transform={`translate(${BOW.x} ${BOW.y})`}>
            {/* 两条垂尾：从结上飘下来，斜切口收尾（照片同款） */}
            <path
              d="M-3 3 C-9 11 -15 17 -21 28 L-13.5 24.5 L-9 30 C-6 20 -1.5 12 3 5 Z"
              fill="url(#gb-bow)"
            />
            <path
              d="M3 4 C7 12 10 19 12 30 L6.5 25.5 L2.5 29.5 C3 20 1.5 12 -1.5 5 Z"
              fill="url(#gb-bow)"
              opacity="0.92"
            />
            {/* 垂尾内侧一道暗影（分出前后层次） */}
            <path d="M-3 3 C-8 10 -13.5 16.5 -19 26 L-15.5 24 C-11 16.5 -6.5 10 -1 4.5 Z"
              style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.35" />

            {/* 外环 ×2：圆滚滚立起来（不是扁贴纸），缎面渐变 */}
            <path
              d="M-4 -1 C-5 -10 -12 -17.5 -21 -15.5 C-30 -13.5 -33 -4 -27 3.5 C-21 10 -8 8.5 -4 -1 Z"
              fill="url(#gb-bow)"
            />
            <path
              d="M4 -1 C5 -10 12 -17.5 21 -15.5 C30 -13.5 33 -4 27 3.5 C21 10 8 8.5 4 -1 Z"
              fill="url(#gb-bow)"
            />
            {/* 环根处的柔和暗影（贴着结，分出环和结的层次；不刺不悬空） */}
            <path d="M-4 0 C-8 3 -14 3.5 -19 1 C-15 5 -8 5.5 -4 2 Z"
              style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.45" />
            <path d="M4 0 C8 3 14 3.5 19 1 C15 5 8 5.5 4 2 Z"
              style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.45" />
            {/* 环内侧一道软暗褶（层次，不刺） */}
            <path d="M-9.5 -8 C-6.5 -10 -4 -10.8 -2.2 -10.3 -4 -6.8 -6.8 -5.8 -9.5 -8 Z"
              style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.4" />
            <path d="M9.5 -8 C6.5 -10 4 -10.8 2.2 -10.3 4 -6.8 6.8 -5.8 9.5 -8 Z"
              style={{ fill: 'var(--gb-rib1, #A6C6E0)' }} opacity="0.4" />
            {/* 中心结：胖圆，压住所有环 */}
            <circle cx="0" cy="0" r="6.5" fill="url(#gb-bow)" />
            <circle cx="-2.2" cy="-2.6" r="1.9" fill="#fff" opacity="0.8" />
          </g>
        </g>
      </svg>
    </button>
  );
}

export default GiftBoxCard;

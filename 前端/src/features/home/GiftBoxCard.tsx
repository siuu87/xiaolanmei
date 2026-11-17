/**
 * 礼物盒小卡（2026-11-17 七改：几何照实拍照片重排 —— @泡椒鱼泡 的奶油白礼盒）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 五改被说「奇怪」：顶面画成平行四边形、远端朝屏幕下方走，盒子像往下滑；
 * 六改矫枉过正变成楔形。照片里真正的方位是：**长轴往右上方后退** ——
 * 近端（打蝴蝶结那头）在左下，远端在右上、屏幕上更高；宽长面朝左下对着观众，
 * 右端一条窄暗面收尾。这版按这个方位排：
 *   - 顶面 A(前左) B(前右) C(后右) D(后左)：前棱长、后棱略短（轻透视），
 *     两条长棱都往右上升；侧面往下 DROP，左右两条竖棱垂直；
 *   - 丝带垂直于长轴绕盒：顶面一段 + 宽面一段垂下（一直垂到盒底棱，
 *     跟「绕到盒子底下」一个意思）；蕾丝条贴两侧；
 *   - 蝴蝶结骑在顶面丝带靠前缘处，两条燕尾垂带搭在宽面上、收在盒底棱之上；
 *   - 小水钻撒在顶面右半边（照片同款：星 + 碎钻心 + 银粒）。
 * 丝带/蕾丝位置全从 A/B/C/D 插值推出，挪位置不用重算坐标。
 */
import { useNavigate } from 'react-router-dom';

/** 盒面高（竖棱长度） */
const DROP = 36;

/**
 * 顶面四角：A 前左（近端）、B 前右、C 后右（远端）、D 后左。
 * 长棱几乎平行、只往右缓升（远端比近端高一点，照片的机位）；宽度方向往后上收。
 */
const A = { x: 40, y: 50 };
const B = { x: 196, y: 38 };
const C = { x: 218, y: 24 };
const D = { x: 62, y: 34 };

/** 前棱 / 后棱上的等比插值点（s ∈ 0~1，从近端到远端） */
const onFront = (s: number) => ({ x: A.x + (B.x - A.x) * s, y: A.y + (B.y - A.y) * s });
const onBack = (s: number) => ({ x: D.x + (C.x - D.x) * s, y: D.y + (C.y - D.y) * s });

/** 顶面上的一根横带（丝带或蕾丝）：s0~s1 之间，前后棱各取两点连成条 */
function topBand(s0: number, s1: number) {
  const f0 = onFront(s0);
  const f1 = onFront(s1);
  const b1 = onBack(s1);
  const b0 = onBack(s0);
  const r = (p: { x: number; y: number }) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return `M${r(f0)} L${r(f1)} L${r(b1)} L${r(b0)} Z`;
}

/** 宽侧面（前长面）上的一根竖带：从前棱 s0~s1 两点垂直垂下 DROP */
function frontBand(s0: number, s1: number) {
  const f0 = onFront(s0);
  const f1 = onFront(s1);
  const r = (p: { x: number; y: number }, dy = 0) => `${p.x.toFixed(1)} ${(p.y + dy).toFixed(1)}`;
  return `M${r(f0)} L${r(f1)} L${r(f1, DROP)} L${r(f0, DROP)} Z`;
}

/** 丝带骑缝：宽 0.16，蕾丝各 0.08 贴两侧 */
const RIBBON = { a: 0.18, b: 0.34 };
const LACE_L = { a: 0.1, b: 0.18 };
const LACE_R = { a: 0.34, b: 0.42 };

/** 蝴蝶结落点：顶面丝带靠前缘处（略压前棱，环不探出后棱） */
const BOW = { x: 84, y: 45 };

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const tailL = 'M76 45 C70 55 67 65 69 77 L75 70 L79 74 C78 63 80 52 86 46 Z';
  const tailR = 'M91 46 C97 55 100 65 100 76 L94 70 L89 74 C90 62 86 51 83 45 Z';

  return (
    <button
      type="button"
      onClick={() => navigate('/gifts')}
      data-testid="gift-box-card"
      aria-label="打开礼物盒"
      title="礼物盒"
      className={`group relative flex aspect-[172/68] max-h-full w-full items-end justify-center overflow-hidden rounded-[20px] border border-[#C6D9EA] transition active:scale-[0.98] hover:border-[#A9C8E2] dark:border-[#46516B] dark:hover:border-[#5D6B8C] ${className}`}
    >
      {/* 底色：照片右侧那种浅蓝蕾丝纹（白花暗纹），奶油盒身压在上面才跳得出来 */}
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
          {/* 丝带波点：白点两粒错开，铺满所有丝带面 */}
          <pattern id="gb-dots" width="11" height="11" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.7" fill="#fff" opacity="0.85" />
            <circle cx="8.5" cy="8.5" r="1.7" fill="#fff" opacity="0.85" />
          </pattern>
          {/* 蕾丝边的小孔：沿条身排的小圆点，远看就是蕾丝 */}
          <pattern id="gb-lace" width="7" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3" r="1" fill="#fff" opacity="0.9" />
          </pattern>
        </defs>

        {/* 桌面软阴影（对准盒子重心） */}
        <ellipse cx="128" cy="88" rx="95" ry="6" className="fill-black/15 dark:fill-black/40" />

        {/* ============ 顶面（最亮）：A B C D，往右上后退 ============ */}
        <path
          d={`M${A.x} ${A.y} L${B.x} ${B.y} L${C.x} ${C.y} L${D.x} ${D.y} Z`}
          className="fill-[#FBF5E7] dark:fill-[#EFE7D3]"
        />
        {/* 顶面蕾丝 + 丝带 */}
        <g>
          <path d={topBand(LACE_L.a, LACE_L.b)} fill="#fff" opacity="0.85" />
          <path d={topBand(LACE_L.a, LACE_L.b)} fill="url(#gb-lace)" />
          <path d={topBand(LACE_R.a, LACE_R.b)} fill="#fff" opacity="0.85" />
          <path d={topBand(LACE_R.a, LACE_R.b)} fill="url(#gb-lace)" />
          <path d={topBand(RIBBON.a, RIBBON.b)} className="fill-[#AECBE4] dark:fill-[#8FB6D9]" />
          <path d={topBand(RIBBON.a, RIBBON.b)} fill="url(#gb-dots)" />
        </g>

        {/* ============ 宽侧面（朝左下的大面）：A B B2 A2 ============ */}
        <g>
          <path
            d={`M${A.x} ${A.y} L${B.x} ${B.y} L${B.x} ${B.y + DROP} L${A.x} ${A.y + DROP} Z`}
            className="fill-[#EFE6D2] dark:fill-[#DFD3B8]"
          />
          <path d={frontBand(LACE_L.a, LACE_L.b)} fill="#fff" opacity="0.85" />
          <path d={frontBand(LACE_L.a, LACE_L.b)} fill="url(#gb-lace)" />
          <path d={frontBand(LACE_R.a, LACE_R.b)} fill="#fff" opacity="0.85" />
          <path d={frontBand(LACE_R.a, LACE_R.b)} fill="url(#gb-lace)" />
          <path d={frontBand(RIBBON.a, RIBBON.b)} className="fill-[#A3C1DB] dark:fill-[#84ACD0]" />
          <path d={frontBand(RIBBON.a, RIBBON.b)} fill="url(#gb-dots)" />
        </g>

        {/* ============ 右端面（远端窄条，最暗）：B C C2 B2 ============ */}
        <path
          d={`M${B.x} ${B.y} L${C.x} ${C.y} L${C.x} ${C.y + DROP} L${B.x} ${B.y + DROP} Z`}
          className="fill-[#E0D4BC] dark:fill-[#CDBF9F]"
        />

        {/* ============ 蝴蝶结垂带：燕尾剪口，颜色比丝带深一档（分得清层次），收在盒底棱之上 ============ */}
        <g className="fill-[#9CBBD6] dark:fill-[#7BA6C9]">
          <path d={tailL} />
          <path d={tailR} />
        </g>
        <g fill="url(#gb-dots)">
          <path d={tailL} />
          <path d={tailR} />
        </g>

        {/* ============ 蝴蝶结本体：骑在顶面丝带上（hover 结放大歪一下） ============ */}
        <g
          className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          style={{ transformOrigin: `${BOW.x}px ${BOW.y}px`, transformBox: 'view-box' }}
        >
          <g transform={`translate(${BOW.x} ${BOW.y}) rotate(-5) scale(1.15)`}>
            {/* 左右环：圆滚滚 */}
            <path
              d="M-3.4 0 C-3.2 -6.4 -8.2 -9.8 -13.1 -8.4 -18.1 -7 -20 -1.3 -16.6 2.7 -13.4 6.4 -3.6 5.8 -3.4 0 Z"
              className="fill-[#B4CFE6] dark:fill-[#96BCDD]"
            />
            <path
              d="M3.4 0 C3.2 -6.4 8.2 -9.8 13.1 -8.4 18.1 -7 20 -1.3 16.6 2.7 13.4 6.4 3.6 5.8 3.4 0 Z"
              className="fill-[#B4CFE6] dark:fill-[#96BCDD]"
            />
            {/* 环上的白波点 */}
            <g fill="#fff" opacity="0.85">
              <circle cx="-12" cy="-4.5" r="1.4" />
              <circle cx="-8" cy="1" r="1.2" />
              <circle cx="12" cy="-4.5" r="1.4" />
              <circle cx="8" cy="1" r="1.2" />
            </g>
            {/* 中心结：大一点，压住两环交汇处 */}
            <circle cx="0" cy="-0.6" r="5.2" className="fill-[#AECBE4] dark:fill-[#8FB6D9]" />
            <circle cx="-1.6" cy="-2.2" r="1.5" fill="#fff" opacity="0.7" />
          </g>
        </g>

        {/* ============ 小水钻点缀：四芒星 + 小爱心 + 银粒（撒在顶面右半边） ============ */}
        <g>
          <path
            d="M150 31.5 C150.5 34.8 151.7 36 155 36.5 C151.7 37 150.5 38.2 150 41.5 C149.5 38.2 148.3 37 145 36.5 C148.3 36 149.5 32.8 150 31.5 Z"
            fill="#fff" opacity="0.95"
          />
          <path
            d="M170 27.5 C170.4 30 171.4 31 173.9 31.4 C171.4 31.8 170.4 32.8 170 35.3 C169.6 32.8 168.6 31.8 166.1 31.4 C168.6 31 169.6 30 170 27.5 Z"
            fill="#fff" opacity="0.7"
          />
          {/* 小爱心（照片那种碎钻心） */}
          <path
            d="M128 40.5 C125.6 38.5 124.8 36.6 125.9 35.2 126.8 34.1 128 34.6 128 35.7 128 34.6 129.2 34.1 130.1 35.2 131.2 36.6 130.4 38.5 128 40.5 Z"
            fill="#DCE8F2" opacity="0.9"
          />
          {/* 银粒碎钻 */}
          <g fill="#EDF3F8">
            <circle cx="112" cy="33" r="1.4" />
            <circle cx="178" cy="36" r="1.2" />
            <circle cx="100" cy="62" r="1.3" />
            <circle cx="55" cy="72" r="1.2" />
          </g>
        </g>
      </svg>
    </button>
  );
}

export default GiftBoxCard;

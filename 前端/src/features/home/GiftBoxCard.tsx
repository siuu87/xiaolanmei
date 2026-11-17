/**
 * 礼物盒小卡（2026-11-17 八改：俯视图）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 七改的斜视立体盒被评「可爱但这个位置要俯视图」——首页这格空间又扁又小，
 * 立体构图撑不满还费眼神，俯视才是对的：**盒盖正对着观众**。
 * - 整张卡 ≈ 盒盖：奶油白圆角矩形盖满卡片，四周留一点底色当「桌面」；
 * - 盖沿一圈内缩线（盒盖和盒身的分缝），里面再贴一圈蕾丝花边；
 * - **蓝波点丝带十字交在正中**：一竖一横，交点正中央；
 * - **胖蝴蝶结骑在交点上**（两个圆滚滚的环 + 中心结），hover 放大歪一下；
 * - 小水钻撒在四个象限（四芒星 + 碎钻心 + 银粒）。
 * 配色沿用实拍照片那套：奶油白盒身 + 蓝底白波点丝带 + 浅蓝蕾丝纹底。
 */
import { useNavigate } from 'react-router-dom';

/** 卡内坐标（viewBox 240×100）。盖沿内缩线与蕾丝圈距边的距离 */
const LID_INSET = 6;
const LACE_INSET = 10;

/** 中心点：丝带十字与蝴蝶结的交点 */
const CENTER = { x: 120, y: 50 };

/** 丝带宽度（十字两条） */
const RIBBON_W = 13;

/** 蝴蝶结落点（=交点） */
const BOW = { x: 120, y: 50 };

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

  // 蕾丝圈（贴着盖沿内侧）
  const laceRect = { x: LACE_INSET, y: LACE_INSET, w: 240 - LACE_INSET * 2, h: 100 - LACE_INSET * 2 };

  return (
    <button
      type="button"
      onClick={() => navigate('/gifts')}
      data-testid="gift-box-card"
      aria-label="打开礼物盒"
      title="礼物盒"
      className={`group relative flex aspect-[172/68] max-h-full w-full items-end justify-center overflow-hidden rounded-[20px] border border-[#C6D9EA] transition active:scale-[0.98] hover:border-[#A9C8E2] dark:border-[#46516B] dark:hover:border-[#5D6B8C] ${className}`}
    >
      {/* 底色：浅蓝蕾丝纹（白花暗纹），当「桌面」，奶油盒盖压在上面才跳得出来 */}
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
          {/* 丝带波点：白点两粒错开 */}
          <pattern id="gb-dots" width="11" height="11" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.7" fill="#fff" opacity="0.85" />
            <circle cx="8.5" cy="8.5" r="1.7" fill="#fff" opacity="0.85" />
          </pattern>
          {/* 蕾丝花边：沿圈排的小孔 */}
          <pattern id="gb-lace" width="7" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3" r="1" fill="#fff" opacity="0.9" />
          </pattern>
        </defs>

        {/* ============ 盒盖：奶油白圆角矩形盖满卡片（俯视） ============ */}
        <rect x="3" y="3" width="234" height="94" rx="16" className="fill-[#FBF5E7] dark:fill-[#EFE7D3]" />
        {/* 盖沿内缝阴影（盖和盒身的分缝，压出一点厚度感） */}
        <rect x={LID_INSET} y={LID_INSET} width={240 - LID_INSET * 2} height={100 - LID_INSET * 2} rx="13"
          fill="none" className="stroke-[#E3D8BD] dark:stroke-[#D6C8A4]" strokeWidth="1.6" />
        <rect x={LID_INSET + 1.5} y={LID_INSET + 1.5} width={240 - (LID_INSET + 1.5) * 2} height={100 - (LID_INSET + 1.5) * 2} rx="12"
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.7" />

        {/* ============ 蕾丝花边圈（贴着盖沿内侧） ============ */}
        <rect x={laceRect.x} y={laceRect.y} width={laceRect.w} height={laceRect.h} rx="11"
          fill="none" stroke="#fff" strokeWidth="3.4" opacity="0.85" />
        <rect x={laceRect.x} y={laceRect.y} width={laceRect.w} height={laceRect.h} rx="11"
          fill="none" stroke="url(#gb-lace)" strokeWidth="3.4" />

        {/* ============ 蓝波点丝带十字：交在正中央 ============ */}
        {/* 竖条 */}
        <rect x={CENTER.x - RIBBON_W / 2} y="3" width={RIBBON_W} height="94" className="fill-[#AECBE4] dark:fill-[#8FB6D9]" />
        <rect x={CENTER.x - RIBBON_W / 2} y="3" width={RIBBON_W} height="94" fill="url(#gb-dots)" />
        {/* 横条 */}
        <rect x="3" y={CENTER.y - RIBBON_W / 2} width="234" height={RIBBON_W} className="fill-[#A3C1DB] dark:fill-[#84ACD0]" />
        <rect x="3" y={CENTER.y - RIBBON_W / 2} width="234" height={RIBBON_W} fill="url(#gb-dots)" />
        {/* 丝带两侧细高光（缎面感） */}
        <rect x={CENTER.x - RIBBON_W / 2 + 1.5} y="3" width="1.2" height="94" fill="#fff" opacity="0.35" />
        <rect x="3" y={CENTER.y - RIBBON_W / 2 + 1.5} width="234" height="1.2" fill="#fff" opacity="0.35" />

        {/* ============ 小水钻：四芒星 ×2 + 碎钻心 + 银粒，撒在四个象限 ============ */}
        <g>
          <path
            d="M76 26 C76.6 29.8 77.9 31.1 81.7 31.7 C77.9 32.3 76.6 33.6 76 37.4 C75.4 33.6 74.1 32.3 70.3 31.7 C74.1 31.1 75.4 29.8 76 26 Z"
            fill="#fff" opacity="0.95"
          />
          <path
            d="M165 63 C165.5 66 166.6 67.1 169.6 67.6 C166.6 68.1 165.5 69.2 165 72.2 C164.5 69.2 163.4 68.1 160.4 67.6 C163.4 67.1 164.5 66 165 63 Z"
            fill="#fff" opacity="0.8"
          />
          <path
            d="M163 26.5 C160.9 24.8 160.2 23.2 161.2 22 162 21.1 163 21.5 163 22.4 163 21.5 164 21.1 164.8 22 165.8 23.2 165.1 24.8 163 26.5 Z"
            fill="#DCE8F2" opacity="0.9"
          />
          <g fill="#EDF3F8">
            <circle cx="52" cy="66" r="1.4" />
            <circle cx="188" cy="30" r="1.3" />
            <circle cx="36" cy="36" r="1.1" />
            <circle cx="206" cy="66" r="1.2" />
          </g>
        </g>

        {/* ============ 胖蝴蝶结：骑在十字交点上（hover 放大歪一下） ============ */}
        <g
          className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          style={{ transformOrigin: `${BOW.x}px ${BOW.y}px`, transformBox: 'view-box' }}
        >
          <g transform={`translate(${BOW.x} ${BOW.y})`}>
            {/* 左右环：圆滚滚，比斜视版大一圈压住交点 */}
            <path
              d="M-3.8 0 C-3.6 -7.2 -9.2 -11 -14.8 -9.5 -20.5 -8 -22.6 -1.5 -18.8 3 -15 7.2 -4.1 6.6 -3.8 0 Z"
              className="fill-[#B4CFE6] dark:fill-[#96BCDD]"
            />
            <path
              d="M3.8 0 C3.6 -7.2 9.2 -11 14.8 -9.5 20.5 -8 22.6 -1.5 18.8 3 15 7.2 4.1 6.6 3.8 0 Z"
              className="fill-[#B4CFE6] dark:fill-[#96BCDD]"
            />
            {/* 环内侧暗褶：软软一道，不再是尖刺 */}
            <path d="M-8 -4.8 C-5.8 -6.2 -3.8 -6.7 -2.2 -6.4 -3.8 -4.2 -5.8 -3.3 -8 -4.8 Z" fill="#8FAECB" opacity="0.45" className="dark:fill-[#6E95B8]" />
            <path d="M8 -4.8 C5.8 -6.2 3.8 -6.7 2.2 -6.4 3.8 -4.2 5.8 -3.3 8 -4.8 Z" fill="#8FAECB" opacity="0.45" className="dark:fill-[#6E95B8]" />
            {/* 环上的白波点 */}
            <g fill="#fff" opacity="0.85">
              <circle cx="-14" cy="-5" r="1.5" />
              <circle cx="-9" cy="1.5" r="1.3" />
              <circle cx="14" cy="-5" r="1.5" />
              <circle cx="9" cy="1.5" r="1.3" />
            </g>
            {/* 中心结：胖圆，压住两环交汇 */}
            <circle cx="0" cy="-0.5" r="5.8" className="fill-[#AECBE4] dark:fill-[#8FB6D9]" />
            <circle cx="-1.8" cy="-2.4" r="1.7" fill="#fff" opacity="0.7" />
          </g>
        </g>
      </svg>
    </button>
  );
}

export default GiftBoxCard;

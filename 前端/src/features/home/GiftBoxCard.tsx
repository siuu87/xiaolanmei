/**
 * 礼物盒小卡（2026-11-17 五改：照 @泡椒鱼泡 的实拍礼物盒重做）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户给了参考照片（奶油白礼盒 + 蓝波点丝带 + 蕾丝 + 大蝴蝶结），要「这个样子的礼物盒」。
 * 跟上一版（俯视粉盒）的区别：
 *   - **斜俯视、有厚度**：看得见顶面 + 宽侧面 + 右端面三个面（顶面最亮、端面最暗），
 *     盒子底下压一片软阴影 —— 是「一只放在桌上的盒子」，不是一张平铺的包装纸；
 *   - **奶油白盒身**（照片是米白缎面），底色换成照片那种浅蓝蕾丝纹，衬托奶油色；
 *   - 丝带是**蓝底白波点**，横着绕过顶面、沿宽侧面垂下去，两侧各一条**白蕾丝边**；
 *   - **大蝴蝶结骑在丝带上**（顶面靠前缘），圆环 + 中心结 + **两条燕尾垂带**
 *     搭在宽侧面上（照片同款垂法），hover 时结轻轻放大歪一下；
 *   - 点缀是**小水钻**：四芒星 + 小爱心 + 几粒银点，不是贴纸感。
 * 全部写死色值，不跟主题走；深色下盒身压暗一档、丝带提亮（深色下丝带必须亮着才不脏）。
 */
import { useNavigate } from 'react-router-dom';

/** 宽侧面高 34，垂下的丝带/蕾丝都从这里推 */
const DROP = 34;

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

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

        {/* 桌面软阴影 */}
        <ellipse cx="128" cy="94" rx="86" ry="7" className="fill-black/15 dark:fill-black/40" />

        {/*
          盒子几何（手推的平行四边形，三条棱共用顶点）：
            顶面   At(96,8)  Bt(196,34)  Ct(150,58)  Dt(50,32)
            宽侧面 Dt(50,32)  Ct(150,58)  Ct2(150,92)  Dt2(50,66)   —— 朝左下，照片里带蕾丝的大面
            端面   Ct(150,58)  Bt(196,34)  Bt2(196,68)  Ct2(150,92) —— 右端，最暗
          丝带沿短轴方向绕盒：顶面一段 + 宽侧面垂下一段，蕾丝条贴在两侧。
        */}

        {/* ============ 顶面（最亮） ============ */}
        <g>
          <path d="M96 8 L196 34 L150 58 L50 32 Z" className="fill-[#FBF5E7] dark:fill-[#EFE7D3]" />
          {/* 顶面丝带 + 蕾丝 */}
          <path d="M70 37.2 L80 39.8 L126 15.8 L116 13.2 Z" fill="#fff" opacity="0.9" />
          <path d="M70 37.2 L80 39.8 L126 15.8 L116 13.2 Z" fill="url(#gb-lace)" />
          <path d="M102 45.5 L112 48.1 L158 24.1 L148 21.5 Z" fill="#fff" opacity="0.9" />
          <path d="M102 45.5 L112 48.1 L158 24.1 L148 21.5 Z" fill="url(#gb-lace)" />
          <path
            d={`M80 39.8 L102 45.5 L148 21.5 L126 15.8 Z`}
            className="fill-[#AECBE4] dark:fill-[#8FB6D9]"
          />
          <path d="M80 39.8 L102 45.5 L148 21.5 L126 15.8 Z" fill="url(#gb-dots)" />
        </g>

        {/* ============ 宽侧面（朝左下的大面） ============ */}
        <g>
          <path d={`M50 32 L150 58 L150 ${58 + DROP} L50 ${32 + DROP} Z`} className="fill-[#EFE6D2] dark:fill-[#DFD3B8]" />
          {/* 蕾丝 + 丝带从顶面棱上垂下来 */}
          <path d={`M70 37.2 L80 39.8 L80 ${39.8 + DROP} L70 ${37.2 + DROP} Z`} fill="#fff" opacity="0.9" />
          <path d={`M70 37.2 L80 39.8 L80 ${39.8 + DROP} L70 ${37.2 + DROP} Z`} fill="url(#gb-lace)" />
          <path d={`M102 45.5 L112 48.1 L112 ${48.1 + DROP} L102 ${45.5 + DROP} Z`} fill="#fff" opacity="0.9" />
          <path d={`M102 45.5 L112 48.1 L112 ${48.1 + DROP} L102 ${45.5 + DROP} Z`} fill="url(#gb-lace)" />
          <path d={`M80 39.8 L102 45.5 L102 ${45.5 + DROP} L80 ${39.8 + DROP} Z`} className="fill-[#A3C1DB] dark:fill-[#84ACD0]" />
          <path d={`M80 39.8 L102 45.5 L102 ${45.5 + DROP} L80 ${39.8 + DROP} Z`} fill="url(#gb-dots)" />
        </g>

        {/* ============ 右端面（最暗） ============ */}
        <path d={`M150 58 L196 34 L196 ${34 + DROP} L150 ${58 + DROP} Z`} className="fill-[#E0D4BC] dark:fill-[#CDBF9F]" />

        {/* ============ 蝴蝶结垂带：从结上搭下来，燕尾剪口，收在宽侧面里（不垂过盒底） ============ */}
        <g className="fill-[#A3C1DB] dark:fill-[#84ACD0]">
          <path d="M88 41 C81 52 78 62 80 75 L86 69 L92 73 C90 62 91 50 96 43 Z" />
          <path d="M107 42 C113 52 116 62 117 74 L111 68.5 L105 72 C105 62 102 52 99 43 Z" />
        </g>
        {/* 垂带上的波点 */}
        <g fill="url(#gb-dots)">
          <path d="M88 41 C81 52 78 62 80 75 L86 69 L92 73 C90 62 91 50 96 43 Z" />
          <path d="M107 42 C113 52 116 62 117 74 L111 68.5 L105 72 C105 62 102 52 99 43 Z" />
        </g>

        {/* ============ 蝴蝶结本体：骑在顶面丝带上（hover 结放大歪一下） ============ */}
        <g
          className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          style={{ transformOrigin: '97px 36px', transformBox: 'view-box' }}
        >
          <g transform="translate(97 36) rotate(-10) scale(1.15)">
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
            {/* 环内侧暗褶 */}
            <path d="M-7.2 -4.4 C-5.2 -5.7 -3.2 -6.1 -1.8 -5.9 -3.4 -3.9 -5.4 -3 -7.2 -4.4 Z" fill="#8FAECB" opacity="0.5" className="dark:fill-[#6E95B8]" />
            <path d="M7.2 -4.4 C5.2 -5.7 3.2 -6.1 1.8 -5.9 3.4 -3.9 5.4 -3 7.2 -4.4 Z" fill="#8FAECB" opacity="0.5" className="dark:fill-[#6E95B8]" />
            {/* 中心结 */}
            <circle cx="0" cy="-0.6" r="4.6" className="fill-[#AECBE4] dark:fill-[#8FB6D9]" />
            <circle cx="-1.4" cy="-2" r="1.4" fill="#fff" opacity="0.7" />
          </g>
        </g>

        {/* ============ 小水钻点缀：四芒星 + 小爱心 + 银粒 ============ */}
        <g>
          <path
            d="M170 35 C170.5 38.3 171.7 39.5 175 40 C171.7 40.5 170.5 41.7 170 45 C169.5 41.7 168.3 40.5 165 40 C168.3 39.5 169.5 38.3 170 35 Z"
            fill="#fff" opacity="0.95"
          />
          <path
            d="M186 26.5 C186.4 29 187.4 30 189.9 30.4 187.4 30.8 186.4 31.8 186 34.3 185.6 31.8 184.6 30.8 182.1 30.4 184.6 30 185.6 29 186 26.5 Z"
            fill="#fff" opacity="0.7"
          />
          {/* 小爱心（照片左下那种碎钻心） */}
          <path
            d="M140 45.5 C137.6 43.5 136.8 41.6 137.9 40.2 138.8 39.1 140 39.6 140 40.7 140 39.6 141.2 39.1 142.1 40.2 143.2 41.6 142.4 43.5 140 45.5 Z"
            fill="#DCE8F2" opacity="0.9"
          />
          {/* 银粒碎钻 */}
          <g fill="#EDF3F8">
            <circle cx="154" cy="30" r="1.4" />
            <circle cx="178" cy="47" r="1.2" />
            <circle cx="120" cy="78" r="1.3" />
            <circle cx="63" cy="60" r="1.2" />
          </g>
        </g>
      </svg>
    </button>
  );
}

export default GiftBoxCard;

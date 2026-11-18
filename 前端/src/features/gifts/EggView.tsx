/**
 * 彩蛋实物（2026-11-18 三十三改）：纪念架 / 阅读层里的彩蛋不再用星芒图标
 * （用户「为什么第一个还是礼物盒」——图标太抽象，不像实物），改为一颗画出来的
 * 蛋：奶绿蛋壳 + 墨绿波浪腰带 + 斑点，底部带落影，直接浮在架子上。
 * 配色沿用 TINT.easter（ribbon #7D9270 / boxBody #DCE5CE）一系。
 */
export function EggView({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 156" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="egg-shell" x1="30" y1="14" x2="92" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4F2E7" />
          <stop offset="0.55" stopColor="#E7EBDD" />
          <stop offset="1" stopColor="#DCE5CE" />
        </linearGradient>
      </defs>

      {/* 落影：让蛋像「放在」架上 */}
      <ellipse cx="60" cy="146" rx="34" ry="6" fill="#6E6252" opacity="0.18" />

      {/* 蛋壳 */}
      <path
        d="M60 8C86 8 103 50 103 88c0 32-18 52-43 52S17 120 17 88C17 50 34 8 60 8Z"
        fill="url(#egg-shell)"
      />
      <path
        d="M60 8C86 8 103 50 103 88c0 32-18 52-43 52S17 120 17 88C17 50 34 8 60 8Z"
        stroke="#7D9270"
        strokeOpacity="0.35"
        strokeWidth="2"
      />

      {/* 左上高光 */}
      <path
        d="M38 30c-6 10-10 22-11 34"
        stroke="#FFFFFF"
        strokeOpacity="0.65"
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* 上半壳斑点 */}
      <g fill="#7D9270" opacity="0.4">
        <circle cx="44" cy="52" r="3.2" />
        <circle cx="66" cy="40" r="2.6" />
        <circle cx="78" cy="58" r="3" />
        <circle cx="52" cy="68" r="2.4" />
        <circle cx="86" cy="78" r="2.2" />
      </g>

      {/* 波浪腰带 */}
      <path
        d="M17 86c7 6 13 6 20 0s13-6 20 0 13 6 20 0 13-6 20 0 6 4 6 4v10s-2 2-6-2-13-6-20 0-13 6-20 0-13-6-20 0-13 6-20 0-6-4-6-4v-10s2 2 6 2Z"
        fill="#7D9270"
      />
      <path
        d="M17 92c7 6 13 6 20 0s13-6 20 0 13 6 20 0 13-6 20 0"
        stroke="#61755A"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* 下半壳斑点 */}
      <g fill="#61755A" opacity="0.35">
        <circle cx="40" cy="118" r="3" />
        <circle cx="62" cy="126" r="2.4" />
        <circle cx="80" cy="114" r="2.8" />
      </g>
    </svg>
  );
}

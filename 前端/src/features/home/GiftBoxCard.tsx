/**
 * 礼物盒小卡（2026-11-16，17 日改立体）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 画法是**等距立体**（isometric）：左前面 / 右前面 / 顶面三块受光面颜色深浅不同，
 * 盒盖比盒身大一圈、四周悬挑，盖上有一道盖沿阴影 —— 远看是一个「摆在那儿的真盒子」，
 * 不是图标。丝带从盒身两面包上来、顶面十字交叉，蝴蝶结有两个环 + 两条垂尾。
 * 全部用 currentColor + 不同透明度分层，自动跟主题色走。
 */
import { useNavigate } from 'react-router-dom';

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/gifts')}
      data-testid="gift-box-card"
      aria-label="打开礼物盒"
      title="礼物盒"
      className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-2xl border border-border/70 bg-surface px-3 py-2 text-left transition active:scale-[0.98] hover:border-primary/30 ${className}`}
    >
      <svg
        viewBox="0 0 64 64"
        aria-hidden
        className="h-[50px] w-[50px] shrink-0 text-primary transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-[1.06]"
      >
        {/* 落地影子 */}
        <ellipse cx="32" cy="58.5" rx="19" ry="3.2" fill="currentColor" opacity="0.13" />

        {/* ── 盒身（先画，上面会被盒盖压住） ── */}
        {/* 左前面：最暗 */}
        <polygon points="15,33.5 32,41 32,56.5 15,49" fill="currentColor" opacity="0.46" />
        {/* 右前面：次暗 */}
        <polygon points="32,41 49,33.5 49,49 32,56.5" fill="currentColor" opacity="0.36" />
        {/* 盒身竖丝带：顺着前面两条棱各包一条 */}
        <polygon points="21.8,36.5 25.2,38 25.2,53.5 21.8,52" fill="currentColor" opacity="0.82" />
        <polygon points="38.8,38 42.2,36.5 42.2,52 38.8,53.5" fill="currentColor" opacity="0.82" />

        {/* ── 盒盖（大一圈，悬挑） ── */}
        {/* 盖沿在盒身上投的阴影 */}
        <polygon points="15,33.5 32,41 32,43 15,35.5" fill="currentColor" opacity="0.18" />
        <polygon points="32,41 49,33.5 49,35.5 32,43" fill="currentColor" opacity="0.15" />
        {/* 盒盖左沿 / 右沿 */}
        <polygon points="12,27 32,34 32,40.5 12,33.5" fill="currentColor" opacity="0.42" />
        <polygon points="32,34 52,27 52,33.5 32,40.5" fill="currentColor" opacity="0.34" />
        {/* 盒盖顶面：最亮 */}
        <polygon points="32,20 52,27 32,34 12,27" fill="currentColor" opacity="0.26" />
        {/* 盖顶不再画丝带条：蝴蝶结本身就把「丝带系过」说清楚了 */}
        {/* 盖沿折线高光：让边缘「立起来」 */}
        <polyline
          points="12,27 32,34 52,27"
          fill="none"
          stroke="#fff"
          strokeWidth="1"
          opacity="0.35"
          strokeLinejoin="round"
        />

        {/* ── 蝴蝶结：实心泪滴环，左右分开、中间结，垂尾搭过盖沿 ── */}
        {/* 垂尾先画（压在环下面） */}
        <path
          d="M30.8 27.8c-1 2-2.2 3.4-3.8 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M33.2 27.8c1 2 2.2 3.4 3.8 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* 左环 / 右环：泪滴形，指向中间的结 */}
        <path
          d="M30.4 26.6C27.6 21.8 21.6 21.4 20.9 24.8c-.6 2.9 5.1 4.3 9.5 1.8z"
          fill="currentColor"
          opacity="0.9"
        />
        <path
          d="M33.6 26.6c2.8-4.8 8.8-5.2 9.5-1.8.6 2.9-5.1 4.3-9.5 1.8z"
          fill="currentColor"
          opacity="0.9"
        />
        {/* 中心结 */}
        <circle cx="32" cy="26.4" r="2.1" fill="currentColor" opacity="0.97" />
      </svg>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[12px] font-medium leading-tight text-foreground">
          礼物盒
        </span>
        <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
          点开看看里面
        </span>
      </span>
    </button>
  );
}

export default GiftBoxCard;

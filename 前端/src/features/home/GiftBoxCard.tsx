/**
 * 礼物盒小卡（2026-11-16）
 *
 * 接替原来「心情三弧」占的那半格：方盒子 + 竖丝带 + 顶上一个蝴蝶结，
 * 点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 为什么不是图标：那个位置只有 ~70px 高、半列宽，塞一个 lucide 的 Gift 太素，
 * 画个盒子放上去才像「摆在那儿的一件东西」。
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
      {/* 盒子本体：三块色 + 一条竖丝带 + 蝴蝶结，全部跟着主题色走 */}
      <svg
        viewBox="0 0 64 64"
        aria-hidden
        className="h-[46px] w-[46px] shrink-0 text-primary transition group-hover:scale-[1.04]"
      >
        {/* 影子 */}
        <ellipse cx="32" cy="57" rx="19" ry="3" fill="currentColor" opacity="0.12" />
        {/* 盒身 */}
        <rect x="13" y="30" width="38" height="24" rx="3" fill="currentColor" opacity="0.13" />
        <rect x="13" y="30" width="38" height="24" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
        {/* 盒盖 */}
        <rect x="10" y="23" width="44" height="10" rx="2.5" fill="currentColor" opacity="0.22" />
        <rect x="10" y="23" width="44" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
        {/* 竖丝带 */}
        <rect x="29" y="23" width="6" height="31" fill="currentColor" opacity="0.42" />
        {/* 蝴蝶结：左右两片 + 中间结 */}
        <path
          d="M32 22c-1-5-5-8-9-7-3.6.9-4.4 5.6-1.6 8 2.4 2 7.4 1.6 10.6-1z"
          fill="currentColor"
          opacity="0.34"
        />
        <path
          d="M32 22c1-5 5-8 9-7 3.6.9 4.4 5.6 1.6 8-2.4 2-7.4 1.6-10.6-1z"
          fill="currentColor"
          opacity="0.34"
        />
        <circle cx="32" cy="21" r="2.6" fill="currentColor" opacity="0.7" />
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

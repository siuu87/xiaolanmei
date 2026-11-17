/**
 * 礼物盒小卡（2026-11-17：整张卡就是一个礼物盒）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户：整个卡片都是一个礼物盒的样子 —— 所以不再是「卡里画个小盒子 + 旁边写字」，
 * 而是把卡片本身当成盒子：
 *   卡面 = 盒身（主题色淡染 + 左右明暗渐变出体积），
 *   顶部一条 = 盒盖（深一档，下沿投阴影），
 *   正中一条竖带 = 丝带（从盖顶贯到底），
 *   盖沿正中 = 蝴蝶结（两环 + 结 + 垂尾），
 *   底部居中一行小字 = 名字。
 * 全部用 primary 的透明度分层，深浅主题自动适配。
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
      className={`group relative flex aspect-[172/68] max-h-full w-full items-end justify-center overflow-hidden rounded-2xl border border-primary/30 transition active:scale-[0.98] hover:border-primary/50 ${className}`}
    >
      {/* 盒身：主题色淡染 + 左右暗、中间亮的体积感 */}
      <div className="absolute inset-0 bg-primary/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-black/10" />

      {/* 盒盖：顶部一条，深一档 */}
      <div className="absolute inset-x-0 top-0 h-[15px] border-b border-primary/40 bg-primary/35" />
      {/* 盖沿在盒身上投的阴影 */}
      <div className="absolute inset-x-0 top-[15px] h-[5px] bg-black/15" />

      {/* 竖丝带：正中一条，从盖顶贯到底 */}
      <div className="absolute inset-y-0 left-1/2 w-[16px] -translate-x-1/2 bg-primary/55" />
      {/* 丝带中线高光，缎面感 */}
      <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white/35" />

      {/* 蝴蝶结：骑在盖沿正中，垂尾搭到盒身 */}
      <svg
        viewBox="0 0 64 36"
        aria-hidden
        className="absolute left-1/2 top-0 h-[27px] w-[48px] -translate-x-1/2 text-primary transition-transform duration-300 group-hover:scale-110"
      >
        {/* 垂尾（压在环下面，越过盖沿） */}
        <path
          d="M29.5 20c-1.6 4.2-3.7 7.2-6.8 9.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          opacity="0.72"
        />
        <path
          d="M34.5 20c1.6 4.2 3.7 7.2 6.8 9.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          opacity="0.72"
        />
        {/* 左环 / 右环：泪滴形，指向中间的结 */}
        <path
          d="M30.6 15.6C25.8 6.8 13.6 6.2 12.2 13c-1.1 5.4 9.4 8 18.4 2.6z"
          fill="currentColor"
          opacity="0.92"
        />
        <path
          d="M33.4 15.6c4.8-8.8 17-9.4 18.4-2.6 1.1 5.4-9.4 8-18.4 2.6z"
          fill="currentColor"
          opacity="0.92"
        />
        {/* 中心结 */}
        <circle cx="32" cy="15.4" r="4" fill="currentColor" />
      </svg>

      {/* 名字：底部居中（用户 11-16 定过这类卡只写名字） */}
      <span className="relative z-10 pb-[5px] text-[11px] font-medium tracking-wide text-foreground/90">
        礼物盒
      </span>
    </button>
  );
}

export default GiftBoxCard;

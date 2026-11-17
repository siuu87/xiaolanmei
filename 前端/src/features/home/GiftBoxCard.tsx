/**
 * 礼物盒小卡（2026-11-17 四改：可爱版）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户：俯视构图保留，但要「可爱点」、上一版太素太冷。
 * 可爱从哪来：① 换掉主题蓝，用**固定的奶油粉**系（浅色 = 奶粉底 + 玫粉丝带，
 * 深色 = 可可梅底 + 干玫瑰丝带，两版都软）；② 包装纸**加波点**——
 * 甜甜的礼品纸就靠这个；③ 蝴蝶结**圆滚滚**（环画成胖圆形，不是细长的泪滴）；
 * ④ 角落两颗**小星星**闪一下；⑤ 圆角加大一号。
 * 全部写死色值，不跟主题走 —— 可爱不跟主题走。
 */
import { useNavigate } from 'react-router-dom';

/** 四芒星：可爱版的点缀（别用五角星，太「考试」了） */
function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} style={style}>
      <path
        d="M12 2.6 C12.9 8.6 15.4 11.1 21.4 12 C15.4 12.9 12.9 15.4 12 21.4 C11.1 15.4 8.6 12.9 2.6 12 C8.6 11.1 11.1 8.6 12 2.6 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function GiftBoxCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/gifts')}
      data-testid="gift-box-card"
      aria-label="打开礼物盒"
      title="礼物盒"
      className={`group relative flex aspect-[172/68] max-h-full w-full items-end justify-center overflow-hidden rounded-[20px] border border-[#F6C3D4] transition active:scale-[0.98] hover:border-[#F19DBA] dark:border-[#5A4152] dark:hover:border-[#7A5568] ${className}`}
    >
      {/* 盒面：奶油粉 + 白波点（礼品纸）；深色也要亮着粉，闷成梅干就脏了 */}
      <div className="absolute inset-0 bg-[#FFE4EE] dark:bg-[#4A3143]" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,.85) 1.4px, transparent 1.5px)',
          backgroundSize: '16px 16px',
          backgroundPosition: '3px 4px',
          opacity: 0.55,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden dark:block"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,214,231,.30) 1.4px, transparent 1.5px)',
          backgroundSize: '16px 16px',
          backgroundPosition: '3px 4px',
        }}
      />

      {/* 内圈盖沿线 */}
      <div className="absolute inset-[5px] rounded-[15px] border border-[#F8CBDA] dark:border-[#7A5068]" />

      {/* 竖丝带 */}
      <div className="absolute inset-y-0 left-1/2 w-[16px] -translate-x-1/2 bg-[#F7ABC2] dark:bg-[#D68CA8]" />
      <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white/55" />
      {/* 横丝带 */}
      <div className="absolute inset-x-0 top-1/2 h-[14px] -translate-y-1/2 bg-[#F7ABC2] dark:bg-[#D68CA8]" />
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/40" />

      {/* 蝴蝶结：圆滚滚的环，骑在正中 */}
      <svg
        viewBox="0 0 64 34"
        aria-hidden
        className="absolute left-1/2 top-1/2 z-10 h-[27px] w-[51px] -translate-x-1/2 -translate-y-1/2 text-[#EC7FA6] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 dark:text-[#E799B9]"
      >
        {/* 左环 / 右环：胖圆形 */}
        <path
          d="M28.6 17C28.8 10.6 23.8 7.2 18.9 8.6 13.9 10 12 15.7 15.4 19.7 18.6 23.4 28.4 22.8 28.6 17z"
          fill="currentColor"
        />
        <path
          d="M35.4 17c-.2-6.4 4.8-9.8 9.7-8.4 5 1.4 6.9 7.1 3.5 11.1-3.2 3.7-13 3.1-13.2-2.7z"
          fill="currentColor"
        />
        {/* 环上的暗褶：靠近结的那一小块 */}
        <path d="M24.8 12.6c2-1.3 4-1.7 5.4-1.5-1.6 2-3.6 2.9-5.4 1.5z" fill="#C9557F" opacity="0.45" />
        <path d="M39.2 12.6c-2-1.3-4-1.7-5.4-1.5 1.6 2 3.6 2.9 5.4 1.5z" fill="#C9557F" opacity="0.45" />
        {/* 中心结 */}
        <circle cx="32" cy="16.4" r="4.6" fill="currentColor" />
        <circle cx="30.6" cy="15" r="1.4" fill="#fff" opacity="0.55" />
      </svg>

      {/* 点缀小星星 */}
      <Sparkle className="absolute left-[13px] top-[11px] h-[9px] w-[9px] text-[#FFC95E] dark:text-[#FFD98A]" />
      <Sparkle
        className="absolute bottom-[10px] right-[15px] h-[7px] w-[7px] text-white/90 dark:text-white/50"
        style={{ transform: 'rotate(18deg)' }}
      />
    </button>
  );
}

export default GiftBoxCard;

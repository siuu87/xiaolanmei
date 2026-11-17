/**
 * 礼物盒小卡（2026-11-17 三改：俯视）
 *
 * 接替原来「心情三弧」占的那半格，点一下直接进 `/gifts`（礼物盒页面）。
 *
 * 用户：俯视的礼物盒，蝴蝶结在正中间，不用写字 —— 所以这是**从上往下看**一只
 * 系好丝带的盒子：整张卡就是盒盖顶面，横竖两条丝带在正中交叉，
 * 蝴蝶结骑在交叉点上。内圈一圈细线是盖沿，暗示盖子比盒子大一圈。
 * 没有「盖 + 身」的立面了，也就没有盒盖条和投影；体积感靠左右渐变。
 * 全部 primary 分层，深浅主题自动适配。
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
      {/* 盒盖顶面 */}
      <div className="absolute inset-0 bg-primary/15" />
      {/* 左右暗、中间亮的体积感 */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/12 via-transparent to-black/12" />
      {/* 盖沿内圈线：俯视里盖子的边 */}
      <div className="absolute inset-[5px] rounded-[14px] border border-primary/30" />

      {/* 竖丝带（前-后向） */}
      <div className="absolute inset-y-0 left-1/2 w-[16px] -translate-x-1/2 bg-primary/55" />
      <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white/30" />
      {/* 横丝带（左-右向） */}
      <div className="absolute inset-x-0 top-1/2 h-[14px] -translate-y-1/2 bg-primary/50" />
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/25" />

      {/* 蝴蝶结：正中，骑在十字交叉点上（俯视看不到垂尾，被结挡住） */}
      <svg
        viewBox="0 0 64 32"
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[26px] w-[52px] -translate-x-1/2 -translate-y-1/2 text-primary transition-transform duration-300 group-hover:scale-110"
      >
        {/* 左环 / 右环：泪滴形，指向中心 */}
        <path
          d="M28.6 16C23.6 7.2 10.2 6.8 8.6 13.6 7.3 19.6 19.4 22.4 28.6 16z"
          fill="currentColor"
          opacity="0.94"
        />
        <path
          d="M35.4 16c5-8.8 18.4-9.2 20-2.4 1.3 6-10.8 8.8-20 2.4z"
          fill="currentColor"
          opacity="0.94"
        />
        {/* 中心结 */}
        <circle cx="32" cy="16" r="4.6" fill="currentColor" />
        {/* 结上的高光点 */}
        <circle cx="30.8" cy="14.8" r="1.2" fill="#fff" opacity="0.4" />
      </svg>
    </button>
  );
}

export default GiftBoxCard;

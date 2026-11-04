import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 「封面 + 上叠白卡」个人页版式（对齐 2026-11-04 设计稿：97:4 角色页 / 130:62 我的页）。
 *
 * 结构：浅蓝小封面（约 110px 可见，装饰白圈 + 「更换封面」小药丸）
 * → 白色大卡圆角上移叠在封面下沿 → 头像（96px）骑在分界线正中 → 卡内内容往下排。
 *
 * 只是版式骨架：数据、点击行为全部由调用方给。整块可滚动（外层负责滚动容器），
 * 内容超一屏时自然「往上滑」。
 */

/** 封面底色：浅蓝（两套主题都用这个语义色，dark 下压暗） */
const COVER_BG = 'bg-[#dce9f6] dark:bg-[#1e2c3d]';

export function ProfileCoverSheet({
  avatar,
  onAvatarClick,
  avatarLabel,
  coverPill = '更换封面',
  onCoverPillClick,
  className,
  children,
}: {
  /** 96px 圆头像内部内容（调用方放 <AvatarContent/>），容器这里包 */
  avatar: ReactNode;
  onAvatarClick?: () => void;
  avatarLabel?: string;
  /** 封面右上的小药丸，默认「更换封面」；传空串则不渲染 */
  coverPill?: string;
  onCoverPillClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('relative', className)}>
      {/* 封面：小面积浅蓝 + 装饰圈（封面可见高度 = h-36 - 白卡上叠的 mt-9 ≈ 110px） */}
      <div className={cn('relative h-36 overflow-hidden', COVER_BG)} aria-hidden>
        <span className="absolute left-9 top-4 h-[90px] w-[90px] rounded-full bg-white/45 dark:bg-white/10" />
        <span className="absolute right-[74px] top-6 h-[60px] w-[60px] rounded-full bg-white/40 dark:bg-white/10" />
        <span className="absolute left-14 top-28 h-[46px] w-[46px] rounded-full bg-white/50 dark:bg-white/10" />
        <span className="absolute right-[46px] top-[104px] h-[30px] w-[30px] rounded-full bg-white/55 dark:bg-white/10" />
        {coverPill && (
          <button
            type="button"
            onClick={onCoverPillClick}
            className="absolute right-4 top-[104px] z-10 rounded-full bg-slate-600/55 px-3 py-1.5 text-[10px] text-white transition hover:bg-slate-600/70 active:scale-95"
          >
            {coverPill}
          </button>
        )}
      </div>

      {/* 白卡：上移叠在封面下沿，圆角只在上侧 */}
      <div className="relative -mt-9 rounded-t-[24px] bg-page-bg pb-2 shadow-[0_-6px_24px_-20px_hsl(var(--shadow-color)/0.4)]">
        {/* 头像骑线：中心正好压在白卡顶边上 */}
        <button
          type="button"
          onClick={onAvatarClick}
          aria-label={avatarLabel ?? '头像'}
          className="absolute -top-12 left-1/2 z-10 flex h-24 w-24 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full bg-chat-pill ring-4 ring-white/70 dark:ring-white/10"
        >
          {avatar}
        </button>

        {/* 内容：顶部留出头像下半（48px）+ 呼吸 24px */}
        <div className="pt-[72px]">{children}</div>
      </div>
    </div>
  );
}

/**
 * 4 模块数据卡（消息 / 通话 / 记忆 / 信件）——两个个人页共用。
 * 均匀分布：每格 flex-1，数字/标签文本居中；竖发丝线分隔。
 * 「通话」可点 → 通话记录列表（onCalls）。
 */
export function ProfileStats({
  msg,
  calls,
  memories,
  letters,
  onCalls,
}: {
  msg: number | string;
  calls: number | string;
  memories: number | string;
  letters: number | string;
  onCalls: () => void;
}) {
  const cells: Array<{ v: string; l: string; onClick?: () => void; testId?: string }> = [
    { v: Number(msg).toLocaleString('en-US'), l: '消息' },
    { v: String(calls), l: '通话', onClick: onCalls, testId: 'profile-stat-calls' },
    { v: String(memories), l: '记忆' },
    { v: String(letters), l: '信件' },
  ];
  return (
    <div className="mx-4 grid grid-cols-4 rounded-2xl bg-chat-ai py-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
      {cells.map((c, i) => {
        const inner = (
          <>
            <span className="text-[18px] font-semibold leading-none tabular-nums">{c.v}</span>
            <span className="text-[10px] text-chat-meta">{c.l}</span>
          </>
        );
        const cls = cn(
          'flex flex-col items-center gap-1.5 border-chat-line',
          i > 0 && 'border-l',
        );
        return c.onClick ? (
          <button
            key={c.l}
            type="button"
            onClick={c.onClick}
            data-testid={c.testId}
            className={cn(cls, 'transition active:scale-95')}
            aria-label={`查看${c.l}记录`}
          >
            {inner}
          </button>
        ) : (
          <div key={c.l} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

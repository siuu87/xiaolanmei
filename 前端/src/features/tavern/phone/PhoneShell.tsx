/**
 * 酒馆「小手机」模块 —— 沉浸式全屏容器 + 左侧竖排导轨导航
 *
 * 2026-10-22 按用户参考图（小红书「堆堆小机」截图）重做导航：
 * 底部 Tab 栏改为**左侧竖排导轨**——顶部圆形返回键（退出小手机），中间一列导航圆钮
 * （激活 = 白底圆片 + 深色图标 + 柔和投影；未激活 = 裸灰图标），底部两个带小字标签的
 * 操作钮（发起聊天 / 角色卡），一条细连线把整列串起来（参考图的时间轴质感）。
 *
 * 结构：左导轨（nav）→ 内容区（data-bb-screen，壁纸与主题作用域）。
 * 「卡片/资产」不再占导航位：角色卡库降级为二级栈页，入口在导轨底部「角色卡」。
 */
import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  MessageCircle,
  Users,
  Compass,
  Settings,
  ChevronLeft,
  SquarePen,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PhoneTab = 'sessions' | 'contacts' | 'discover' | 'core';

/** 左侧导航定义：信息 / 通讯录 / 发现 / 中枢（卡片库不占导航位，走导轨底部入口） */
export const PHONE_TABS: { key: PhoneTab; label: string; icon: typeof MessageCircle }[] = [
  { key: 'sessions', label: '信息', icon: MessageCircle },
  { key: 'contacts', label: '通讯录', icon: Users },
  { key: 'discover', label: '发现', icon: Compass },
  { key: 'core', label: '中枢', icon: Settings },
];

/* ------------------------------ 左侧导轨 ------------------------------ */

/** 导航圆钮：激活时白底圆片托住图标，未激活时裸图标（参考图的样子） */
function RailTab({
  icon: Icon,
  label,
  tabKey,
  active,
  badge,
  onClick,
}: {
  icon: typeof MessageCircle;
  label: string;
  tabKey: PhoneTab;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`phone-tab-${tabKey}`}
      aria-label={label}
      aria-current={active}
      title={label}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95',
        active
          ? 'bg-phone-surface text-phone-ink shadow-[0_2px_10px_rgba(0,0,0,0.1)]'
          : 'text-phone-muted hover:text-phone-ink',
      )}
    >
      <Icon className="h-[20px] w-[20px]" strokeWidth={active ? 2.2 : 1.9} />
      {!!badge && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-semibold leading-none text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

/** 导轨底部操作钮：圆片 + 下方 9px 小字标签（对应参考图的「加好友 / 建群聊」） */
function RailAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof MessageCircle;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative z-10 flex flex-col items-center gap-1 rounded-xl pb-0.5 pt-1 text-phone-muted transition active:scale-95 hover:text-phone-ink"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-phone-surface text-phone-ink shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
      </span>
      <span className="text-[9px] leading-none">{label}</span>
    </button>
  );
}

function SideRail({
  active,
  onChange,
  badges,
  onExit,
  onCompose,
  onOpenCards,
}: {
  active: PhoneTab;
  onChange: (t: PhoneTab) => void;
  badges?: Partial<Record<PhoneTab, number>>;
  onExit?: () => void;
  onCompose: () => void;
  onOpenCards: () => void;
}) {
  return (
    <nav
      data-testid="phone-rail"
      aria-label="小手机导航"
      className="relative z-10 flex w-[64px] shrink-0 flex-col items-center pb-3 pt-3"
    >
      {/* 串起整列的细连线（装饰）。按钮自带底色，会自然盖在线上 */}
      <span aria-hidden className="absolute bottom-[118px] top-[72px] w-px bg-phone-sep" />

      {/* 顶部：退出小手机（整个界面唯一保留的外层操作，常驻导轨，二级页面也能出去） */}
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          aria-label="退出小手机"
          title="退出小手机"
          className="relative z-10 mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-phone-surface text-phone-muted shadow-[0_1px_6px_rgba(0,0,0,0.08)] transition hover:text-phone-ink active:scale-95"
        >
          <ChevronLeft className="h-[19px] w-[19px]" strokeWidth={2.2} />
        </button>
      )}

      {/* 中间：四个导航圆钮 */}
      <div className="flex flex-col items-center gap-2.5">
        {PHONE_TABS.map((t) => (
          <RailTab
            key={t.key}
            icon={t.icon}
            label={t.label}
            tabKey={t.key}
            active={t.key === active}
            badge={badges?.[t.key]}
            onClick={() => onChange(t.key)}
          />
        ))}
      </div>

      <span className="min-h-4 flex-1" />

      {/* 底部：操作入口 */}
      <RailAction icon={SquarePen} label="发起聊天" onClick={onCompose} />
      <RailAction icon={LayoutGrid} label="角色卡" onClick={onOpenCards} />
    </nav>
  );
}

/* ------------------------------ 沉浸式容器 ------------------------------ */

export interface PhoneShellProps {
  tab: PhoneTab;
  onTabChange: (t: PhoneTab) => void;
  /** 内容区；由父级通过 AnimatePresence 控制页面切换动效 */
  children: ReactNode;
  badges?: Partial<Record<PhoneTab, number>>;
  className?: string;
  /** 退出小手机：导轨顶部的圆形返回键 */
  onExit?: () => void;
  /** 导轨底部「发起聊天」：进选人页 */
  onCompose: () => void;
  /** 导轨底部「角色卡」：打开卡片库（二级栈页） */
  onOpenCards: () => void;
}

export function PhoneShell({
  tab,
  onTabChange,
  children,
  badges,
  className,
  onExit,
  onCompose,
  onOpenCards,
}: PhoneShellProps) {
  return (
    // data-bb-phone：主题作用域锚点。主题样式只在这个子树内生效，避免污染其它页面
    <div
      data-bb-phone="1"
      className={cn('relative flex min-h-0 w-full flex-1 flex-row overflow-hidden bg-phone-grouped', className)}
    >
      <SideRail
        active={tab}
        onChange={onTabChange}
        badges={badges}
        onExit={onExit}
        onCompose={onCompose}
        onOpenCards={onOpenCards}
      />

      {/* 内容区：data-bb-screen 供壁纸图层定位 */}
      <div data-bb-screen="1" className="relative min-h-0 flex-1 overflow-hidden bg-phone-bg">{children}</div>
    </div>
  );
}

/* --------------------------- 二级页面通用头部 --------------------------- */

export function PhoneNavBar({
  title,
  onBack,
  right,
  subtitle,
  tone = 'light',
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center gap-2 px-2',
        dark ? 'text-white' : 'text-phone-ink',
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className={cn(
            'flex h-8 items-center gap-0.5 rounded-full pr-2 text-[16px] transition active:opacity-50',
            dark ? 'text-white' : 'text-phone-blue',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      ) : (
        <span className="w-8" />
      )}
      <div className="min-w-0 flex-1 text-center">
        <p data-testid="phone-nav-title" className="truncate text-[15px] font-semibold">{title}</p>
        {subtitle && <p className="truncate text-[10px] font-normal opacity-60">{subtitle}</p>}
      </div>
      {right ?? <span className="w-8" />}
    </div>
  );
}

/* ------------------------------ 页面转场 ------------------------------ */

/** 向右滑出（进入）：新页面从右侧滑入 */
export const slideIn = {
  initial: { x: '100%', opacity: 0.6 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '32%', opacity: 0 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.8 },
};

/** 导航切换（左右轻微位移 + 淡入） */
export function tabTransition(dir: 1 | -1) {
  return {
    initial: { x: dir * 26, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: dir * -22, opacity: 0 },
    transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
  };
}

export { AnimatePresence, motion };

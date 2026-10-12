/**
 * 酒馆「小手机」模块 —— 沉浸式全屏容器 + 底部导航
 *
 * 沉浸式：不再是"一台摆在页面里的手机"。没有金属边框、没有侧边实体键、没有假状态栏和灵动岛，
 * 直接铺满可用空间，靠内容本身和底部 Tab 来组织。顶部只留一个退出键。
 *
 * 结构：内容区（data-bb-screen，壁纸与主题作用域）→ 底部 Tab。
 */
import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Contact, MessageCircle, Compass, LayoutGrid, LogOut, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PhoneTab = 'sessions' | 'contacts' | 'discover' | 'cards' | 'core';

/** 底部 Tab 定义：信息 / 通讯录 / 发现（朋友圈） / 卡片 / 数据中枢 */
export const PHONE_TABS: { key: PhoneTab; label: string; icon: typeof MessageCircle }[] = [
  { key: 'sessions', label: '信息', icon: MessageCircle },
  { key: 'contacts', label: '通讯录', icon: Contact },
  { key: 'discover', label: '发现', icon: Compass },
  { key: 'cards', label: '卡片', icon: LayoutGrid },
  { key: 'core', label: '中枢', icon: Settings },
];

/* ------------------------------ 底部 Tab 栏 ------------------------------ */

function TabBar({
  active,
  onChange,
  badges,
}: {
  active: PhoneTab;
  onChange: (t: PhoneTab) => void;
  badges?: Partial<Record<PhoneTab, number>>;
}) {
  return (
    <div className="relative z-10 shrink-0 border-t border-black/[0.06] bg-white/92 backdrop-blur-xl">
      <div className="flex h-[52px] items-stretch">
        {PHONE_TABS.map((t) => {
          const on = t.key === active;
          const badge = badges?.[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors active:opacity-60',
                on ? 'text-[#007AFF]' : 'text-[#8e8e93]',
              )}
              aria-label={t.label}
              aria-current={on}
            >
              <t.icon className="h-[21px] w-[21px]" strokeWidth={on ? 2.3 : 1.9} />
              <span className="text-[10px] leading-none">{t.label}</span>
              {badge > 0 && (
                <span className="absolute right-[26%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-semibold leading-none text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ 沉浸式容器 ------------------------------ */

export interface PhoneShellProps {
  tab: PhoneTab;
  onTabChange: (t: PhoneTab) => void;
  /** 内容区；由父级通过 AnimatePresence 控制页面切换动效 */
  children: ReactNode;
  /** 底部 Tab 栏是否显示（进入二级页面时隐藏，改由页面自带返回栏） */
  showTabBar?: boolean;
  badges?: Partial<Record<PhoneTab, number>>;
  className?: string;
  /** 退出小手机：整个界面唯一保留的外层操作 */
  onExit?: () => void;
}

export function PhoneShell({ tab, onTabChange, children, showTabBar = true, badges, className, onExit }: PhoneShellProps) {
  return (
    // data-bb-phone：主题作用域锚点。主题样式只在这个子树内生效，避免污染其它页面
    <div
      data-bb-phone="1"
      className={cn('relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#F2F2F7]', className)}
    >
      {/* 顶部只有退出键：其余（App 导航栏、标题、假状态栏）一概不保留 */}
      {onExit && (
        <div className="relative z-30 flex h-11 shrink-0 items-center px-2">
          <button
            type="button"
            onClick={onExit}
            aria-label="退出小手机"
            title="退出小手机"
            className="flex h-8 items-center gap-1 rounded-full pl-1.5 pr-2.5 text-[13px] text-[#3C3C43] transition active:opacity-50 hover:bg-black/5"
          >
            <LogOut className="h-[18px] w-[18px]" />
            退出
          </button>
        </div>
      )}

      {/* 内容区：data-bb-screen 供壁纸图层定位 */}
      <div data-bb-screen="1" className="relative min-h-0 flex-1 overflow-hidden bg-[#F2F2F7]">{children}</div>

      {showTabBar && <TabBar active={tab} onChange={onTabChange} badges={badges} />}
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
        dark ? 'text-white' : 'text-[#000000]',
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className={cn(
            'flex h-8 items-center gap-0.5 rounded-full pr-2 text-[16px] transition active:opacity-50',
            dark ? 'text-white' : 'text-[#007AFF]',
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
        <p className="truncate text-[15px] font-semibold">{title}</p>
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

/** 底部 Tab 切换（左右轻微位移 + 淡入） */
export function tabTransition(dir: 1 | -1) {
  return {
    initial: { x: dir * 26, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: dir * -22, opacity: 0 },
    transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
  };
}

export { AnimatePresence, motion };

import { NavLink } from 'react-router-dom';
import { Home, MessageSquare, Sparkles, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { AvatarContent } from '@/components/AvatarContent';

interface NavItem {
  to: string;
  label: string;
  en: string;
  icon: LucideIcon;
}

/**
 * 导航配置（桌面左侧常驻栏）。
 * 移动端不再有底部 Tab——那里改成主抽屉（AppLayout → Drawer）。
 * 聊天放第一个：它是默认视图；旧首页降级为备用入口 /home。
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/chat', label: '聊天', en: 'CHAT', icon: MessageSquare },
  { to: '/home', label: '首页', en: 'HOME', icon: Home },
  { to: '/together', label: 'together', en: 'TOGETHER', icon: Sparkles },
  { to: '/settings', label: '我', en: 'PROFILE', icon: Settings },
];

/** 桌面侧边栏（夜航手账：品牌印章 + 竖排导航 + 底部身份卡） */
export function Sidebar() {
  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const partnerName = useProfileStore((s) => s.partnerRemark || s.partnerName);

  return (
    <div className="relative flex h-full flex-col px-3 py-4">
      {/* 品牌区 */}
      <div className="flex items-center gap-3 px-2 pb-7 pt-1">
        <span className="brand-seal h-10 w-10 text-[19px] shadow-glow" aria-hidden>
          🫐
        </span>
        <div className="min-w-0">
          <p className="display truncate text-[17px] font-semibold leading-tight text-foreground">
            小蓝莓
          </p>
          <p className="eyebrow mt-0.5 leading-none">Nocturne Journal</p>
        </div>
      </div>

      <p className="eyebrow px-3 pb-2">Navigate</p>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition',
                isActive
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition',
                    isActive ? 'bg-primary opacity-100' : 'opacity-0',
                  )}
                />
                <item.icon
                  className={cn(
                    'h-[17px] w-[17px] shrink-0 transition',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                <span
                  className={cn(
                    'font-serif text-[9px] uppercase tracking-[0.16em]',
                    isActive ? 'text-primary/70' : 'text-muted-foreground/50',
                  )}
                >
                  {item.en}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 底部身份卡 */}
      <div className="mt-auto">
        <div className="hairline mb-3" />
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-[17px]">
            <AvatarContent value={avatar} fallback="🫐" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">{name || '我'}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {partnerName ? `与 ${partnerName} 在一起` : '本地优先 · 数据在你手里'}
            </p>
          </div>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/80" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/**
 * 手机底部导航已移除（S5）：改由主抽屉承担导航，释放纵向空间。
 * 保留这个空实现只为兼容旧引用，不要再往里加东西。
 * @deprecated
 */
export function BottomNav() {
  return null;
}

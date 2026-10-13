import { NavLink } from 'react-router-dom';
import { Home, MessageSquare, Sparkles, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * 导航配置（桌面左侧常驻栏）。
 * 移动端不再有底部 Tab——那里改成主抽屉（AppLayout → Drawer）。
 * 聊天放第一个：它是默认视图；旧首页降级为备用入口 /home。
 */
const NAV_ITEMS: NavItem[] = [
  { to: '/chat', label: '聊天', icon: MessageSquare },
  { to: '/home', label: '首页', icon: Home },
  { to: '/sky', label: '星空', icon: Sparkles },
  { to: '/settings', label: '我', icon: Settings },
];

/** 桌面侧边栏（垂直） */
export function Sidebar() {
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-2 flex items-center gap-2 px-3 py-4 text-lg font-bold text-primary">
        <span>🫐</span> 小蓝莓
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
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

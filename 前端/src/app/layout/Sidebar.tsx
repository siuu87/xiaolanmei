import { NavLink } from 'react-router-dom';
import { Home, MessageSquare, Sparkles, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// 导航配置：4 个核心 Tab = 首页 / 聊天 / 星空 / 我
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '首页', icon: Home },
  { to: '/chat', label: '聊天', icon: MessageSquare },
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

/** 手机底部导航（横向） */
export function BottomNav() {
  return (
    <div className="flex items-center justify-around py-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 rounded-md px-4 py-1.5 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

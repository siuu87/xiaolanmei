import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppStore, ACCENT_HSL } from '@/stores/appStore';
import { useImmersiveStore } from '@/stores/immersiveStore';
import { useShellStore } from '@/stores/shellStore';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { ChatPage } from '@/features/chat/ChatPage';
import { Drawer } from '@/features/shell/Drawer';
import { useEdgeSwipe } from '@/features/shell/useEdgeSwipe';

/**
 * 全局布局（双层结构）
 *
 * 第一层 = 主聊天流，常驻挂载、永不卸载。第二层 = 覆盖层路由（<Outlet />），
 * 二级模块叠在聊天上面，返回即露出底下的对话——所以聊天上下文与滚动位置
 * 在整个穿梭过程中都不受影响（Keep-Alive）。
 *
 * 例外：酒馆小手机（/tavern）走整页沉浸替换，此时不挂聊天底座。
 *
 * 桌面（≥md）保留左侧常驻栏；抽屉与边缘手势只在移动端生效。
 */
export function AppLayout() {
  const theme = useAppStore((s) => s.theme);
  const immersive = useImmersiveStore((s) => s.immersive);
  const numFont = useAppStore((s) => s.numFont);
  const accent = useAppStore((s) => s.accent);
  const openDrawer = useShellStore((s) => s.openDrawer);

  const location = useLocation();
  const navigate = useNavigate();

  // 纯聊天态：覆盖层为空，必须让点击穿透到底座
  const onChat = location.pathname === '/chat';
  // 整页沉浸替换（不挂聊天底座）
  const fullReplace = location.pathname.startsWith('/tavern');

  useEdgeSwipe(openDrawer, !immersive && !fullReplace);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-num-font', numFont);
  }, [numFont]);

  // 强调色：覆盖 --primary / --ring（浅色与深色都生效）
  useEffect(() => {
    const hsl = ACCENT_HSL[accent];
    const root = document.documentElement;
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--ring', hsl);
  }, [accent]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* 桌面侧边栏（沉浸式时收起） */}
      {!immersive && (
        <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
          <Sidebar />
        </aside>
      )}

      {/* 主区：底座 + 覆盖层 */}
      <div className="relative min-w-0 flex-1">
        {/* 第一层：主聊天流（常驻） */}
        {!fullReplace && (
          <div className="absolute inset-0" data-testid="chat-base-layer">
            <ChatPage />
          </div>
        )}

        {/* 第二层：覆盖层路由 */}
        <main
          className={cn(
            'h-full overflow-y-auto',
            !fullReplace && 'absolute inset-0',
            onChat && !fullReplace && 'pointer-events-none',
          )}
        >
          <Outlet />
        </main>

        {/* 覆盖层里的一键回对话（沉浸替换页不需要） */}
        {!onChat && !fullReplace && (
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="回到对话"
            data-testid="back-to-chat"
            className="fixed bottom-5 right-4 z-[1100] flex items-center gap-1 rounded-full border border-white/15 bg-[#141a2b]/95 px-3 py-2 text-[12px] text-[#dfe4ef] shadow-lg backdrop-blur transition hover:bg-[#1b2338]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            回到对话
          </button>
        )}
      </div>

      {/* 移动端抽屉 */}
      {!immersive && <Drawer />}
    </div>
  );
}

import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAppStore, ACCENT_HSL } from '@/stores/appStore';
import { useImmersiveStore } from '@/stores/immersiveStore';
import { useShellStore } from '@/stores/shellStore';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { ChatPage } from '@/features/chat/ChatPage';
import { Drawer } from '@/features/shell/Drawer';
import { LetterReaderLayer } from '@/features/notes/LetterReaderLayer';
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
  // 一封来信的阅读页：路由上渲染空，实际由下面这层叠在侧边栏之上
  const letterId = location.pathname.startsWith('/letter/')
    ? decodeURIComponent(location.pathname.slice('/letter/'.length))
    : null;

  // 关信件页 = 原路返回；直达进来没有上一条历史，就退到信箱列表
  const closeLetter = () => {
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate('/notes');
  };

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

        {/* 第二层：覆盖层路由（阅读页时它也是空的，同样要穿透） */}
        <main
          className={cn(
            'h-full overflow-y-auto',
            !fullReplace && 'absolute inset-0',
            (onChat || !!letterId) && !fullReplace && 'pointer-events-none',
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* 移动端抽屉 */}
      {!immersive && <Drawer />}

      {/* 一封来信的阅读页：叠在抽屉之上，点空白收起。
          挂在这里而不是 Outlet，是为了让 AnimatePresence 有机会播收起动画。 */}
      <AnimatePresence>
        {letterId && <LetterReaderLayer key={letterId} id={letterId} onClose={closeLetter} />}
      </AnimatePresence>
    </div>
  );
}

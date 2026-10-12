import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppStore, ACCENT_HSL } from '@/stores/appStore';
import { useImmersiveStore } from '@/stores/immersiveStore';
import { cn } from '@/lib/utils';
import { Sidebar, BottomNav } from './Sidebar';

/**
 * 全局布局：桌面左侧边栏 + 主内容 + 手机底部 Tab，响应式
 *
 * 底部导航平时永远固定在底部（`fixed inset-x-0 bottom-0`），不会跟着页面滚走；
 * 只有进入沉浸式界面（小手机）时才整体收起，改由界面自带的退出键返回。
 */
export function AppLayout() {
  const theme = useAppStore((s) => s.theme);
  const immersive = useImmersiveStore((s) => s.immersive);
  const numFont = useAppStore((s) => s.numFont);
  const accent = useAppStore((s) => s.accent);

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

      {/* 主内容区 */}
      <main className={cn('flex-1 overflow-y-auto', immersive ? 'overflow-hidden' : 'pb-16 md:pb-0')}>
        <Outlet />
      </main>

      {/* 手机底部导航：永远固定在底部；沉浸式界面例外，那里只留退出键 */}
      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 backdrop-blur md:hidden">
          <BottomNav />
        </nav>
      )}
    </div>
  );
}

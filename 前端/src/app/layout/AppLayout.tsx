import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppStore, ACCENT_HSL } from '@/stores/appStore';
import { Sidebar, BottomNav } from './Sidebar';

/** 全局布局：桌面左侧边栏 + 主内容 + 手机底部 Tab，响应式 */
export function AppLayout() {
  const theme = useAppStore((s) => s.theme);
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
      {/* 桌面侧边栏 */}
      <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
        <Sidebar />
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* 手机底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 backdrop-blur md:hidden">
        <BottomNav />
      </nav>
    </div>
  );
}

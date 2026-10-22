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
import { BedtimeNudge } from '@/features/shell/BedtimeNudge';
import { useOpenSourceStore } from '@/features/openSource/openSourceStore';
import { useAppHeight } from '@/lib/useAppHeight';
import { useProfileStore } from '@/stores/profileStore';
import { getSettings } from '@/lib/api/settings';

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

  // 软键盘弹起时把根容器压到「可见视口」高度，否则输入框会被顶到键盘底下
  useAppHeight();

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

  // 开源项目红点：启动时读一次清单（只读库、不发网络请求），失败则红点回退到 localStorage 上次计数
  // 注意：这里**不自动检查更新** —— 只在用户点了面板上的「检查更新」时才去连 GitHub。
  const loadOpenSource = useOpenSourceStore((s) => s.load);
  useEffect(() => {
    void loadOpenSource();
  }, [loadOpenSource]);

  /**
   * 伴侣备注（就是聊天顶栏显示的名字）以**后端**为准：
   * AI 通过 `set_partner_remark` 工具改的是 settings，localStorage 它碰不到，
   * 所以每次启动都拉一次同步过来。`null`（从没设过）不动本地值，`''` 才是用户主动清空。
   */
  const setPartnerRemark = useProfileStore((s) => s.setPartnerRemark);
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (typeof s.partnerRemark === 'string') setPartnerRemark(s.partnerRemark);
      })
      .catch(() => {});
  }, [setPartnerRemark]);

  return (
    <div
      className="flex h-dvh w-full overflow-hidden bg-background text-foreground"
      // 有 --app-h 时以它为准（键盘/地址栏变化），没有就退回 h-dvh
      style={{ height: 'var(--app-h, 100dvh)' }}
    >
      {/* 桌面侧边栏（沉浸式时收起） */}
      {!immersive && (
        <aside className="relative hidden w-64 shrink-0 border-r border-border bg-surface md:block">
          {/* 侧栏顶部的暖光，和页面同一套环境光 */}
          <div aria-hidden className="page-wash pointer-events-none absolute inset-x-0 top-0 h-48 opacity-80" />
          <div className="relative h-full">
            <Sidebar />
          </div>
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

      {/* 睡前提醒（设置页「提醒与健康」里开启；22:00–02:59 每天最多一次） */}
      <BedtimeNudge />

      {/* 一封来信的阅读页：叠在抽屉之上，点空白收起。
          挂在这里而不是 Outlet，是为了让 AnimatePresence 有机会播收起动画。 */}
      <AnimatePresence>
        {letterId && <LetterReaderLayer key={letterId} id={letterId} onClose={closeLetter} />}
      </AnimatePresence>
    </div>
  );
}

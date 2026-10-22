/**
 * 主抽屉：左侧滑出、毛玻璃遮罩、弹簧动效。
 *
 * 只服务移动端（桌面保留左侧常驻栏）。抽屉本身不是路由，
 * 所以开合不会让主聊天流重新挂载——对话上下文与滚动位置完整保持。
 *
 * 二级模块从抽屉里点开后走覆盖层（见 AppLayout 的 overlay 容器），
 * 返回即回到聊天；只有酒馆小手机是整页沉浸替换。
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { useShellStore } from '@/stores/shellStore';
import { AppearanceSection } from '@/features/settings/AppearanceSection';
import { ProfileHeader, DailyBoard, ModuleCards, StickyFooter } from './DrawerSections';
import { useSwipeToClose } from './useEdgeSwipe';

export function Drawer() {
  const open = useShellStore((s) => s.drawerOpen);
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const appearanceOpen = useShellStore((s) => s.appearanceOpen);
  const closeAppearance = useShellStore((s) => s.closeAppearance);

  // Esc 关闭（抽屉优先，其次外观浮层）
  useEffect(() => {
    if (!open && !appearanceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (appearanceOpen) closeAppearance();
      else closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, appearanceOpen, closeDrawer, closeAppearance]);

  // 抽屉打开时，在面板上左滑收回
  useSwipeToClose(closeDrawer, open);

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[1200] md:hidden" data-testid="main-drawer">
            {/* 背板：纯色不透明，底下的页面不透出来 */}
            <motion.div
              className="absolute inset-0 bg-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={closeDrawer}
            />
            {/* 面板 */}
            <motion.div
              className="absolute inset-y-0 left-0 flex w-[88%] max-w-[360px] flex-col overflow-hidden rounded-r-[28px] border-r border-border bg-surface shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.9 }}
            >
              <div aria-hidden className="page-wash pointer-events-none absolute inset-x-0 top-0 h-56" />
              {/* 顶部小把手行 */}
              <div className="relative flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
                <div className="flex items-center gap-2.5">
                  <span className="brand-seal h-9 w-9 text-[17px]" aria-hidden>
                    🫐
                  </span>
                  <div>
                    <p className="display text-[16px] font-semibold leading-tight text-foreground">
                      小蓝莓
                    </p>
                    <p className="eyebrow mt-0.5 leading-none">My Journal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="关闭抽屉"
                  className="icon-btn h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 垂直滚动卡片流：细滚动条，别让默认粗条吃掉侧边栏宽度 */}
              <div
                data-testid="drawer-scroll"
                className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pr-1.5"
              >
                <ProfileHeader />
                <DailyBoard />
                <ModuleCards />
              </div>

              {/* 底部固定快捷栏 */}
              <StickyFooter />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 外观页（齿轮）：整页纯色，直接复用「我」页那一套外观设置，不重造 */}
      <AnimatePresence>
        {appearanceOpen && (
          <div className="fixed inset-0 z-[1300] flex flex-col bg-background" data-testid="appearance-sheet">
            <motion.div
              className="flex h-full w-full flex-col overflow-hidden bg-background"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-page-bg px-3 pb-2.5 pt-3">
                <button
                  type="button"
                  onClick={closeAppearance}
                  aria-label="返回"
                  className="icon-btn h-8 w-8 shrink-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="eyebrow leading-none">Appearance</span>
                  <p className="display truncate text-[17px] font-semibold leading-tight text-foreground">
                    外观与全局配置
                  </p>
                </div>
                <span className="h-8 w-8 shrink-0" aria-hidden />
              </div>
              <div
                data-testid="appearance-scroll"
                className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-3"
              >
                <AppearanceSection />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * 主抽屉：左侧滑出、毛玻璃遮罩、弹簧动效。
 *
 * 只服务移动端（桌面保留左侧常驻栏）。抽屉本身不是路由，
 * 所以开合不会让主聊天流重新挂载——对话上下文与滚动位置完整保持。
 *
 * 二级模块从抽屉里点开后走覆盖层（见 AppLayout 的 overlay 容器），
 * 返回即回到聊天；只有酒馆小手机是整页沉浸替换。
 *
 * 2026-11-12：工具箱在下钻。点工具箱子项不跳路由，而是在本抽屉里换一层
 * （顶栏返回 + 内容全宽），返回键/Esc 都退回抽屉主视图，再按一次才关抽屉。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { useShellStore } from '@/stores/shellStore';
import { cn } from '@/lib/utils';
import { AppearanceSection } from '@/features/settings/AppearanceSection';
import { ProfileHeader, DailyBoard, ModuleGroupCard, ToolboxCard, StickyFooter } from './DrawerSections';
import { useSwipeToClose } from './useEdgeSwipe';
import { TOOLBOX_SECTIONS } from '@/features/chat/toolboxSections';

export function Drawer() {
  const open = useShellStore((s) => s.drawerOpen);
  const drawerSection = useShellStore((s) => s.drawerSection);
  const closeDrawerSection = useShellStore((s) => s.closeDrawerSection);
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const appearanceOpen = useShellStore((s) => s.appearanceOpen);
  const closeAppearance = useShellStore((s) => s.closeAppearance);
  /** 抽屉重排后工具箱搬到最下面，展开状态由抽屉自己拿着 */
  const [toolboxOpen, setToolboxOpen] = useState(false);

  // 当前下钻的工具箱子项（null = 抽屉主视图）
  const section = drawerSection ? TOOLBOX_SECTIONS.find((s) => s.key === drawerSection) : undefined;

  // Esc：先退下钻，再关外观浮层，最后关抽屉
  useEffect(() => {
    if (!open && !appearanceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (appearanceOpen) closeAppearance();
      else if (section) closeDrawerSection();
      else closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, appearanceOpen, closeDrawer, closeAppearance, section, closeDrawerSection]);

  // 抽屉打开时，在面板上左滑收回。下钻页里有横向拖拽（文件树/代码）时别误关抽屉
  useSwipeToClose(closeDrawer, open && !section);

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[1200] md:hidden" data-testid="main-drawer">
            {/* 背板：纯色不透明，底下的页面不透出来。
                2026-11-16 修「打开时闪一下」：原来背板 0.18s 就完全不透明，
                而面板要 500ms 才滑到位 —— 于是面板还没盖上来，整屏先被纯色刷了一遍，
                看着就像闪一下。现在背板和面板同一套 spring 一起从左边推进来，
                面板到哪，遮罩才盖到哪。 */}
            <motion.div
              className="absolute inset-0 bg-background"
              initial={{ opacity: 0, x: '-18%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '-8%' }}
              transition={{ type: 'spring', stiffness: 470, damping: 34, mass: 0.7 }}
              onClick={closeDrawer}
            />
            {/* 面板 */}
            <motion.div
              className="absolute inset-y-0 left-0 flex w-[92%] max-w-[400px] flex-col overflow-hidden rounded-r-[28px] border-r border-border bg-surface shadow-[0_10px_30px_-20px_hsl(var(--shadow-color)/0.3)]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 470, damping: 34, mass: 0.7 }}
            >
              <div aria-hidden className="page-wash pointer-events-none absolute inset-x-0 top-0 h-56" />
              {/* 抽屉主视图：下钻时**只隐藏不卸载** —— 分组的展开状态、滚动位置、
                  收信匣翻到第几封都要留着，返回时接着刚才的位置看 */}
              <div className={cn('relative flex min-h-0 flex-1 flex-col', section && 'hidden')}>
                {/* 顶部把手行：只有关闭键（2026-11-04 用户定：去掉「小蓝莓」品牌块） */}
                <div className="relative flex shrink-0 items-center justify-end px-4 pb-2 pt-4">
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

                  {/* 2026-11-19 晚重排（用户：together 的位置不对，都改到小组件之后）：
                      日常看板（日历/待办/小组件）在前，together 挪到看板之后、
                      「还有」区之前 —— 与首页「小组件 → together」的顺序对齐。 */}
                  <DailyBoard />

                  <section className="px-4 pb-3">
                    <div className="mb-2.5 flex items-center gap-2 px-0.5">
                      <span className="eyebrow">一起 · Together</span>
                      <span className="h-px flex-1 bg-border/70" aria-hidden />
                    </div>
                    <ModuleGroupCard title="together" />
                  </section>

                  {/* 剩下的模块 + 工具箱 */}
                  <section className="px-4 pb-3">
                    <div className="mb-2.5 flex items-center gap-2 px-0.5">
                      <span className="eyebrow">还有 · More</span>
                      <span className="h-px flex-1 bg-border/70" aria-hidden />
                    </div>
                    <div className="space-y-2.5">
                      <ModuleGroupCard title="酒馆小手机" />
                      <ModuleGroupCard title="生活小趣味" />
                      <ToolboxCard
                        open={toolboxOpen}
                        onToggle={() => setToolboxOpen((v) => !v)}
                      />
                    </div>
                  </section>
                </div>

                {/* 底部固定快捷栏 */}
                <StickyFooter />
              </div>

              {section && (
                /* 工具箱子项下钻层：顶栏返回 + 内容全宽，不再卡中卡 */
                <motion.div
                  key="drawer-section"
                  initial={{ x: '14%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="relative flex min-h-0 flex-1 flex-col"
                  data-testid="drawer-section"
                  data-section={section.key}
                >
                  <div className="flex shrink-0 items-center gap-2 px-3 pb-2.5 pt-3">
                    <button
                      type="button"
                      onClick={closeDrawerSection}
                      aria-label="返回"
                      className="icon-btn h-8 w-8 shrink-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="eyebrow mb-0.5 leading-none">Toolbox</span>
                      <p className="display truncate text-[17px] font-semibold leading-tight text-foreground">
                        {section.label}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeDrawer}
                      aria-label="关闭抽屉"
                      className="icon-btn h-8 w-8 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div
                    data-testid="drawer-section-scroll"
                    className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-6"
                  >
                    {section.render()}
                  </div>
                </motion.div>
              )}
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

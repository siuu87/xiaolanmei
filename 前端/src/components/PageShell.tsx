import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 覆盖层页面的统一外壳。
 *
 * 为什么必须有：`AppLayout` 是双层结构——聊天页常驻在最底下（`chat-base-layer`），
 * 二级页面通过 `<Outlet />` 叠在它上面。所以二级页面的根节点**必须自己铺一层不透明底**，
 * 否则会透出底下的对话（日记本 / 课程表 / 纪念日 / 吃什么 之前都是这个毛病：
 * 顶栏的「小蓝莓」和底部的输入框直接穿出来）。
 *
 * 这里把三件事收成一个组件，所有二级页面共用：
 *   1. 不透明底 + 满高（`min-h-full bg-page-bg`）——保证「点开就是整页」；
 *   2. 统一顶栏：返回键 + 粗体标题（+ 可选英文眉标 / 右侧操作区），
 *      结构与「一起听 LISTEN」那一版完全一致，吸顶 + 一条发丝线分界；
 *   3. 统一内容宽度（`md` = 448 手机单列；`lg` = 672 宽表，如课程表）。
 *
 * 深色沉浸页（一起听 / 一起看 / 一起读 / 小手机）不套这层——它们自带整屏深色底，
 * 但顶栏几何（h-8 圆钮 + ArrowLeft + 粗体标题）与此处保持一致。
 */
export interface PageShellProps {
  /** 中文标题，如「日记本」 */
  title: string;
  /** 标题右侧的小号英文眉标，如 DIARY */
  eyebrow?: string;
  /** 返回目标，默认回聊天底座 */
  backTo?: string;
  /** 是否显示返回键（从侧边栏进来的「首页」不需要） */
  showBack?: boolean;
  /** 顶栏右侧操作区（+ / AI 等） */
  right?: ReactNode;
  /** 标题行下方、仍在吸顶区域内的内容（吃什么页的 Tab + 搜索框） */
  headerExtra?: ReactNode;
  /** 内容宽度 */
  size?: 'md' | 'lg';
  /** 内容区附加类名（会被 twMerge 合并，可用来覆盖 px-4 py-4） */
  bodyClassName?: string;
  /** 根节点附加类名 */
  className?: string;
  /** 根节点的 data-testid，默认 page-shell */
  testId?: string;
  children: ReactNode;
}

export function PageShell({
  title,
  eyebrow,
  backTo = '/chat',
  showBack = true,
  right,
  headerExtra,
  size = 'md',
  bodyClassName,
  className,
  testId,
  children,
}: PageShellProps) {
  const navigate = useNavigate();

  return (
    <div
      data-testid={testId ?? 'page-shell'}
      data-page-title={title}
      className={cn('relative min-h-full bg-page-bg text-foreground', className)}
    >
      <div className={cn('mx-auto w-full', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}>
        {/* 统一顶栏：吸顶 + 实底色，和内容用一条发丝线分界 */}
        <header
          data-testid="page-header"
          className="sticky top-0 z-20 border-b border-page-line bg-page-bg px-4 py-3"
        >
          <div className="flex items-center gap-2">
            {showBack && (
              <button
                type="button"
                onClick={() => navigate(backTo)}
                aria-label="返回"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <h1 className="truncate text-xl font-bold text-foreground">{title}</h1>
              {eyebrow && (
                <span className="shrink-0 font-serif text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {eyebrow}
                </span>
              )}
            </div>
            {right}
          </div>
          {headerExtra}
        </header>

        <div className={cn('px-4 py-4', bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

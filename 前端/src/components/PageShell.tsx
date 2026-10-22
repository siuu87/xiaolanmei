import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 覆盖层页面的统一外壳（夜航手账版）。
 *
 * 双层结构：聊天页常驻底座，二级页通过 <Outlet /> 叠在上面，所以页面根节点
 * 必须自己铺一层不透明底，否则会透出底下的对话。这里依旧收口三件事：
 *   1. 不透明底 + 满高（`min-h-full bg-page-bg`）；
 *   2. 统一顶栏：英文眉标 / 衬线标题 / 返回圆钮 / 右侧操作，吸顶 + 发丝线分界；
 *   3. 统一内容宽度与留白（md = 448 手机单列；lg = 672 宽表）。
 *
 * 深色沉浸页（一起听 / 一起看 / 一起读 / 小手机）不套这层。
 */
export interface PageShellProps {
  /** 中文标题，如「日记本」 */
  title: string;
  /** 标题上方的小号英文眉标，如 DIARY */
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
      {/* 顶部暖光：给留白一点呼吸，不抢内容 */}
      <div
        aria-hidden
        className="page-wash pointer-events-none absolute inset-x-0 top-0 h-52"
      />

      <div className={cn('relative mx-auto w-full', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}>
        {/* 统一顶栏：吸顶 + 实底色，和内容用一条发丝线分界 */}
        <header
          data-testid="page-header"
          className="sticky top-0 z-20 border-b border-page-line bg-page-bg px-4 pb-2.5 pt-2.5"
        >
          <div className="flex items-center gap-2.5">
            {showBack && (
              <button
                type="button"
                onClick={() => navigate(backTo)}
                aria-label="返回"
                className="icon-btn h-8 w-8 shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              {eyebrow && <span className="eyebrow mb-0.5 leading-none">{eyebrow}</span>}
              <h1 className="display truncate text-[22px] font-semibold leading-tight tracking-tight text-foreground">
                {title}
              </h1>
            </div>
            {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
          </div>
          {headerExtra}
        </header>

        <div className={cn('rise-in px-4 pb-6 pt-4', bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

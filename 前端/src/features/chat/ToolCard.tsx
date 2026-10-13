/**
 * 工具调用卡片（Tool Execution Card）
 *
 * 把 AI 执行终端命令 / API 请求 / 脚本的过程从纯文本日志升级成可折叠的专属卡片。
 * 设计参考现代 Agent UI（Claude Code / Operit）：状态栏 + 子任务药丸 + 极客终端框 + 进度条。
 *
 * 配色是自洽的「午夜暗色」，不依赖外部主题变量——无论外层是浅色 iMessage 还是
 * 深色主聊天流，卡片本身都是深色终端质感，与主聊天流的午夜深蓝同系。
 *
 * 流式兼容：steps 数组可以随时追加 / 把某条从 running 改成 completed / failed，
 * 卡片状态由 steps 派生（有 running → 执行中；全完成 → 完成；有 failed → 失败），
 * 不需要外部再传聚合状态。
 */
import { useMemo, useState } from 'react';
import { Check, AlertTriangle, ChevronDown, ChevronUp, Loader2, Terminal, Globe, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 单个执行步骤。与后端/模型侧约定的渲染契约保持一致 */
export interface ToolExecutionStep {
  id: string;
  type: 'terminal' | 'api' | 'script';
  label: string;
  command?: string;
  output?: string;
  status: 'running' | 'completed' | 'failed';
}

export interface ToolCardProps {
  steps: ToolExecutionStep[];
  collapsedByDefault?: boolean;
  className?: string;
}

type CardStatus = 'running' | 'completed' | 'failed';

/** 卡片整体状态由子步骤派生：有在跑 → 执行中；有失败且无在跑 → 失败；否则完成 */
function deriveStatus(steps: ToolExecutionStep[]): CardStatus {
  if (steps.some((s) => s.status === 'running')) return 'running';
  if (steps.some((s) => s.status === 'failed')) return 'failed';
  return 'completed';
}

const STATUS_TEXT: Record<CardStatus, string> = {
  running: '执行中',
  completed: '完成',
  failed: '失败',
};

const TYPE_META: Record<ToolExecutionStep['type'], { pill: string; icon: typeof Terminal }> = {
  terminal: { pill: '>_ 终端', icon: Terminal },
  api: { pill: 'API 请求', icon: Globe },
  script: { pill: '脚本', icon: FileCode2 },
};

/** 状态图标：执行中=微旋指示器，成功=绿底 Checkmark，失败=红标警告 */
function StatusIcon({ status, small }: { status: CardStatus; small?: boolean }) {
  const box = cn(
    'flex shrink-0 items-center justify-center rounded-[7px]',
    small ? 'h-4 w-4' : 'h-6 w-6',
  );
  if (status === 'running') {
    return (
      <span className={cn(box, 'bg-primary/15 text-primary')} aria-hidden>
        <Loader2 className={cn('animate-spin', small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')} />
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className={cn(box, 'bg-emerald-500/20 text-emerald-400')} aria-hidden>
        <Check className={cn(small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className={cn(box, 'bg-red-500/20 text-red-400')} aria-hidden>
      <AlertTriangle className={cn(small ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')} />
    </span>
  );
}

/** 药丸右侧的轻量状态圆点 */
function StatusDot({ status }: { status: ToolExecutionStep['status'] }) {
  const color =
    status === 'completed'
      ? 'bg-emerald-400'
      : status === 'running'
        ? 'bg-primary animate-pulse'
        : 'bg-red-400';
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} aria-hidden />;
}

/** 极客终端框：深黑底 + 等宽字 + $ 前缀，长输出内部滚动 */
function TerminalBox({
  step,
  clamp,
}: {
  step: ToolExecutionStep;
  clamp?: boolean;
}) {
  const lines = (step.output ?? '').split('\n');
  const shown = clamp ? lines.slice(0, 6) : lines;
  const hidden = clamp ? lines.length - shown.length : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#111]">
      {step.command && (
        <div className="flex gap-1.5 px-3 pt-2.5 font-mono text-[11px] leading-relaxed">
          <span className="select-none text-emerald-400">$</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-[#e6e6e6]">
            {step.command}
          </span>
        </div>
      )}
      {step.output && (
        <div
          className={cn(
            'mt-1.5 overflow-auto px-3 pb-2.5 font-mono text-[11px] leading-relaxed text-[#a1a1aa]',
            clamp ? 'max-h-24' : 'max-h-56',
          )}
        >
          <pre className="whitespace-pre">{shown.join('\n')}</pre>
          {hidden > 0 && <div className="mt-0.5 select-none text-[#52525b]">... 还有 {hidden} 行</div>}
        </div>
      )}
    </div>
  );
}

/**
 * 工具调用卡片
 *
 * 收起态：状态栏 + 最近一条操作的摘要（不铺满屏）
 * 展开态：子任务药丸列表 + 每个步骤的终端框 + 底部进度条 + 「查看全部」
 */
export function ToolCard({ steps, collapsedByDefault = true, className }: ToolCardProps) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const status = useMemo(() => deriveStatus(steps), [steps]);
  const done = steps.filter((s) => s.status === 'completed').length;
  const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const latest = steps[steps.length - 1];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-white/[0.08] bg-[#161b28] shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
        className,
      )}
      data-testid="tool-card"
      data-status={status}
    >
      {/* 顶部状态栏 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <StatusIcon status={status} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#e6e6e6]">
          {steps.length} 个操作 · {STATUS_TEXT[status]}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? '收起执行详情' : '展开执行详情'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#8b8b93] transition hover:bg-white/[0.06] hover:text-[#e6e6e6]"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* 收起态：只给最近一条的摘要 */}
      {!open && latest && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[#8b8b93]">
            <StatusDot status={latest.status} />
            <span className="truncate">{latest.label}</span>
          </div>
        </div>
      )}

      {/* 展开态：子任务药丸 + 终端框 */}
      {open && (
        <div className="space-y-2.5 border-t border-white/[0.06] px-3 py-2.5">
          {steps.map((s) => {
            const meta = TYPE_META[s.type];
            return (
              <div key={s.id} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-[#a1a1aa]">
                    <meta.icon className="h-2.5 w-2.5" />
                    {meta.pill}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[#8b8b93]">{s.label}</span>
                  <StatusDot status={s.status} />
                  <span className="text-[10px] text-[#8b8b93]">
                    {s.status === 'completed' ? '完成' : s.status === 'running' ? '执行中' : '失败'}
                  </span>
                </div>
                {(s.command || s.output) && <TerminalBox step={s} />}
              </div>
            );
          })}

          {/* 底部：进度条 + 折叠入口 */}
          <div className="space-y-2 pt-0.5">
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-emerald-500/70 transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mx-auto flex items-center gap-1 text-[11px] text-[#8b8b93] transition hover:text-[#e6e6e6]"
            >
              <ChevronUp className="h-3 w-3" />
              收起详细输出
            </button>
          </div>
        </div>
      )}

      {/* 收起态的「查看全部」入口：只在有多条时给 */}
      {!open && steps.length > 1 && (
        <div className="border-t border-white/[0.06] px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mx-auto flex items-center gap-1 text-[11px] text-[#8b8b93] transition hover:text-[#e6e6e6]"
          >
            ↗ 查看全部 {steps.length} 个操作
          </button>
        </div>
      )}
    </div>
  );
}

export default ToolCard;

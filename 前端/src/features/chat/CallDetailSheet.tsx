import { ChevronLeft } from 'lucide-react';
import { AvatarContent } from '@/components/AvatarContent';

/** H:MM */
function fmtTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 通话记录详情（对齐设计稿第 9 页）。
 *
 * 结构：返回 + 「通话记录」→ 大头像 / 名字 / 「M月D日 H:MM · 通话 12 分 04 秒」/ 状态药丸
 * → 「通话内容」→ 空态（没有逐字转写时）→ 两条脚注 → 底部「再打一通」。
 *
 * **数据只有通话记录本身**（`meta.call` + 消息时间）：接听状态、时长、时刻都是真的；
 * 逐字转写后端没有落库，所以这里给的是空态而不是编造的对话。
 */
export function CallDetailSheet({
  call,
  ts,
  name,
  avatar,
  onClose,
  onCallAgain,
}: {
  call: { kind: 'voice' | 'video'; state: 'answered' | 'declined' | 'missed'; seconds?: number };
  ts?: number;
  name: string;
  avatar?: string;
  onClose: () => void;
  onCallAgain: () => void;
}) {
  const secs = call.seconds ?? 0;

  const durText = secs >= 60 ? `${Math.floor(secs / 60)} 分 ${String(secs % 60).padStart(2, '0')} 秒` : `${secs} 秒`;
  const whenText = ts ? `${new Date(ts).getMonth() + 1}月${new Date(ts).getDate()}日 ${fmtTime(ts)}` : '';
  const metaLine =
    call.state === 'answered'
      ? `${whenText}${whenText ? ' · ' : ''}通话 ${durText}`
      : whenText;
  const pillText =
    call.state === 'answered' ? '已接通' : call.state === 'declined' ? '你拒接了' : '未接来电';

  return (
    <div
      data-testid="call-detail"
      data-state={call.state}
      className="fixed inset-0 z-[1300] flex flex-col bg-chat-bg text-foreground"
    >
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回聊天"
          data-testid="call-detail-back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-pill text-chat-pill-fg transition hover:bg-chat-line active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 text-center text-[16px] font-semibold">通话记录</h1>
        <span className="h-10 w-10 shrink-0" aria-hidden />
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* 头像 + 名字 + 时刻/时长 + 状态 */}
        <div className="flex flex-col items-center px-4 pt-5">
          <span className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-full bg-chat-pill">
            <AvatarContent value={avatar ?? ''} className="text-[38px]" />
          </span>
          <h2 data-testid="call-detail-name" className="mt-3 max-w-[80%] truncate text-[22px] font-semibold leading-tight">
            {name}
          </h2>
          <p data-testid="call-detail-meta" className="mt-1.5 text-center text-[12px] text-chat-meta">
            {metaLine}
          </p>
          <span className="mt-2.5 inline-flex items-center rounded-full bg-chat-pill px-3 py-1.5 text-[11px] text-chat-pill-fg">
            {pillText}
          </span>
        </div>

        <div className="mx-4 mt-6 border-t border-chat-line" />

        {/* 通话内容 */}
        <div className="px-4">
          <div className="mb-2 mt-5 flex items-baseline justify-between px-1">
            <span className="text-[12px] text-chat-meta">通话内容</span>
          </div>

          <div className="rounded-2xl bg-chat-ai p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
            <p className="text-[13px] leading-6 text-foreground">这次通话没有留下逐字记录。</p>
            <p className="mt-1 text-[12px] leading-5 text-chat-meta">
              通话里说的话不落库；聊天里打过的字仍然按原样留在对话中。
            </p>
          </div>

          {/* 脚注（设计稿同款两条） */}
          <ul className="mt-4 space-y-1.5 px-1 text-[11px] leading-5 text-chat-meta">
            <li>· 你打的字会同步进聊天记录，他说的话只留在通话里。</li>
            <li>· 逐字转写只存在本机；这通电话没有可回放的片段。</li>
          </ul>
        </div>

        <div className="h-6" />
      </div>

      {/* 底部：再打一通 */}
      <div className="shrink-0 bg-chat-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onCallAgain}
          data-testid="call-detail-again"
          className="h-12 w-full rounded-full bg-chat-me text-[14px] font-medium text-chat-me-fg transition active:scale-[0.99]"
        >
          再打一通
        </button>
      </div>
    </div>
  );
}

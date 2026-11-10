import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { AvatarContent } from '@/components/AvatarContent';
import { useProfileStore } from '@/stores/profileStore';
import { listCalls, callStatusWord, type CallDTO } from '@/lib/api/calls';

/**
 * 通话记录 · 列表页 + 详情页（/calls、/calls/:id，对齐 2026-11-04 设计稿 130:4 / 126:58）。
 *
 * 列表页：「最近通话」+ 通话卡（头像 / 名字 / 日期时长副文 / ›，未接听红字）。
 * 详情页（对齐设计稿的减法）：**没有大头像、没有「谁挂的」状态药丸** —— 直接名字 +
 * 「M月D日 H:MM · 通话 X 分 Y 秒」→ 分隔线 → 「通话内容」空态（逐字转写后端不落库，
 * 不编造对话）→ 两条脚注 → 底部「再打一通」（回聊天底座发起通话）。
 *
 * 数据：复用 `/api/calls`（listCalls），无单条接口就在前端按 id 过滤。
 * 入口：角色页 / 我的页统计卡的「通话」格。
 */

/** M月D日 H:MM */
function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

/** 「12 分 04 秒」/「45 秒」 */
function fmtSecs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒` : `${s} 秒`;
}

function useCalls() {
  const [calls, setCalls] = useState<CallDTO[] | null>(null);
  useEffect(() => {
    let alive = true;
    listCalls().catch(() => [] as CallDTO[]).then((c) => {
      if (alive) setCalls(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return calls;
}

/** ============ 列表页 ============ */
export function CallsPage() {
  const navigate = useNavigate();
  const partnerName = useProfileStore((s) => s.partnerName);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const calls = useCalls();

  const name = (partnerRemark || partnerName || '小蓝莓').trim();

  return (
    <PageShell title="通话记录" eyebrow="CALLS" testId="calls-page" backTo="/chat">
      <p className="mb-2 px-1 text-[11px] text-chat-meta">最近通话</p>
      <div className="space-y-2.5">
        {calls === null && (
          <div className="rounded-2xl bg-chat-ai p-4 text-[12px] text-chat-meta">加载中…</div>
        )}
        {calls !== null && calls.length === 0 && (
          <div className="rounded-2xl bg-chat-ai p-4 text-[12px] leading-5 text-chat-meta">
            还没有通话记录。去聊天里打一通吧。
          </div>
        )}
        {(calls ?? []).map((c) => {
          const missed = c.state !== 'answered';
          const sub = missed
            ? `${fmtWhen(c.startedAt ?? c.createdAt)} · ${callStatusWord(c)}`
            : `${fmtWhen(c.startedAt ?? c.createdAt)} · 通话 ${fmtSecs(c.seconds)}`;
          return (
            <button
              key={c.id}
              type="button"
              data-testid="calls-item"
              data-state={c.state}
              onClick={() => navigate(`/calls/${c.id}`)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] transition hover:bg-surface-2 active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-chat-pill">
                <AvatarContent value={partnerAvatar} className="h-full w-full text-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-foreground">
                  {name}
                </span>
                <span
                  className={
                    missed
                      ? 'block truncate text-[11px] text-rose-500'
                      : 'block truncate text-[11px] text-chat-meta'
                  }
                >
                  {sub}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </PageShell>
  );
}

/** ============ 详情页 ============ */
export function CallDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const partnerName = useProfileStore((s) => s.partnerName);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const calls = useCalls();

  const call = (calls ?? []).find((c) => c.id === id) ?? null;
  const name = (partnerRemark || partnerName || '小蓝莓').trim();

  const secs = call?.seconds ?? 0;
  const metaLine = call
    ? call.state === 'answered'
      ? `${fmtWhen(call.startedAt ?? call.createdAt)} · 通话 ${fmtSecs(secs)}`
      : `${fmtWhen(call.startedAt ?? call.createdAt)} · ${callStatusWord(call)}`
    : '';

  return (
    <PageShell title="通话记录" eyebrow="CALLS" testId="call-detail-page" backTo="/calls">
      {/* 头部：无头像、无「谁挂的」——直接名字 + 时刻/时长 */}
      <div className="px-1 pt-1">
        <h2 data-testid="call-page-name" className="truncate text-[20px] font-semibold leading-tight">
          {name}
        </h2>
        <p data-testid="call-page-meta" className="mt-1.5 text-[12px] text-chat-meta">
          {call ? metaLine : ''}
        </p>
      </div>

      <div className="mt-5 border-t border-chat-line" />

      {/* 通话内容 */}
      <div className="mb-2 mt-5 flex items-baseline justify-between px-1">
        <span className="text-[12px] text-chat-meta">通话内容</span>
        <span className="text-[10px] text-chat-meta/70">点他说的话可重听</span>
      </div>
      <div className="rounded-2xl bg-chat-ai p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
        <p className="text-[13px] leading-6 text-foreground">这次通话没有留下逐字记录。</p>
        <p className="mt-1 text-[12px] leading-5 text-chat-meta">
          通话里说的话不落库；聊天里打过的字仍然按原样留在对话中。
        </p>
      </div>

      {/* 脚注（设计稿同款两条，纯文字不带卡片） */}
      <ul className="mt-4 space-y-1.5 px-1 text-[11px] leading-5 text-chat-meta">
        <li>· 你打的字会同步进聊天记录，他说的话只留在通话里。</li>
        <li>· 逐字转写只存在本机；这通电话没有可回放的片段。</li>
      </ul>

      {/* 底部：再打一通 → 回聊天底座发起（真实通话走 PaiVoice，在聊天页里起） */}
      <div className="pt-6">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          data-testid="call-page-again"
          className="h-12 w-full rounded-full bg-chat-me text-[14px] font-medium text-chat-me-fg transition active:scale-[0.99]"
        >
          再打一通
        </button>
      </div>
    </PageShell>
  );
}

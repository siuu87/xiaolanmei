import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { AvatarContent } from '@/components/AvatarContent';
import { ProfileCoverSheet, ProfileStats } from '@/components/ProfileCoverSheet';
import { useProfileStore } from '@/stores/profileStore';
import { useChatStore } from '@/features/chat/chatStore';
import { callStats } from '@/lib/api/calls';
import { listMemories, type MemoryDTO } from '@/lib/api/memories';
import { listNotes } from '@/lib/api/home';
import { ProfileEditor } from '@/features/shell/ProfileEditor';

/**
 * 我的 · 个人主页（/me，对齐 2026-11-04 设计稿 130:62）。
 *
 * 与角色页同一套「封面 + 上叠白卡」版式（ProfileCoverSheet）：
 * 头像骑线 → 头部居中（名字 / 在线药丸 / 个性签名）
 * → 4 格统计（消息 / 通话 / 记忆 / 信件，通话 → 通话记录列表）
 * → 「我是谁 · 角色设定」（我的介绍）→ 底部「编辑资料」。
 *
 * 入口：设置页「个人」分区的「个人主页」；返回键回设置页。
 * 数据全部来自现有 store / 接口，不新增后端。
 */
export function MePage() {
  const navigate = useNavigate();
  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const description = useProfileStore((s) => s.description);
  const signature = useProfileStore((s) => s.signature);

  const conversation = useChatStore((s) => s.conversation);

  const [editing, setEditing] = useState(false);
  const [calls, setCalls] = useState<number | null>(null);
  const [memories, setMemories] = useState<MemoryDTO[] | null>(null);
  const [letters, setLetters] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      callStats().catch(() => null),
      listMemories({ sort: 'time' }).catch(() => [] as MemoryDTO[]),
      listNotes().catch(() => []),
    ]).then(([c, mems, notes]) => {
      if (!alive) return;
      setCalls(c?.total ?? 0);
      setMemories(mems);
      setLetters(Array.isArray(notes) ? notes.length : 0);
    });
    return () => {
      alive = false;
    };
  }, []);

  const messages = conversation?.messages ?? [];
  const msgCount = messages.length;
  const memCount = memories?.length ?? 0;

  // 在线状态：拿我最后一次说话的时间说事，不编造数值
  const lastMine = [...messages].reverse().find((m) => m.role === 'user' && m.content);
  const statusText = lastMine?.createdAt
    ? `在线 · ${relative(lastMine.createdAt)}`
    : '在线';

  const goCalls = () => navigate('/calls');

  return (
    <PageShell
      title="我的"
      eyebrow="ME"
      testId="me-page"
      backTo="/settings"
      bodyClassName="px-0 pb-6 pt-0"
    >
      <ProfileCoverSheet
        avatar={<AvatarContent value={avatar} className="h-full w-full text-[44px]" />}
        onAvatarClick={() => setEditing(true)}
        avatarLabel="换头像"
        onCoverPillClick={() => setEditing(true)}
      >
        {/* 头部居中：名字 / 在线药丸 / 个性签名 */}
        <div className="flex flex-col items-center px-4">
          <h2
            data-testid="me-name"
            className="max-w-[80%] truncate text-[24px] font-semibold leading-tight"
          >
            {name.trim() || '我'}
          </h2>
          <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-chat-me px-3 py-1.5 text-[11px] text-chat-me-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {statusText}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid="me-signature"
            className="mt-2 text-[11px] text-chat-meta transition hover:text-foreground"
          >
            {signature.trim() || '点击输入个性签名...'}
          </button>
        </div>

        {/* 4 格统计（通话 → 通话记录列表） */}
        <div className="mt-5">
          <ProfileStats
            msg={msgCount}
            calls={calls ?? 0}
            memories={memCount}
            letters={letters ?? 0}
            onCalls={goCalls}
          />
        </div>

        {/* 我是谁 · 角色设定 */}
        <div className="mb-2 mt-5 flex items-baseline justify-between px-5">
          <span className="text-[12px] text-chat-meta">我是谁</span>
          <span className="text-[11px] text-chat-meta/80">角色设定</span>
        </div>
        <div className="mx-4 rounded-2xl bg-chat-ai p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
          {description.trim() ? (
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground">
              {description}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-left text-[13px] leading-6 text-chat-meta transition hover:text-foreground"
            >
              还没写。点「编辑资料」，介绍一下你是谁。
            </button>
          )}
        </div>

        {/* 底部：编辑资料 */}
        <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid="me-edit"
            className="h-12 w-full rounded-full bg-chat-me text-[14px] font-medium text-chat-me-fg transition active:scale-[0.99]"
          >
            编辑资料
          </button>
        </div>
      </ProfileCoverSheet>

      <ProfileEditor target={editing ? 'me' : null} onClose={() => setEditing(false)} />
    </PageShell>
  );
}

/** 「刚刚 / N 分钟前 / N 小时前」 */
function relative(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return '刚说完话';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

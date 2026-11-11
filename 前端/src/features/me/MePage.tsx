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
import {
  EditableCard,
  useAvatarUploader,
} from '@/features/shell/ProfileInlineEdit';

/**
 * 我的资料页（/me，对齐 2026-11-04 设计稿 130:62）。
 *
 * 与「他的资料」同一套「封面 + 上叠白卡」版式（ProfileCoverSheet）。
 * 编辑改成**区块就地编辑**：每个区块右上角一支小笔，点一下就在框里改，
 * 不再弹一个整页大编辑浮层（2026-11-10 用户定）。
 *
 * 入口：首页刊头点头像、设置 → 个人 → 我的资料。返回回聊天底座（/chat），不回首页。
 * 数据全部来自现有 store / 接口，不新增后端。
 */
export function MePage() {
  const navigate = useNavigate();
  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const description = useProfileStore((s) => s.description);
  const signature = useProfileStore((s) => s.signature);
  const setName = useProfileStore((s) => s.setName);
  const setDescription = useProfileStore((s) => s.setDescription);
  const setSignature = useProfileStore((s) => s.setSignature);

  const conversation = useChatStore((s) => s.conversation);

  const uploader = useAvatarUploader('me');
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
      title="我的资料"
      eyebrow="ME"
      testId="me-page"
      backTo="/chat"
      bodyClassName="px-0 pb-6 pt-0"
    >
      <ProfileCoverSheet
        avatar={<AvatarContent value={avatar} className="h-full w-full text-[44px]" />}
        onAvatarClick={uploader.trigger}
        avatarLabel="换头像"
        coverPill=""
      >
        {/* 头部居中：名字 / 在线药丸 */}
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

        {/* 区块就地编辑：每个卡片右上角小笔，点一下在框里改 */}
        <div className="mt-5 space-y-3">
          <EditableCard
            title="名字"
            value={name}
            placeholder="例如：小明、学生、工作者"
            maxLength={24}
            onSave={(v) => setName(v)}
          />
          <EditableCard
            title="个性签名"
            value={signature}
            placeholder="一句话介绍此刻的自己…"
            maxLength={60}
            onSave={(v) => setSignature(v)}
          />
          <EditableCard
            title="我是谁"
            value={description}
            placeholder="介绍一下你是谁、喜欢什么、最近在忙什么…"
            onSave={(v) => setDescription(v)}
          />
        </div>
      </ProfileCoverSheet>

      {uploader.input}
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

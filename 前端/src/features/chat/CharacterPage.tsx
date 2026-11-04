import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';
import { ProfileCoverSheet, ProfileStats } from '@/components/ProfileCoverSheet';
import { useProfileStore } from '@/stores/profileStore';
import { useChatStore } from '@/features/chat/chatStore';
import { callStats } from '@/lib/api/calls';
import { listMemories, type MemoryDTO } from '@/lib/api/memories';
import { listNotes } from '@/lib/api/home';
import { ProfileEditor } from '@/features/shell/ProfileEditor';

/**
 * 他的资料页（对齐 2026-11-04 设计稿 97:4：封面 + 上叠白卡版式；
 * 口径与「我的资料」页 MePage 一致，2026-11-04 用户定：查看角色进来就是资料页）。
 *
 * 结构：顶栏（返回 / 他的资料 / 编辑，浮在封面上）→ 浅蓝小封面 + 白卡上叠
 * → 头像骑线 → 头部居中（备注大字 / 姓名 · 本名 / 在线小药丸）
 * → 4 格统计（消息 / 通话 / 记忆 / 信件，通话可点进通话记录列表）
 * → 「他是谁 · 角色设定」（人设）→ 「最近印象」（最近记忆）→ 底部「编辑资料」。
 *
 * **只读 + 复用**：数据全部来自已有的 profileStore / chatStore / `/api/calls/stats` /
 * `/api/memories` / `/api/notes`（信件），不新增接口；「编辑」直接打开现成的
 * `ProfileEditor`（partner 那一档），不改路由与后端。整页不透明，盖在聊天底座之上。
 */
export function CharacterPage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const partnerName = useProfileStore((s) => s.partnerName);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const persona = useProfileStore((s) => s.persona);
  const conversation = useChatStore((s) => s.conversation);

  const [editing, setEditing] = useState(false);
  const [calls, setCalls] = useState<number | null>(null);
  const [memories, setMemories] = useState<MemoryDTO[] | null>(null);
  const [letters, setLetters] = useState<number | null>(null);

  // 打开时拉一次统计与最近记忆；关掉再开会重新取（不缓存）
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  // Esc 关闭（capture 阶段拦下，别连带下面的抽屉 / 弹层）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editing) return; // 编辑浮层自己处理 Esc
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, editing, onClose]);

  if (!open) return null;

  const messages = conversation?.messages ?? [];
  const remark = partnerRemark.trim();
  const name = (remark || partnerName || conversation?.title || '小蓝莓').trim();

  // 「认识 N 天」：取会话里最早一条消息的那天（没有消息就不写天数）
  const firstTs = messages.reduce<number | null>(
    (min, m) => (m.createdAt && (min === null || m.createdAt < min) ? m.createdAt : min),
    null,
  );
  const knownDays = firstTs ? Math.max(1, Math.ceil((Date.now() - firstTs) / 86_400_000)) : null;

  // 在线状态：拿对方最后一次说话的时间说事，不编造数值
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
  const statusText = lastAssistant?.createdAt
    ? `在线 · ${relative(lastAssistant.createdAt)}`
    : '在线';

  const msgCount = messages.length;
  const memCount = memories?.length ?? 0;
  const recent = (memories ?? []).slice(0, 3);

  // 头部第二行：有备注时展示「姓名 · 本名」，否则退回「认识 N 天」
  const subName =
    remark && partnerName.trim() && partnerName.trim() !== remark
      ? `姓名 · ${partnerName.trim()}`
      : null;

  // 通话格 → 通话记录列表（先收掉这层覆盖层再跳，避免盖在新页面上）
  const goCalls = () => {
    onClose();
    navigate('/calls');
  };

  return (
    <div
      data-testid="character-page"
      className="fixed inset-0 z-[1300] flex flex-col bg-chat-bg text-foreground"
    >
      {/* 顶栏：返回 / 他的资料 / 编辑（透明浮在封面蓝上） */}
      <header className="relative z-20 flex shrink-0 items-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回聊天"
          data-testid="character-back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/60 text-foreground transition hover:bg-white/80 active:scale-95 dark:bg-white/10 dark:hover:bg-white/20"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 text-center text-[16px] font-semibold">他的资料</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="character-edit-top"
          className="shrink-0 px-2 text-[13px] text-foreground/70 transition hover:text-foreground"
        >
          编辑
        </button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ProfileCoverSheet
          avatar={<AvatarContent value={partnerAvatar} className="h-full w-full text-[44px]" />}
          onAvatarClick={() => setEditing(true)}
          avatarLabel="换头像"
          onCoverPillClick={() => setEditing(true)}
        >
          {/* 头部居中：备注大字 / 姓名 · 本名（或认识天数）/ 在线药丸 */}
          <div className="flex flex-col items-center px-4">
            <h2
              data-testid="character-name"
              className="max-w-[80%] truncate text-[24px] font-semibold leading-tight"
            >
              {name}
            </h2>
            <p className="mt-1.5 text-[12px] text-chat-meta">
              {subName ?? (knownDays ? `认识 ${knownDays} 天` : '刚认识')}
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-chat-pill px-3 py-1.5 text-[11px] text-chat-pill-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              {statusText}
            </span>
          </div>

          {/* 4 格统计：消息 / 通话 / 记忆 / 信件（通话 → 通话记录列表） */}
          <div className="mt-5">
            <ProfileStats
              msg={msgCount}
              calls={calls ?? 0}
              memories={memCount}
              letters={letters ?? 0}
              onCalls={goCalls}
            />
          </div>

          {/* 他是谁 · 角色设定（与 MePage「我是谁 · 角色设定」同口径） */}
          <SectionLabel left="他是谁" right="角色设定" />
          <div className="mx-4 rounded-2xl bg-chat-ai p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
            {persona.trim() ? (
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground">{persona}</p>
            ) : (
              <p className="text-[13px] leading-6 text-chat-meta">
                还没写。点「编辑资料」，介绍一下 ta 是谁。
              </p>
            )}
          </div>

          {/* 最近印象 */}
          <SectionLabel left="最近印象" right={`全部 ${memCount} 条`} />
          <div className="mx-4 rounded-2xl bg-chat-ai px-4 py-1 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
            {recent.length === 0 ? (
              <p className="py-4 text-[12px] leading-5 text-chat-meta">还没有留下印象。</p>
            ) : (
              recent.map((m, i) => (
                <div
                  key={m.id}
                  data-testid="character-recent"
                  className={cn('flex gap-3 py-3', i > 0 && 'border-t border-chat-line')}
                >
                  <span className="w-9 shrink-0 text-[11px] tabular-nums text-chat-meta">
                    {md(m.createdAt || m.updatedAt)}
                  </span>
                  <p className="min-w-0 text-[12.5px] leading-5 text-foreground">{m.content}</p>
                </div>
              ))
            )}
          </div>

          {/* 底部：编辑资料（白卡内随内容滚动） */}
          <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
            <button
              type="button"
              onClick={() => setEditing(true)}
              data-testid="character-edit"
              className="h-12 w-full rounded-full bg-chat-me text-[14px] font-medium text-chat-me-fg transition active:scale-[0.99]"
            >
              编辑资料
            </button>
          </div>
        </ProfileCoverSheet>
      </div>

      {/* 编辑：复用现存的「他的资料」浮层（头像 / 姓名 / 人设 / 语音 / 风格 / 备忘） */}
      <ProfileEditor target={editing ? 'partner' : null} onClose={() => setEditing(false)} />
    </div>
  );
}

/** 小标题行：左边灰字，右边更淡的补充信息 */
function SectionLabel({ left, right }: { left: string; right: string }) {
  return (
    <div className="mb-2 mt-5 flex items-baseline justify-between px-5">
      <span className="text-[12px] text-chat-meta">{left}</span>
      <span className="text-[11px] text-chat-meta/80">{right}</span>
    </div>
  );
}

/** 「刚刚 / N 分钟前 / N 小时前」 */
function relative(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return '刚说完话';
  if (mins < 60) return `${mins} 分钟前说过话`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时前说过话`;
  return `${Math.round(hours / 24)} 天前说过话`;
}

/** 记忆行左边那格：10.28 */
function md(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

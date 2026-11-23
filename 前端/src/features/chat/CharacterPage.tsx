import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
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
  EditableSubline,
  ExpandCard,
  useAvatarUploader,
  savePartnerRemark,
} from '@/features/shell/ProfileInlineEdit';
import { StyleRulesPanel } from '@/features/prompts/StyleRulesPanel';
import { MemoSection } from '@/features/memo/MemoSection';

/**
 * 他的资料页（/partner，对齐 2026-11-04 设计稿 97:4：封面 + 上叠白卡版式；
 * 口径与「我的资料」页 MePage 完全一致 —— 同样套 PageShell，2026-11-10 用户定）。
 *
 * **2026-11-10 改造**：编辑从「整页大编辑浮层」改成**区块就地编辑**——
 * 每个区块右上角一支小笔，点一下就在框里改；语音 / 世界书 / 模块 / 备忘录
 * 等复杂设置收进可展开的卡片，点 ▾ 才展开。旧「点头像进 ProfileEditor」的
 * 编辑页被这套取代（入口统一改到首页 / 抽屉点头像）。
 *
 * 结构：顶栏（返回 / 他的资料）→ 浅蓝小封面 + 白卡上叠
 * → 头像骑线 → 头部居中（本名大字 / 备注小字·可就地改 / 在线小药丸）
 * → 4 格统计（消息 / 通话 / 记忆 / 信件）→ 各就地编辑区块 → 最近印象。
 */
export function CharacterPage() {
  const navigate = useNavigate();
  const partnerName = useProfileStore((s) => s.partnerName);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const persona = useProfileStore((s) => s.persona);
  const setPersona = useProfileStore((s) => s.setPersona);
  const conversation = useChatStore((s) => s.conversation);

  const uploader = useAvatarUploader('partner');
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
  const remark = partnerRemark.trim();
  // 大字 = 本名（没填就退回备注 / 会话标题）；备注只做头像下那行小字
  const displayName = partnerName.trim() || remark || conversation?.title || '小蓝莓';

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

  const goCalls = () => navigate('/calls');

  return (
    <PageShell
      title="他的资料"
      eyebrow="PARTNER"
      testId="character-page"
      bodyClassName="px-0 pb-6 pt-0"
    >
      <ProfileCoverSheet
        avatar={<AvatarContent value={partnerAvatar} className="h-full w-full text-[44px]" />}
        onAvatarClick={uploader.trigger}
        avatarLabel="换头像"
        coverPill=""
      >
        {/* 头部居中：本名大字 / 备注小字（可编辑）/ 认识天数 / 在线药丸。
            2026-11-18 用户定（参考 Nid douillet）：名字和备注都在头像下面，
            备注不再占一行大字；改完备注后下面那行认识天数一直在；
            真正的身份靠下面的世界书和人设知道。 */}
        <div className="flex flex-col items-center px-4">
          <h2
            data-testid="character-name"
            className="max-w-[80%] truncate text-[24px] font-semibold leading-tight"
          >
            {displayName}
          </h2>
          <EditableSubline
            testId="character-remark"
            ariaLabel="编辑备注"
            value={partnerRemark}
            displayText={remark ? `备注 · ${remark}` : '还没写备注'}
            placeholder="写个备注，比如「哥哥」"
            maxLength={12}
            onSave={(v) => savePartnerRemark(v)}
          />
          <span className="mt-1 text-[12px] leading-none text-chat-meta">
            {knownDays ? `认识 ${knownDays} 天` : '刚认识'}
          </span>
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

        {/* 区块就地编辑：备注/姓名已收进头像下那行小字（只备注可改），
            身份资料只留「他是谁」+ 世界书（2026-11-23 用户定：内置人设和语言风格各并一处）。
            每块标题下都写一句「这块是干什么的」，免得看不懂填什么（2026-11-18 晚） */}
        <div className="mt-5 space-y-3">
          <EditableCard
            title="他是谁"
            hint="TA 的身份、性格、背景故事——这份就是 TA 的人设，AI 照着它说话做事"
            value={persona}
            placeholder="写一下 ta 是谁、性格、背景故事…"
            onSave={(v) => setPersona(v)}
          />
          <ExpandCard
            title="世界书"
            hint="TA 的世界设定与说话方式，决定每句台词怎么讲；可按模块分组"
            defaultOpen
          >
            <StyleRulesPanel />
          </ExpandCard>
          <ExpandCard title="语音与语言" hint="TA 的语音音色、语速与说话语言，通话和读白按这个来">
            <VoiceCard />
          </ExpandCard>
          <ExpandCard title="备忘录" hint="平时随手记的备忘，AI 会读、也能往里写">
            <MemoSection />
          </ExpandCard>
        </div>

        {/* 最近印象（只读） */}
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
      </ProfileCoverSheet>

      {uploader.input}
    </PageShell>
  );
}

/** 语音与语言：内嵌在展开卡片里，三个字段都在这里就地调 */
function VoiceCard() {
  const voiceId = useProfileStore((s) => s.voiceId);
  const speed = useProfileStore((s) => s.voiceSpeed);
  const lang = useProfileStore((s) => s.voiceLanguage);
  const setVoiceId = useProfileStore((s) => s.setVoiceId);
  const setVoiceSpeed = useProfileStore((s) => s.setVoiceSpeed);
  const setVoiceLanguage = useProfileStore((s) => s.setVoiceLanguage);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[12px] text-chat-meta">MiniMax 语音 ID（可选）</span>
        <input
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          placeholder="例如：male-qn-qingse"
          className="mt-1 w-full rounded-xl border border-chat-line bg-page-bg px-3 py-2 text-[13px] text-foreground outline-none focus:border-chat-accent/60"
        />
      </label>
      <label className="block">
        <span className="text-[12px] text-chat-meta">语音语速</span>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={speed}
            onChange={(e) => setVoiceSpeed(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 accent-primary"
          />
          <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-foreground">
            {speed.toFixed(1)}x
          </span>
        </div>
      </label>
      <label className="block">
        <span className="text-[12px] text-chat-meta">语言设置（可选）</span>
        <select
          value={lang}
          onChange={(e) => setVoiceLanguage(e.target.value)}
          className="mt-1 w-full appearance-none rounded-xl border border-chat-line bg-page-bg px-3 py-2 text-[13px] text-foreground outline-none focus:border-chat-accent/60"
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value} className="bg-surface text-foreground">
              {l.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: '不设置（默认中文普通话）' },
  { value: 'zh', label: '中文（普通话）' },
  { value: 'yue', label: '中文（粤语）' },
  { value: 'en', label: 'English 英语' },
  { value: 'ja', label: '日本語 日语' },
  { value: 'ko', label: '한국어 韩语' },
  { value: 'es', label: 'Español 西班牙语' },
  { value: 'fr', label: 'Français 法语' },
  { value: 'de', label: 'Deutsch 德语' },
  { value: 'ru', label: 'Русский 俄语' },
];

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

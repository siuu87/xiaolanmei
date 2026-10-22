/**
 * 酒馆「小手机」模块 —— 聊天 / 群聊
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';
import { usePhoneStore } from './phoneStore';
import { PhoneNavBar } from './PhoneShell';
import type { ChatMessage, Contact, Session } from './types';

/* ----------------------------- 小工具 ----------------------------- */

/** 相对时间：刚刚 / 12分钟前 / 3小时前 / 昨天 / 10-07 */
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, yest)) return '昨天';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 会话最后一条可展示的消息预览 */
function previewOf(s: Session): string {
  const last = [...s.messages].reverse().find((m) => m.content.trim());
  if (!last) return '还没有消息';
  return last.content.replace(/\s+/g, ' ').slice(0, 40);
}

/** iMessage 风格气泡：蓝色发出 / 浅灰收到，无头像，群聊在气泡内首行标注发送者 */
function Bubble({ msg, isGroup, onRetry }: { msg: ChatMessage; isGroup: boolean; onRetry?: () => void }) {
  if (msg.sender === 'system') {
    return (
      <div className="my-3 flex justify-center">
        <span className="px-3 text-center text-[12px] font-normal text-phone-muted">{msg.content}</span>
      </div>
    );
  }
  const mine = msg.sender === 'me';
  const streaming = msg.streaming;
  // iMessage 气泡圆角：20px，贴近发送方的那一角收成 6px
  const radius = mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px';
  return (
    <div className={cn('flex px-3 py-[3px]', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
        {!mine && isGroup && <span className="mb-1 px-1 text-[11px] font-medium text-phone-muted">{msg.senderName}</span>}
        <div
          className={cn(
            'relative whitespace-pre-wrap break-words px-[13px] py-[7px] text-[16px] leading-[1.35]',
            mine
              ? 'bg-phone-bubble-me text-white'
              : msg.error
                ? 'bg-phone-grouped text-destructive'
                : 'bg-phone-bubble-ai text-phone-ink',
          )}
          style={{ borderRadius: radius }}
        >
          {msg.content || (streaming ? <TypingDots /> : '')}
          {streaming && msg.content && <span className="ml-[3px] inline-block h-[13px] w-[2px] animate-pulse bg-current align-middle opacity-60" />}
        </div>
        {msg.error && onRetry && (
          <button type="button" onClick={onRetry} className="mt-1 text-[11px] text-phone-blue underline">
            重试
          </button>
        )}
      </div>
    </div>
  );
}

/** iMessage 输入中：三个跳动的圆点 */
function TypingDots() {
  return (
    <span className="flex items-center gap-[3px] py-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-[7px] w-[7px] rounded-full bg-phone-muted"
          style={{ animation: `imsg-dot 1.2s ${i * 0.18}s infinite ease-in-out` }}
        />
      ))}
      <style>{`@keyframes imsg-dot { 0%,60%,100% { opacity:.35; transform:translateY(0) } 30% { opacity:1; transform:translateY(-2px) } }`}</style>
    </span>
  );
}

/* ============================ 会话列表页 ============================ */

export function SessionsPage({ onOpen, onCompose }: { onOpen: (id: string) => void; onCompose: () => void }) {
  const sessions = usePhoneStore((s) => s.sessions);
  const togglePin = usePhoneStore((s) => s.togglePin);
  const removeSession = usePhoneStore((s) => s.removeSession);
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const kw = query.trim().toLowerCase();
    const list = sessions.filter((s) => (kw ? s.title.toLowerCase().includes(kw) : true));
    return [...list].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.lastActiveAt - a.lastActiveAt;
    });
  }, [sessions, query]);

  return (
    <div className="flex h-full flex-col bg-phone-bg">
      <div className="shrink-0 bg-phone-nav">
        <PhoneNavBar
          title="信息"
          right={
            <button
              type="button"
              onClick={onCompose}
              aria-label="发起聊天"
              className="flex h-8 w-8 items-center justify-center rounded-full text-phone-blue transition active:bg-phone-sep"
            >
              <Plus className="h-5 w-5" strokeWidth={2.4} />
            </button>
          }
        />
        <div className="px-3 pb-2">
          <div className="flex h-9 items-center gap-1.5 rounded-[10px] bg-phone-grouped px-2.5">
            <Search className="h-4 w-4 shrink-0 text-phone-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索"
              className="h-full flex-1 bg-transparent text-[16px] text-phone-ink outline-none placeholder:text-phone-muted"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-phone-bg">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<MessageSquarePlus className="h-9 w-9" />}
            title={query ? '没有匹配的会话' : '还没有信息'}
            desc={query ? '换个关键词试试' : '去「通讯录」选个人，或点右上角发起聊天'}
            action={!query ? { label: '发起聊天', onClick: onCompose } : undefined}
          />
        ) : (
          sorted.map((s) => (
            <div key={s.id} className={cn('group relative', s.pinned && 'bg-phone-surface')}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="flex w-full items-center gap-3 py-2 pl-4 pr-3 text-left transition active:bg-phone-grouped"
              >
                <span className="relative flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#dcdce0] to-[#c9c9cf] text-2xl">
                  {s.kind === 'group' && !s.avatar ? (
                    <GroupAvatar session={s} />
                  ) : (
                    <AvatarContent value={s.avatar ?? ''} fallback="💬" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center border-b border-phone-sep py-3">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[16px] font-semibold text-phone-ink">{s.title}</span>
                    {s.kind === 'group' && (
                      <span className="shrink-0 text-[12px] text-phone-muted">{s.memberIds.length}人</span>
                    )}
                    <span className="ml-auto shrink-0 text-[13px] text-phone-muted">{relTime(s.lastActiveAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-phone-muted">{previewOf(s)}</span>
                    {s.unread > 0 && (
                      <span className="flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-phone-blue px-1.5 text-[12px] font-semibold text-primary-foreground">
                        {s.unread > 99 ? '99+' : s.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === s.id ? null : s.id);
                }}
                aria-label="更多"
                className="absolute right-1 top-4 flex h-7 w-7 items-center justify-center rounded-full text-phone-muted opacity-0 transition hover:bg-phone-grouped group-hover:opacity-100 active:bg-phone-sep"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {menuId === s.id && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
                  <div className="absolute right-2 top-11 z-30 w-32 overflow-hidden rounded-xl bg-phone-surface text-[13px] shadow-lg ring-1 ring-phone-sep">
                    <button
                      type="button"
                      onClick={() => {
                        togglePin(s.id);
                        setMenuId(null);
                      }}
                      className="block w-full px-3 py-2 text-left text-phone-ink hover:bg-phone-grouped"
                    >
                      {s.pinned ? '取消置顶' : '置顶'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeSession(s.id);
                        setMenuId(null);
                      }}
                      className="block w-full border-t border-phone-sep px-3 py-2 text-left text-[#FF3B30] hover:bg-phone-grouped"
                    >
                      删除会话
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 群头像：取前 2~4 个成员 emoji 拼成 2×2 网格 */
function GroupAvatar({ session }: { session: Session }) {
  const contacts = usePhoneStore((s) => s.contacts);
  const members = session.memberIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter((c): c is Contact => !!c)
    .slice(0, 4);
  if (members.length === 0) return <>👥</>;
  return (
    <span className="grid grid-cols-2 gap-[1px] p-0.5">
      {members.map((m, i) => (
        <span
          key={m.id}
          className={cn(
            'flex items-center justify-center text-[11px] leading-none',
            members.length === 2 && i === 0 && 'row-span-2',
          )}
        >
          <AvatarContent value={m.avatar ?? ''} fallback="🙂" />
        </span>
      ))}
    </span>
  );
}

/* ============================ 会话详情页 ============================ */

export function ChatPage({ sessionId, onBack, onOpenInfo }: { sessionId: string; onBack: () => void; onOpenInfo: () => void }) {
  const session = usePhoneStore((s) => s.sessions.find((x) => x.id === sessionId));
  const sendMessage = usePhoneStore((s) => s.sendMessage);
  const stopSession = usePhoneStore((s) => s.stopSession);
  const markRead = usePhoneStore((s) => s.markRead);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markRead(sessionId);
  }, [sessionId, markRead, session?.messages.length]);

  // 新消息 / 流式内容变化时贴底（仅当用户本就在底部附近，避免打断上翻阅读）
  const lastLen = session?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastLen, session?.messages[lastLen - 1]?.content]);

  const busy = usePhoneStore(() =>
    session ? session.messages.some((m) => m.streaming) : false,
  );

  if (!session) {
    return (
      <div className="flex h-full flex-col bg-phone-grouped">
        <PhoneNavBar title="会话不存在" onBack={onBack} />
        <EmptyState icon={<MessageSquarePlus className="h-9 w-9" />} title="会话已被删除" desc="" />
      </div>
    );
  }

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    void sendMessage(sessionId, text);
  };

  const members = session.memberIds
    .map((id) => usePhoneStore.getState().contacts.find((c) => c.id === id))
    .filter((c): c is Contact => !!c);

  return (
    <div className="flex h-full flex-col bg-phone-bg">
      {/* iMessage 导航栏：联系人名居中，返回箭头靠左，群聊显示成员数 */}
      <div className="flex items-center gap-1 border-b border-phone-sep bg-phone-nav px-2">
        <PhoneNavBar
          title={session.title}
          subtitle={session.kind === 'group' ? `${session.memberIds.length} 位成员` : undefined}
          onBack={onBack}
          right={
            session.kind === 'group' ? (
              <button
                type="button"
                onClick={onOpenInfo}
                aria-label="群信息"
                className="flex h-8 w-8 items-center justify-center rounded-full text-phone-blue transition active:bg-phone-sep"
              >
                <Users style={{ width: 19, height: 19 }} />
              </button>
            ) : (
              <span className="w-8" />
            )
          }
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-phone-bg py-3">
        {session.kind === 'group' && (
          <div className="mb-3 px-4 text-center text-[12px] leading-relaxed text-phone-muted">
            群成员：{members.map((m) => m.name).join('、')}
          </div>
        )}
        {session.messages.length === 0 && (
          <div className="px-8 py-16 text-center text-[13px] text-phone-muted">
            {session.kind === 'group' ? '打个招呼，看看谁会先接话' : '发条消息开始聊天吧'}
          </div>
        )}
        {session.messages.map((m) => (
          <Bubble key={m.id} msg={m} isGroup={session.kind === 'group'} />
        ))}
        <div ref={endRef} className="h-1" />
      </div>

      {/* iMessage 输入区：圆角胶囊输入框 + 蓝色上行箭头按钮 */}
      <div className="shrink-0 border-t border-phone-sep bg-phone-nav px-2.5 py-2">
        <div className="flex items-end gap-2">
          <div className="flex min-h-[34px] flex-1 items-center rounded-[18px] border border-phone-sep bg-phone-surface px-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // 输入法组合期不触发发送
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={busy ? '正在回复中…' : 'iMessage'}
              className="h-9 flex-1 bg-transparent text-[16px] text-phone-ink outline-none placeholder:text-phone-muted"
            />
          </div>
          {busy ? (
            <button
              type="button"
              onClick={() => stopSession(sessionId)}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-phone-blue text-primary-foreground transition active:scale-95"
              aria-label="停止生成"
            >
              <span className="block h-[11px] w-[11px] rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="发送"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-phone-blue text-primary-foreground transition active:scale-95 disabled:bg-phone-sep disabled:text-phone-muted"
            >
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ 建群向导 ============================ */

export function GroupSetupPage({
  initialMemberIds,
  onBack,
  onCreated,
}: {
  initialMemberIds: string[];
  onBack: () => void;
  onCreated: (sessionId: string) => void;
}) {
  const contacts = usePhoneStore((s) => s.contacts);
  const createGroup = usePhoneStore((s) => s.createGroup);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('👥');
  const [memberIds, setMemberIds] = useState<string[]>(initialMemberIds);
  const [showPicker, setShowPicker] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);

  const members = memberIds.map((id) => contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c);
  const canCreate = name.trim().length > 0 && memberIds.length >= 2;

  const create = () => {
    if (!canCreate) return;
    const id = createGroup(name.trim(), avatar, memberIds);
    onCreated(id);
  };

  return (
    <div className="relative flex h-full flex-col bg-phone-bg">
      <PhoneNavBar
        title="发起群聊"
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className={cn(
              'flex h-8 items-center justify-center rounded-full px-3 text-[13px] font-medium transition',
              canCreate ? 'bg-phone-blue text-primary-foreground active:scale-95' : 'bg-phone-sep text-phone-muted',
            )}
          >
            创建
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 群头像 */}
        <div className="flex flex-col items-center gap-2 py-5">
          <button
            type="button"
            onClick={() => setAvatarPicker((v) => !v)}
            className="flex h-20 w-20 items-center justify-center rounded-2xl bg-phone-grouped text-4xl shadow-sm transition active:scale-95"
            aria-label="修改群头像"
          >
            {avatar}
          </button>
          <span className="text-[11px] text-phone-muted">点击更换群头像</span>
          {avatarPicker && (
            <div className="grid w-full grid-cols-8 gap-2 px-5 pt-1">
              {['👥', '🌙', '📚', '🎧', '🪐', '🍊', '🕯️', '🎨', '🌿', '☕', '🌊', '🔭', '🎐', '🍃', '⛵', '🃏'].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAvatar(a);
                    setAvatarPicker(false);
                  }}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-lg text-xl transition',
                    a === avatar ? 'bg-phone-grouped ring-1 ring-phone-blue' : 'bg-phone-grouped active:bg-phone-sep',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 群名称 */}
        <div className="mx-3 flex items-center gap-3 border-b border-phone-sep py-3">
          <span className="w-14 shrink-0 text-[14px] text-phone-ink">群名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="给这个群起个名字"
            aria-label="群名称"
            maxLength={20}
            className="h-6 flex-1 bg-transparent text-[14px] text-phone-ink outline-none placeholder:text-phone-muted"
          />
          <span className="shrink-0 text-[11px] text-phone-muted">{name.length}/20</span>
        </div>

        {/* 成员 */}
        <div className="mx-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[14px] text-phone-ink">群成员（{memberIds.length}）</span>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-[12px] text-phone-blue"
            >
              <Plus className="h-3.5 w-3.5" /> 添加
            </button>
          </div>
          <div className="grid grid-cols-5 gap-y-3">
            {members.map((m) => (
              <div key={m.id} className="relative flex flex-col items-center gap-1">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-phone-grouped text-2xl">
                  <AvatarContent value={m.avatar ?? ''} fallback="🙂" />
                </span>
                <span className="w-full truncate text-center text-[10px] text-phone-muted">{m.name}</span>
                <button
                  type="button"
                  onClick={() => setMemberIds((ids) => ids.filter((x) => x !== m.id))}
                  aria-label={`移除 ${m.name}`}
                  className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-phone-sep text-phone-muted"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex flex-col items-center gap-1"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-phone-sep text-phone-muted">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-[10px] text-phone-muted">添加</span>
            </button>
          </div>
        </div>
      </div>

      {/* 成员选择浮层 */}
      {showPicker && (
        <div className="absolute inset-0 z-30 flex flex-col bg-phone-bg">
          <PhoneNavBar
            title="选择成员"
            onBack={() => setShowPicker(false)}
            right={
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="flex h-8 items-center rounded-full px-3 text-[13px] font-semibold text-phone-blue"
              >
                确定
              </button>
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {contacts.map((c) => {
              const on = memberIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setMemberIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                  }
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:bg-phone-grouped"
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
                      on ? 'border-phone-blue bg-phone-blue text-primary-foreground' : 'border-phone-sep text-transparent',
                    )}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-phone-grouped text-2xl">
                    <AvatarContent value={c.avatar ?? ''} fallback="🙂" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-phone-ink">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ 群信息页 ============================ */

export function GroupInfoPage({ sessionId, onBack, onEdit }: { sessionId: string; onBack: () => void; onEdit: () => void }) {
  const session = usePhoneStore((s) => s.sessions.find((x) => x.id === sessionId));
  const contacts = usePhoneStore((s) => s.contacts);
  const updateGroup = usePhoneStore((s) => s.updateGroup);
  const removeSession = usePhoneStore((s) => s.removeSession);
  const [confirming, setConfirming] = useState(false);

  if (!session) {
    return (
      <div className="flex h-full flex-col bg-phone-bg">
        <PhoneNavBar title="群聊" onBack={onBack} />
        <EmptyState icon={<Users className="h-9 w-9" />} title="群聊不存在" desc="" />
      </div>
    );
  }

  const members = session.memberIds.map((id) => contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c);

  return (
    <div className="flex h-full flex-col bg-phone-grouped">
      <PhoneNavBar title="群聊信息" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mt-3 mx-3 grid grid-cols-5 gap-y-3 rounded-xl bg-phone-surface p-3">
          {members.map((m) => (
            <div key={m.id} className="flex flex-col items-center gap-1">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-phone-grouped text-2xl">
                <AvatarContent value={m.avatar ?? ''} fallback="🙂" />
              </span>
              <span className="w-full truncate text-center text-[10px] text-phone-muted">{m.name}</span>
            </div>
          ))}
        </div>

        <div className="mx-3 mt-3 overflow-hidden rounded-xl bg-phone-surface">
          <InfoRow label="群名称" value={session.title} onClick={onEdit} />
          <InfoRow
            label="群头像"
            value={<span className="text-xl">{session.avatar || '👥'}</span>}
            onClick={onEdit}
          />
          <InfoRow label="成员数量" value={`${session.memberIds.length} 人`} />
          <InfoRow label="创建时间" value={relTime(session.messages[0]?.createdAt ?? session.lastActiveAt)} />
        </div>

        <div className="mx-3 mt-3 overflow-hidden rounded-xl bg-phone-surface">
          <button
            type="button"
            onClick={() => updateGroup(sessionId, { pinned: !session.pinned })}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] text-phone-ink transition active:bg-phone-grouped"
          >
            <span>置顶聊天</span>
            <span className={cn('text-[13px]', session.pinned ? 'text-phone-blue' : 'text-phone-muted')}>
              {session.pinned ? '已开启' : '已关闭'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mx-3 mt-3 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1.5 rounded-xl bg-phone-surface py-3 text-[15px] text-[#FF3B30] transition active:bg-phone-grouped"
        >
          <Trash2 className="h-4 w-4" /> 解散群聊
        </button>
      </div>

      {confirming && (
        <PhoneDialog title="解散群聊" text={`确定解散「${session.title}」？聊天记录将一并删除。`} danger okText="解散"
          onCancel={() => setConfirming(false)}
          onOk={() => {
            removeSession(sessionId);
            setConfirming(false);
            onBack();
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, onClick }: { label: string; value: React.ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 border-b border-phone-sep px-4 py-3 text-left last:border-b-0',
        onClick && 'transition active:bg-phone-grouped',
      )}
    >
      <span className="w-16 shrink-0 text-[14px] text-phone-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[14px] text-phone-ink">
        <span className="truncate">{value}</span>
        {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-phone-muted" />}
      </span>
    </Comp>
  );
}

/* ============================ 通用小组件 ============================ */

export function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-phone-grouped text-phone-muted">{icon}</span>
      <p className="text-[14px] font-medium text-phone-ink">{title}</p>
      {desc && <p className="text-[12px] leading-relaxed text-phone-muted">{desc}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-full bg-phone-blue px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** 通用对话框（手机内弹层） */
export function PhoneDialog({
  title,
  text,
  onCancel,
  onOk,
  okText = '确定',
  danger,
  children,
}: {
  title: string;
  text?: string;
  onCancel: () => void;
  onOk?: () => void;
  okText?: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      className="absolute inset-0 z-40 flex flex-col bg-phone-bg"
      data-testid="phone-dialog"
    >
      <PhoneNavBar title={title} onBack={onCancel} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {text && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-phone-muted">{text}</p>}
        {children}
      </div>
      <div className="shrink-0 space-y-2 border-t border-phone-sep px-4 py-3">
        {onOk && (
          <button
            type="button"
            onClick={onOk}
            data-testid="phone-dialog-ok"
            className={cn(
              'flex h-11 w-full items-center justify-center rounded-xl text-[15px] font-semibold transition active:scale-[0.99]',
              danger ? 'bg-[#FF3B30] text-white' : 'bg-phone-blue text-primary-foreground',
            )}
          >
            {okText}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          data-testid="phone-dialog-cancel"
          className="flex h-11 w-full items-center justify-center rounded-xl bg-phone-grouped text-[15px] font-medium text-phone-muted transition active:scale-[0.99]"
        >
          取消
        </button>
      </div>
    </motion.div>
  );
}

/** 加载中 */
export function Loading({ text = '加载中' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-phone-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

/** 编辑群名称/头像的迷你表单（供 GroupInfoPage 复用） */
export function GroupEditSheet({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const session = usePhoneStore((s) => s.sessions.find((x) => x.id === sessionId));
  const updateGroup = usePhoneStore((s) => s.updateGroup);
  const [name, setName] = useState(session?.title ?? '');
  const [avatar, setAvatar] = useState(session?.avatar ?? '👥');
  const [pick, setPick] = useState(false);

  if (!session) return null;

  return (
    <PhoneDialog
      title="编辑群聊"
      onCancel={onClose}
      onOk={() => {
        updateGroup(sessionId, { title: name.trim() || session.title, avatar });
        onClose();
      }}
    >
      <div className="mt-4 space-y-3 text-left">
        <button
          type="button"
          onClick={() => setPick((v) => !v)}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-phone-grouped text-3xl transition active:scale-95"
        >
          {avatar}
        </button>
        {pick && (
          <div className="grid grid-cols-8 gap-1.5">
            {['👥', '🌙', '📚', '🎧', '🪐', '🍊', '🕯️', '🎨', '🌿', '☕', '🌊', '🔭', '🎐', '🍃', '⛵', '🃏'].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAvatar(a);
                  setPick(false);
                }}
                className={cn(
                  'flex h-7 items-center justify-center rounded-md text-base',
                  a === avatar ? 'bg-phone-grouped ring-1 ring-phone-blue' : 'bg-phone-grouped',
                )}
              >
                {a}
              </button>
            ))}
          </div>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="群名称"
          className="h-9 w-full rounded-lg bg-phone-grouped px-3 text-[14px] text-phone-ink outline-none placeholder:text-phone-muted"
        />
      </div>
    </PhoneDialog>
  );
}

export { Pencil };

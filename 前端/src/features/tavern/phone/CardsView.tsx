/**
 * 酒馆「小手机」模块 —— 统一卡片区块
 *
 * 把原本分离的「角色卡」与「人设卡」合并为一个区块，
 * 内部做二级细分：全部 / 角色卡 / 人设卡 / 按标签，支持卡片预览。
 * 新建的角色卡也会同步出现在「通讯录」里。
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, MessageCircle, MoreHorizontal, Pencil, Plus, Search, Settings, UserRound, Users, Bot, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhoneStore } from './phoneStore';
import { PhoneNavBar } from './PhoneShell';
import { EmptyState, PhoneDialog } from './ChatViews';
import { AVATAR_PRESETS } from './sampleData';
import type { CardFilter, PhoneCard } from './types';

/* ---------------------------- 分类切换（二级细分） ---------------------------- */

function FilterBar({
  filter,
  onChange,
  counts,
  tags,
}: {
  filter: CardFilter;
  onChange: (f: CardFilter) => void;
  counts: { all: number; character: number; persona: number };
  tags: { tag: string; count: number }[];
}) {
  const chip = (active: boolean) =>
    cn(
      'shrink-0 rounded-full px-3 py-1 text-[12px] transition active:scale-95',
      active ? 'bg-[#007AFF]/12 font-medium text-[#007AFF] ring-1 ring-[#007AFF]/40' : 'bg-[#E9E9EB] text-[#3C3C43]',
    );

  return (
    <div className="shrink-0 bg-white px-3 pb-2.5">
      {/* 一级：类型（独立行，避免与二级标签行竞争高度） */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" className={chip(filter.type === 'all')} onClick={() => onChange({ type: 'all' })}>
          全部 {counts.all}
        </button>
        <button
          type="button"
          className={chip(filter.type === 'kind' && filter.kind === 'character')}
          onClick={() => onChange({ type: 'kind', kind: 'character' })}
        >
          角色卡 {counts.character}
        </button>
        <button
          type="button"
          className={chip(filter.type === 'kind' && filter.kind === 'persona')}
          onClick={() => onChange({ type: 'kind', kind: 'persona' })}
        >
          人设卡 {counts.persona}
        </button>
      </div>
      {/* 二级：标签（固定行高，确保不被下方卡片区裁剪） */}
      {tags.length > 0 && (
        <div className="mt-1.5 flex h-7 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              className={chip(filter.type === 'tag' && filter.tag === t.tag)}
              onClick={() => onChange({ type: 'tag', tag: t.tag })}
            >
              #{t.tag} {t.count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ 卡片 ------------------------------ */

function CardTile({ card, onOpen, onMore }: { card: PhoneCard; onOpen: () => void; onMore: () => void }) {
  const active = card.active;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-xl bg-white p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition active:scale-[0.98]',
          card.kind === 'persona' && 'ring-1 ring-inset',
        )}
        style={card.kind === 'persona' ? { borderColor: 'transparent' } : undefined}
      >
        {/* 头像 + 类型角标 */}
        <div className="flex items-start gap-2 pr-6">
          <span className="relative shrink-0">
            <span
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-xl text-2xl',
                card.kind === 'character' ? 'bg-[#eef2ff]' : 'bg-[#fff4e8]',
              )}
            >
              {card.avatar || (card.kind === 'character' ? '🤖' : '🙂')}
            </span>
            {active && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#007AFF] ring-2 ring-white">
                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
              </span>
            )}
          </span>
          <span
            className={cn(
              'flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              card.kind === 'character' ? 'bg-[#eef2ff] text-[#4c6ef5]' : 'bg-[#fff4e8] text-[#d9822b]',
            )}
          >
            {card.kind === 'character' ? <Bot className="h-2.5 w-2.5" /> : <UserRound className="h-2.5 w-2.5" />}
            {card.kind === 'character' ? '角色' : '人设'}
          </span>
        </div>

        <p className="mt-2 truncate text-[14px] font-semibold text-[#000000]">{card.name}</p>
        <p className="mt-0.5 line-clamp-2 min-h-[32px] text-[11px] leading-4 text-[#8e8e93]">
          {card.intro || card.description || '还没有简介'}
        </p>

        {card.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-black/[0.05] px-1.5 py-0.5 text-[10px] text-[#8e8e93]">
                {t}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* 更多操作：进预览层做编辑/删除/看详情 */}
      <button
        type="button"
        onClick={onMore}
        aria-label={`${card.name} 更多操作`}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-[#8e8e93] transition hover:bg-black/[0.06] active:bg-black/10"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ------------------------------ 预览层 ------------------------------ */

function CardPreview({
  card,
  onClose,
  onEdit,
  onChat,
  onSetPersona,
  onDelete,
}: {
  card: PhoneCard;
  onClose: () => void;
  onEdit: () => void;
  onChat: () => void;
  onSetPersona: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-40 flex flex-col bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '8%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '8%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className="mt-11 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className={cn(
            'flex shrink-0 flex-col items-center gap-2 px-5 pb-4 pt-6',
            card.kind === 'character'
              ? 'bg-gradient-to-b from-[#eef2ff] to-white'
              : 'bg-gradient-to-b from-[#fff4e8] to-white',
          )}
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-5xl shadow-sm">
            {card.avatar || (card.kind === 'character' ? '🤖' : '🙂')}
          </span>
          <p className="text-[17px] font-semibold text-[#000000]">{card.name}</p>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              card.kind === 'character' ? 'bg-[#eef2ff] text-[#4c6ef5]' : 'bg-[#fff4e8] text-[#d9822b]',
            )}
          >
            {card.kind === 'character' ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
            {card.kind === 'character' ? '角色卡' : '人设卡'}
          </span>
          {card.tags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1">
              {card.tags.map((t) => (
                <span key={t} className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] text-[#6b7280]">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 详情 */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
          <Detail label="简介" value={card.intro || card.description} />
          {card.kind === 'character' && (
            <>
              <Detail label="性格设定" value={card.personality} />
              <Detail label="场景" value={card.scenario} />
              <Detail label="开场白" value={card.firstMessage} />
              <Detail label="附加指令" value={card.systemPrompt} />
            </>
          )}
          {card.kind === 'persona' && <Detail label="人设描述" value={card.description} />}
        </div>

        {/* 操作 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-4 py-2.5">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#E9E9EB] px-3 text-[13px] text-[#3C3C43] transition active:scale-95"
          >
            <Pencil className="h-3.5 w-3.5" /> 编辑
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#E9E9EB] px-3 text-[13px] text-[#FF3B30] transition active:scale-95"
          >
            <X className="h-3.5 w-3.5" /> 删除
          </button>
          <div className="flex-1" />
          {card.kind === 'character' ? (
            <button
              type="button"
              onClick={onChat}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#007AFF] px-4 text-[13px] font-medium text-white transition active:scale-95"
            >
              <MessageCircle className="h-4 w-4" /> 开始聊天
            </button>
          ) : (
            <button
              type="button"
              onClick={onSetPersona}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition active:scale-95',
                card.active ? 'bg-[#007AFF]/15 text-[#007AFF]' : 'bg-[#007AFF] text-white',
              )}
            >
              <Check className="h-4 w-4" /> {card.active ? '使用中' : '设为我的'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">{label}</p>
      <p className="whitespace-pre-wrap rounded-lg bg-[#F2F2F7] px-3 py-2 text-[13px] leading-6 text-[#3C3C43]">
        {value}
      </p>
    </div>
  );
}

/* ------------------------------ 编辑表单 ------------------------------ */

function CardEditor({ initial, onClose }: { initial: PhoneCard | null; onClose: () => void }) {
  const addCard = usePhoneStore((s) => s.addCard);
  const updateCard = usePhoneStore((s) => s.updateCard);
  const [kind, setKind] = useState<'character' | 'persona'>(initial?.kind ?? 'character');
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    avatar: initial?.avatar ?? '',
    tags: (initial?.tags ?? []).join('，'),
    intro: initial?.intro ?? '',
    personality: initial?.personality ?? '',
    scenario: initial?.scenario ?? '',
    firstMessage: initial?.firstMessage ?? '',
    systemPrompt: initial?.systemPrompt ?? '',
  });
  const [pick, setPick] = useState(false);

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const payload = {
      kind,
      name,
      avatar: form.avatar.trim() || null,
      tags: form.tags
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean),
      intro: form.intro || null,
      description: form.intro || null,
      personality: kind === 'character' ? form.personality || null : null,
      scenario: kind === 'character' ? form.scenario || null : null,
      firstMessage: kind === 'character' ? form.firstMessage || null : null,
      systemPrompt: kind === 'character' ? form.systemPrompt || null : null,
    };
    if (initial) updateCard(initial.id, payload);
    else addCard(payload as Omit<PhoneCard, 'id'>);
    onClose();
  };

  const field = 'h-9 w-full rounded-lg bg-[#E9E9EB] px-3 text-[13px] text-[#000000] outline-none placeholder:text-[#8e8e93]';

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-white">
      <div className="flex h-11 shrink-0 items-center justify-between px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="取消"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#3C3C43] active:bg-black/10"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold text-[#000000]">{initial ? '编辑卡片' : '新建卡片'}</span>
        <button
          type="button"
          disabled={!form.name.trim()}
          onClick={save}
          className={cn(
            'flex h-8 items-center rounded-full px-3 text-[13px] font-medium transition',
            form.name.trim() ? 'bg-[#007AFF] text-white active:scale-95' : 'bg-[#E9E9EB] text-[#8e8e93]',
          )}
        >
          保存
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        {/* 类型切换 */}
        <div className="flex gap-2">
          {(
            [
              { k: 'character' as const, label: '角色卡', icon: Bot, desc: 'AI 扮演' },
              { k: 'persona' as const, label: '人设卡', icon: UserRound, desc: '我扮演' },
            ]
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setKind(o.k)}
              className={cn(
                'flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition',
                kind === o.k ? 'border-[#007AFF] bg-[#007AFF]/8' : 'border-black/[0.08] bg-white',
              )}
            >
              <o.icon className={cn('h-4 w-4', kind === o.k ? 'text-[#007AFF]' : 'text-[#8e8e93]')} />
              <span>
                <span className={cn('block text-[13px] font-medium', kind === o.k ? 'text-[#007AFF]' : 'text-[#000000]')}>
                  {o.label}
                </span>
                <span className="block text-[10px] text-[#8e8e93]">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {/* 头像 */}
        <div>
          <label className="mb-1 block text-[11px] text-[#8e8e93]">头像</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPick((v) => !v)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E9E9EB] text-2xl transition active:scale-95"
            >
              {form.avatar || '＋'}
            </button>
            <input
              value={form.avatar}
              onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))}
              placeholder="也可直接粘贴 emoji"
              className={field}
            />
          </div>
          {pick && (
            <div className="mt-2 grid grid-cols-10 gap-1.5">
              {AVATAR_PRESETS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, avatar: a }));
                    setPick(false);
                  }}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-lg text-lg transition',
                    a === form.avatar ? 'bg-[#007AFF]/15 ring-1 ring-[#007AFF]' : 'bg-[#F2F2F7] active:bg-black/[0.06]',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-[#8e8e93]">名字</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="如 苏晚晴"
            className={field}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-[#8e8e93]">标签（逗号分隔）</label>
          <input
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="温柔，学姐，深夜"
            className={field}
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-[#8e8e93]">一句话简介</label>
          <input
            value={form.intro}
            onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
            placeholder={kind === 'character' ? '温柔体贴的学姐…' : '一个刚下班的普通人…'}
            className={field}
          />
        </div>

        {kind === 'character' && (
          <>
            <Area
              label="性格 / 详细设定"
              value={form.personality}
              onChange={(v) => setForm((f) => ({ ...f, personality: v }))}
              placeholder="性格、背景、说话方式…"
            />
            <Area
              label="场景"
              value={form.scenario}
              onChange={(v) => setForm((f) => ({ ...f, scenario: v }))}
              placeholder="当前发生的场景…"
            />
            <Area
              label="开场白"
              value={form.firstMessage}
              onChange={(v) => setForm((f) => ({ ...f, firstMessage: v }))}
              placeholder="进入对话时角色先说的话…"
            />
            <Area
              label="附加指令（可选）"
              value={form.systemPrompt}
              onChange={(v) => setForm((f) => ({ ...f, systemPrompt: v }))}
              placeholder="额外的规则…"
            />
          </>
        )}
      </div>
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-[#8e8e93]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none rounded-lg bg-[#E9E9EB] px-3 py-2 text-[13px] leading-6 text-[#000000] outline-none placeholder:text-[#8e8e93]"
      />
    </div>
  );
}

/* ============================== 卡片页 ============================== */

export function CardsPage({
  onCreateChat,
  onOpenConfig,
}: {
  onCreateChat: (contactId: string) => void;
  /** 进入配置台：外层标题栏收起后，入口挪到这里，避免功能失联 */
  onOpenConfig?: () => void;
}) {
  const cards = usePhoneStore((s) => s.cards);
  const contacts = usePhoneStore((s) => s.contacts);
  const activePersonaId = usePhoneStore((s) => s.activePersonaId);
  const setActivePersona = usePhoneStore((s) => s.setActivePersona);
  const removeCard = usePhoneStore((s) => s.removeCard);
  const [filter, setFilter] = useState<CardFilter>({ type: 'all' });
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<PhoneCard | 'new' | null>(null);
  const [confirmDel, setConfirmDel] = useState<PhoneCard | null>(null);

  // 把 activePersona 状态叠加到卡片上
  const withActive = useMemo(
    () => cards.map((c) => (c.kind === 'persona' ? { ...c, active: c.id === activePersonaId } : c)),
    [cards, activePersonaId],
  );

  const counts = useMemo(
    () => ({
      all: withActive.length,
      character: withActive.filter((c) => c.kind === 'character').length,
      persona: withActive.filter((c) => c.kind === 'persona').length,
    }),
    [withActive],
  );

  const tags = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of withActive) for (const t of c.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [withActive]);

  const filtered = useMemo(() => {
    const kw = query.trim().toLowerCase();
    return withActive.filter((c) => {
      if (kw) {
        const hay = `${c.name} ${c.intro ?? ''} ${c.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (filter.type === 'kind') return c.kind === filter.kind;
      if (filter.type === 'tag') return c.tags.includes(filter.tag);
      return true;
    });
  }, [withActive, filter, query]);

  const previewCard = withActive.find((c) => c.id === preview) ?? null;

  return (
    <div className="relative flex h-full flex-col bg-white">
      <PhoneNavBar
        title="卡片库"
        right={
          <div className="flex items-center gap-0.5">
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                aria-label="角色卡设置"
                title="角色卡 / 世界书 / 人设卡"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#3C3C43] active:bg-black/10"
              >
                <Settings className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing('new')}
              aria-label="新建卡片"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#000000] active:bg-black/10"
            >
              <Plus className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        }
      />
      <div className="shrink-0 px-3 pb-2">
        <div className="flex h-8 items-center gap-1.5 rounded-lg bg-[#E9E9EB] px-2.5">
          <Search className="h-4 w-4 shrink-0 text-[#8e8e93]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索卡片"
            className="h-full flex-1 bg-transparent text-[14px] text-[#000000] outline-none placeholder:text-[#8e8e93]"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清空" className="text-[#8e8e93]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <FilterBar filter={filter} onChange={setFilter} counts={counts} tags={tags} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-9 w-9" />}
            title={query || filter.type !== 'all' ? '没有匹配的卡片' : '还没有卡片'}
            desc={query || filter.type !== 'all' ? '换个分类或关键词试试' : '新建一张角色卡或人设卡吧'}
            action={!query && filter.type === 'all' ? { label: '新建卡片', onClick: () => setEditing('new') } : undefined}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                onOpen={() => {
                  // 角色卡：点卡片直接进聊天（chatbox）；人设卡：进预览层「设为我的」
                  if (c.kind === 'character') {
                    const contact = contacts.find((ct) => ct.characterId === c.id);
                    if (contact) onCreateChat(contact.id);
                    else setPreview(c.id);
                  } else {
                    setPreview(c.id);
                  }
                }}
                onMore={() => setPreview(c.id)}
              />
            ))}
          </div>
        )}
        <div className="h-4" />
      </div>

      <AnimatePresence>
        {previewCard && (
          <CardPreview
            key={previewCard.id}
            card={previewCard}
            onClose={() => setPreview(null)}
            onEdit={() => {
              setEditing(previewCard);
              setPreview(null);
            }}
            onDelete={() => {
              setConfirmDel(previewCard);
              setPreview(null);
            }}
            onSetPersona={() => setActivePersona(previewCard.active ? null : previewCard.id)}
            onChat={() => {
              const contact = contacts.find((c) => c.characterId === previewCard.id);
              if (contact) onCreateChat(contact.id);
              setPreview(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <CardEditor
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      {confirmDel && (
        <PhoneDialog
          title="删除卡片"
          text={`确定删除「${confirmDel.name}」？该卡片对应的联系人与群成员也会一并移除。`}
          danger
          okText="删除"
          onCancel={() => setConfirmDel(null)}
          onOk={() => {
            removeCard(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}

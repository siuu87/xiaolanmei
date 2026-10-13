/**
 * 酒馆「小手机」模块 —— 统一卡片区块
 *
 * 把原本分离的「角色卡」与「人设卡」合并为一个区块，
 * 内部做二级细分：全部 / 角色卡 / 人设卡 / 按标签，支持卡片预览。
 * 新建的角色卡也会同步出现在「通讯录」里。
 */
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ImagePlus,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  UserRound,
  Users,
  Bot,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhoneStore } from './phoneStore';
import { PhoneNavBar } from './PhoneShell';
import { EmptyState, PhoneDialog } from './ChatViews';
import { AVATAR_PRESETS } from './sampleData';
import { AvatarContent } from '@/components/AvatarContent';
import { uploadImage } from '@/lib/api/attachments';
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
                'flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-2xl',
                card.kind === 'character' ? 'bg-[#eef2ff]' : 'bg-[#fff4e8]',
              )}
            >
              <AvatarContent value={card.avatar ?? ''} fallback={card.kind === 'character' ? '🤖' : '🙂'} />
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
          <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white text-5xl shadow-sm">
            <AvatarContent value={card.avatar ?? ''} fallback={card.kind === 'character' ? '🤖' : '🙂'} />
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
  /** 开场白默认收起：没填过时先显示「暂无开场白 + 添加」按钮（对齐参考图二） */
  const [showOpening, setShowOpening] = useState(!!(initial?.firstMessage ?? '').trim());
  /** 参考图里没有的旧字段（标签/简介/场景/附加指令）收进这里，功能不丢 */
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 清掉，否则连着选同一张不会再触发 change
    if (!file) return;
    setUploading(true);
    setUploadErr('');
    try {
      const up = await uploadImage(file);
      setForm((f) => ({ ...f, avatar: up.url }));
    } catch (ex) {
      setUploadErr((ex as Error).message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

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

  const isChar = kind === 'character';
  const hasImageAvatar = /^(\/|https?:)/.test(form.avatar.trim());
  const title = initial
    ? isChar
      ? '编辑人物'
      : '编辑面具'
    : isChar
      ? '新建人物'
      : '新建面具';

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-white" data-testid="card-editor">
      {/* 顶栏：< 返回 + 居中标题（对齐参考图二） */}
      <div className="flex h-11 shrink-0 items-center px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回"
          data-testid="card-editor-back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#3C3C43] active:bg-black/10"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <span data-testid="card-editor-title" className="flex-1 text-center text-[17px] font-semibold text-[#000000]">
          {title}
        </span>
        <span className="h-8 w-8 shrink-0" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        {/* 类型切换（新建时选角色卡 / 面具） */}
        {!initial && (
          <div className="mb-3 flex gap-2">
            {(
              [
                { k: 'character' as const, label: '角色卡', icon: Bot, desc: 'AI 扮演' },
                { k: 'persona' as const, label: '面具', icon: UserRound, desc: '我扮演' },
              ]
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setKind(o.k)}
                data-testid={`card-editor-kind-${o.k}`}
                aria-pressed={kind === o.k}
                className={cn(
                  'flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition',
                  kind === o.k ? 'border-[#007AFF] bg-[#007AFF]/8' : 'border-black/[0.08] bg-white',
                )}
              >
                <o.icon className={cn('h-4 w-4', kind === o.k ? 'text-[#007AFF]' : 'text-[#8e8e93]')} />
                <span>
                  <span
                    className={cn('block text-[13px] font-medium', kind === o.k ? 'text-[#007AFF]' : 'text-[#000000]')}
                  >
                    {o.label}
                  </span>
                  <span className="block text-[10px] text-[#8e8e93]">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ---- 头像区块（参考图里是个描边卡片） ---- */}
        <div className="rounded-2xl border border-black/[0.08] px-4 py-4">
          <p className="text-center text-[13px] font-medium text-[#000000]">头像</p>

          <div className="mt-3 flex justify-center">
            <span
              data-testid="card-editor-preview"
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#F2F2F7] text-[26px] font-medium text-[#8FA3D9]"
            >
              {hasImageAvatar ? (
                <AvatarContent value={form.avatar} fallback={isChar ? '🤖' : '🙂'} />
              ) : (
                form.avatar || (form.name.trim() ? form.name.trim().slice(0, 1) : isChar ? 'A' : '我')
              )}
            </span>
          </div>

          <div className="mt-3.5 flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              data-testid="card-editor-upload"
              className="flex w-full max-w-[240px] items-center justify-center gap-2 rounded-full border border-black/[0.1] bg-white py-2.5 text-[13px] text-[#000000] transition active:scale-[0.98] disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {uploading ? '上传中…' : '上传头像'}
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={onPickFile}
            data-testid="card-editor-file"
            className="hidden"
          />

          {uploadErr && (
            <p data-testid="card-editor-upload-error" className="mt-2 text-center text-[11px] text-[#FF3B30]">
              {uploadErr}
            </p>
          )}

          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => setPick((v) => !v)}
              aria-expanded={pick}
              data-testid="card-editor-emoji-toggle"
              className="text-[11px] text-[#8e8e93] underline decoration-dotted underline-offset-2"
            >
              或用 emoji
            </button>
          </div>

          {pick && (
            <div className="mt-2.5 grid grid-cols-10 gap-1.5" data-testid="card-editor-emoji-grid">
              {AVATAR_PRESETS.map((a) => (
                <button
                  key={a}
                  type="button"
                  data-testid={`card-avatar-option-${a}`}
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

        {/* ---- 字段：角色卡走参考图二，面具走参考图一 ---- */}
        {isChar ? (
          <>
            <FieldLabel text="姓名" />
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="输入姓名"
              data-testid="card-editor-name"
              className={inputCls}
            />

            <FieldLabel text="人设" />
            <textarea
              value={form.personality}
              onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
              rows={5}
              placeholder="输入人物设定"
              data-testid="card-editor-personality"
              className={cn(inputCls, 'resize-y leading-6')}
            />

            {/* 开场白（可选） */}
            <p className="mt-4 text-[13px] font-medium text-[#000000]">
              开场白<span className="text-[#8e8e93]">（可选）</span>
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[#8e8e93]">
              创建对话时可选择使用开场白，角色会按顺序发送每条消息
            </p>
            {showOpening ? (
              <textarea
                value={form.firstMessage}
                onChange={(e) => setForm((f) => ({ ...f, firstMessage: e.target.value }))}
                rows={4}
                autoFocus
                placeholder="进入对话时角色先说的话…"
                data-testid="card-editor-opening"
                className={cn(inputCls, 'mt-2 resize-y leading-6')}
              />
            ) : (
              <>
                <p className="mt-3 text-center text-[12px] text-[#8e8e93]">暂无开场白，点击下方按钮添加</p>
                <button
                  type="button"
                  onClick={() => setShowOpening(true)}
                  data-testid="card-editor-opening-add"
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#007AFF]/45 bg-[#007AFF]/[0.06] py-2.5 text-[13px] font-medium text-[#007AFF] transition active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" /> 添加开场白
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <FieldLabel text="我的名称" />
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例如：小明、学生、工作者"
              data-testid="card-editor-name"
              className={inputCls}
            />

            <FieldLabel text="我的描述" />
            <textarea
              value={form.intro}
              onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
              rows={5}
              placeholder="介绍一下自己…"
              data-testid="card-editor-desc"
              className={cn(inputCls, 'resize-y leading-6')}
            />
          </>
        )}

        {/* 参考图里没有、但原来就有的字段：收进折叠，能力不丢 */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          data-testid="card-editor-more"
          className="mt-5 flex w-full items-center justify-center gap-1 text-[12px] text-[#8e8e93]"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')} />
          更多设定（可选）
        </button>

        {moreOpen && (
          <div className="mt-2 space-y-3 rounded-2xl border border-black/[0.08] px-3.5 py-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] text-[#8e8e93]">标签（逗号分隔）</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder={isChar ? '温柔，学姐，深夜' : '我，普通人'}
                className={inputCls}
              />
            </div>

            {isChar && (
              <>
                <div>
                  <label className="mb-1.5 block text-[12px] text-[#8e8e93]">一句话简介</label>
                  <input
                    value={form.intro}
                    onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
                    placeholder="温柔体贴的学姐…"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] text-[#8e8e93]">场景</label>
                  <textarea
                    value={form.scenario}
                    onChange={(e) => setForm((f) => ({ ...f, scenario: e.target.value }))}
                    rows={2}
                    placeholder="当前发生的场景…"
                    className={cn(inputCls, 'resize-y leading-6')}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] text-[#8e8e93]">附加指令</label>
                  <textarea
                    value={form.systemPrompt}
                    onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                    rows={2}
                    placeholder="额外的规则…"
                    className={cn(inputCls, 'resize-y leading-6')}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部保存（对齐参考图二的大按钮） */}
      <div className="shrink-0 border-t border-black/[0.06] px-4 py-3">
        <button
          type="button"
          disabled={!form.name.trim()}
          onClick={save}
          data-testid="card-editor-save"
          className={cn(
            'w-full rounded-2xl py-3 text-[15px] font-medium transition',
            form.name.trim() ? 'bg-[#007AFF] text-white active:scale-[0.99]' : 'bg-[#E9E9EB] text-[#8e8e93]',
          )}
        >
          保存
        </button>
      </div>
    </div>
  );
}

/** 参考图的输入框：白底 + 浅灰描边 + 圆角（小手机整体就是浅色 iOS 风） */
const inputCls =
  'w-full rounded-[10px] border border-black/[0.12] bg-white px-3 py-2.5 text-[14px] leading-5 text-[#000000] outline-none placeholder:text-[#8e8e93] focus:border-[#007AFF]/60';

function FieldLabel({ text }: { text: string }) {
  return <p className="mt-4 mb-1.5 text-[13px] font-medium text-[#000000]">{text}</p>;
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

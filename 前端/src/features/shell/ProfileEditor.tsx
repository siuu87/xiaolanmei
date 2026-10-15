/**
 * 人设编辑浮层：点抽屉「纪念日块」上的头像打开。
 *
 * 两套表单，字段按参考图来：
 * - 「我」（avatar-me）→ 头像 + 上传头像、我的名称、我的描述
 * - 「他」（avatar-partner）→ 头像 + 上传头像、姓名、人设、
 *   MiniMax 语音 ID、语音语速、语言设置（**不要开场白**，按需求去掉）
 *
 * **2026-10-15：把工具箱的「角色」搬进来了。** 工具箱里那份 `PromptsPanel`
 * （注入对话 system 的人设模块）原本挂在工具箱里，跟「改角色」这件事分在两个地方。
 * 现在它作为「他」底下的第二个页签「角色设定」，跟姓名/人设/语音放在一起——
 * 点他的头像就能把「这个人是谁」一次改完。
 * 我（avatar-me）不显示这个页签：那份提示词是全局的、不属于「我」的资料。
 *
 * 配色注意：浮层是硬编码深色（`#0f1424`），而 `PromptsPanel` 是按浅色界面写的
 * （它原来待的工具箱是 `bg-background`/`bg-card`）。所以「角色设定」页签的滚动区
 * 换成统一的浅色页底 `bg-page-bg` —— 深色外壳 + 浅色内容，保持原组件一行不改。
 *
 * 层级：抽屉是 z-[1200]，这里必须 portal 到 body 并压到它上面，否则被抽屉吃掉。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Check, ImagePlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { AvatarContent } from '@/components/AvatarContent';
import { uploadImage } from '@/lib/api/attachments';
import { PromptsPanel } from '@/features/prompts/PromptsPanel';

export type ProfileTarget = 'me' | 'partner';

/** 「他」那页的两个页签 */
type SheetTab = 'profile' | 'prompts';
const PARTNER_TABS: { key: SheetTab; label: string }[] = [
  { key: 'profile', label: '资料' },
  { key: 'prompts', label: '角色设定' },
];

/** emoji 快选：收在「或挑一个 emoji」后面，默认不展开，免得抢了参考图的主视觉 */
const EMOJI_OPTIONS: string[] = [
  '🫐', '🐰', '🐻', '🐱', '🐶', '🦊', '🐺', '🐼',
  '🐨', '🐯', '🦁', '🐹', '🍓', '🍑', '🌸', '🌙',
  '⭐', '☀️', '🍀', '🎧', '📖', '☕', '🎂', '💌',
];

const DEFAULT_AVATAR: Record<ProfileTarget, string> = { me: '🫐', partner: '🐰' };
/** 没传头像时圆形里显示的占位字 */
const PLACEHOLDER_CHAR: Record<ProfileTarget, string> = { me: '我', partner: '他' };

/** MiniMax 支持的语言（'' = 不设置，走默认中文普通话） */
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

const inputCls =
  'w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[14px] text-[#e8ecf6] outline-none placeholder:text-[#6b7488] focus:border-[#7aa2ff]/60';

export function ProfileEditor({
  target,
  onClose,
}: {
  target: ProfileTarget | null;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {/* key 换目标时重挂载，草稿状态跟着重置，不会串上一次没保存的内容 */}
      {target && <Sheet key={target} target={target} onClose={onClose} />}
    </AnimatePresence>,
    document.body,
  );
}

function Sheet({ target, onClose }: { target: ProfileTarget; onClose: () => void }) {
  const isMe = target === 'me';

  const store = useProfileStore();

  const [avatar, setAvatar] = useState(isMe ? store.avatar : store.partnerAvatar);
  const [name, setName] = useState(isMe ? store.name : store.partnerName);
  const [text, setText] = useState(isMe ? store.description : store.persona);
  const [voiceId, setVoiceId] = useState(store.voiceId);
  const [speed, setSpeed] = useState(store.voiceSpeed);
  const [lang, setLang] = useState(store.voiceLanguage);
  /** 「我」没有第二个页签，所以这个值对它永远用不上 */
  const [tab, setTab] = useState<SheetTab>('profile');

  useEffect(() => {
    // 用 capture 阶段抢在抽屉之前：抽屉也在 window 上听 Esc，
    // 不拦一下的话按一次 Esc 会把浮层和抽屉一起关掉。
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const save = () => {
    const nextAvatar = avatar.trim() || DEFAULT_AVATAR[target];
    if (isMe) {
      store.setAvatar(nextAvatar);
      store.setName(name.trim());
      store.setDescription(text.trim());
    } else {
      store.setPartnerAvatar(nextAvatar);
      store.setPartnerName(name.trim());
      store.setPersona(text.trim());
      store.setVoiceId(voiceId.trim());
      store.setVoiceSpeed(speed);
      store.setVoiceLanguage(lang);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1450] flex flex-col bg-[#0f1424]" data-testid="profile-editor">
      <motion.div
        role="dialog"
        aria-label={isMe ? '我的资料' : '他的资料'}
        className="flex h-full w-full flex-col overflow-hidden bg-[#0f1424]"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      >
        {/* 顶栏：返回 + 标题（参考图二） */}
        <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.08] px-2.5 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            data-testid="profile-editor-back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a8b0c4] transition hover:bg-white/[0.08]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p
            data-testid="profile-editor-title"
            className="flex-1 text-center text-[15px] font-semibold text-[#e8ecf6]"
          >
            {tab === 'prompts' ? '角色设定' : isMe ? '我的资料' : '他的资料'}
          </p>
          <span className="h-8 w-8 shrink-0" aria-hidden />
        </div>

        {/* 「他」多一个页签：资料 / 角色设定。我这边不显示（那份提示词是全局的） */}
        {!isMe && (
          <div className="flex shrink-0 gap-1.5 px-3 pb-2.5" data-testid="profile-editor-tabs">
            {PARTNER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                data-testid={`profile-editor-tab-${t.key}`}
                className={cn(
                  'flex-1 rounded-full py-1.5 text-[13px] transition',
                  tab === t.key
                    ? 'bg-white/[0.14] font-medium text-[#e8ecf6]'
                    : 'text-[#8b93a7] hover:bg-white/[0.07] hover:text-[#c3cade]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'prompts' ? (
          <div
            data-testid="profile-scroll"
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain bg-page-bg"
          >
            <PromptsTab />
          </div>
        ) : (
        <div
          data-testid="profile-scroll"
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {/* ---- 头像区块 ---- */}
          <AvatarBlock target={target} value={avatar} onChange={setAvatar} />

          {/* ---- 我的：名称 + 描述 ---- */}
          {isMe ? (
            <>
              <Field label="我的名称" htmlFor="pe-name">
                <input
                  id="pe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：小明、学生、工作者"
                  data-testid="profile-editor-name"
                  className={inputCls}
                />
              </Field>
              <Field label="我的描述" htmlFor="pe-desc">
                <textarea
                  id="pe-desc"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  placeholder="介绍一下自己…"
                  data-testid="profile-editor-desc"
                  className={cn(inputCls, 'resize-y leading-6')}
                />
              </Field>
            </>
          ) : (
            /* ---- 他：姓名 + 人设 + 语音（开场白按要求不做） ---- */
            <>
              <Field label="姓名" htmlFor="pe-pname">
                <input
                  id="pe-pname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入姓名"
                  data-testid="profile-editor-name"
                  className={inputCls}
                />
              </Field>

              <Field label="人设" htmlFor="pe-persona">
                <textarea
                  id="pe-persona"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  placeholder="输入人物设定"
                  data-testid="profile-editor-persona"
                  className={cn(inputCls, 'resize-y leading-6')}
                />
              </Field>

              <Field
                label="MiniMax 语音 ID（可选）"
                hint="填写 Minimax 克隆语音的 voice_id，用于语音条、通话、陪伴模式"
                htmlFor="pe-voice"
              >
                <input
                  id="pe-voice"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  placeholder="输入 MiniMax voice_id（例如：male-qn-qingse）"
                  data-testid="profile-editor-voice-id"
                  className={inputCls}
                />
                <p className="mt-1.5 text-[10px] text-[#6b7488]">
                  💡 在 MiniMax 平台克隆声音后获取 voice_id
                </p>
              </Field>

              <Field label="语音语速" htmlFor="pe-speed">
                <div className="flex items-center gap-3" data-testid="profile-editor-speed-row">
                  <input
                    id="pe-speed"
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    data-testid="profile-editor-speed"
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-[#7aa2ff]"
                  />
                  <span
                    data-testid="profile-editor-speed-value"
                    className="w-11 shrink-0 text-right text-[12px] tabular-nums text-[#c3cade]"
                  >
                    {speed.toFixed(1)}x
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] text-[#6b7488]">调整角色语音播放的语速（0.5 倍 - 2.0 倍）</p>
              </Field>

              <Field
                label="语言设置（可选）"
                hint="默认使用中文（普通话），如需调用其他语言，请选择对应语言以确保正确发音"
                htmlFor="pe-lang"
              >
                <select
                  id="pe-lang"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  data-testid="profile-editor-language"
                  className={cn(inputCls, 'appearance-none')}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value} className="bg-[#151b2b]">
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        )}

        {tab === 'prompts' ? (
          /* 角色设定是即时保存的，底部不给「保存」按钮，免得误以为要点了才算 */
          <div className="flex shrink-0 items-center justify-center border-t border-white/[0.08] px-4 py-3">
            <p className="text-[11px] text-[#6b7488]">角色设定改完立即生效，无需保存</p>
          </div>
        ) : (
          <div className="flex shrink-0 items-center border-t border-white/[0.08] px-4 py-3">
            <button
              type="button"
              onClick={save}
              data-testid="profile-editor-save"
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#7aa2ff] py-3 text-[15px] font-medium text-[#0b1020] transition hover:bg-[#8fb1ff]"
            >
              <Check className="h-4 w-4" /> 保存
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ---------------------------- 「角色设定」页签 ---------------------------- */

/**
 * 就是把工具箱里那份 `PromptsPanel` 搬过来，前面加一句说明。
 * 面板自身按浅色界面写，所以外层是浅色页底（见 Sheet 里的 bg-page-bg）。
 */
function PromptsTab() {
  return (
    <div className="px-3 py-4" data-testid="profile-editor-prompts">
      <p className="mb-3 rounded-xl border bg-card px-3 py-2 text-[11px] leading-4 text-muted-foreground">
        这些模块按顺序注入每次对话的 system 提示词，改完立即生效，不用点保存。
      </p>
      <PromptsPanel />
    </div>
  );
}

/* ---------------------------- 头像区块（两套表单共用） ---------------------------- */

function AvatarBlock({
  target,
  value,
  onChange,
}: {
  target: ProfileTarget;
  value: string;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 清掉，否则连着选同一张不会再触发 change
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const up = await uploadImage(file);
      onChange(up.url);
    } catch (ex) {
      setErr((ex as Error).message || '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const hasImage = /^(\/|https?:)/.test(value.trim());

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
      <p className="text-center text-[13px] font-medium text-[#c3cade]">头像</p>

      <div className="mt-3 flex justify-center">
        <span
          data-testid="profile-editor-preview"
          className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#3b4a7a] to-[#5b3f6e] text-[34px]"
        >
          {hasImage ? (
            <AvatarContent value={value} fallback={DEFAULT_AVATAR[target]} />
          ) : (
            <span className="leading-none text-[#dfe4ef]">
              {(value || '').trim() || PLACEHOLDER_CHAR[target]}
            </span>
          )}
        </span>
      </div>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          data-testid="profile-editor-upload"
          className="flex w-full max-w-[260px] items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.05] py-2.5 text-[13px] text-[#dfe4ef] transition hover:bg-white/[0.1] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? '上传中…' : '上传头像'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={pick}
        data-testid="profile-editor-file"
        className="hidden"
      />

      {err && (
        <p data-testid="profile-editor-upload-error" className="mt-2 text-center text-[11px] text-rose-400">
          {err}
        </p>
      )}

      {/* emoji 快选：参考图里没有，但默认头像本来就是 emoji，全去掉就没法改了 */}
      <div className="mt-2.5 text-center">
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-expanded={emojiOpen}
          data-testid="profile-editor-emoji-toggle"
          className="text-[11px] text-[#6b7488] underline decoration-dotted underline-offset-2 transition hover:text-[#a8b0c4]"
        >
          或挑一个 emoji
        </button>
      </div>

      {emojiOpen && (
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5" data-testid="profile-editor-emoji-grid">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              data-testid={`avatar-option-${e}`}
              aria-label={`头像 ${e}`}
              aria-pressed={value === e}
              onClick={() => onChange(e)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full text-[18px] transition',
                value === e ? 'bg-white/[0.16] ring-2 ring-[#7aa2ff]' : 'bg-white/[0.05] hover:bg-white/[0.11]',
              )}
            >
              {e}
            </button>
          ))}
          {value && !EMOJI_OPTIONS.includes(value) && (
            <button
              type="button"
              onClick={() => onChange('')}
              data-testid="profile-editor-clear"
              className="flex h-9 items-center rounded-full bg-white/[0.05] px-3 text-[11px] text-[#8b93a7] transition hover:bg-white/[0.11]"
            >
              清除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- 字段外壳 ---------------------------- */

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[#c3cade]">
        {label}
      </label>
      {hint && <p className="mt-1 text-[10px] leading-4 text-[#6b7488]">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

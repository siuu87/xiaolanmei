/**
 * 人设编辑浮层：点抽屉「纪念日块」上的头像打开。
 *
 * 两套内容：
 * - 「我」（avatar-me）→ 头像 + 上传头像、我的名称、我的描述
 * - 「他」（avatar-partner）→ 头像 + 上传头像，以及**四个折叠页**：
 *   1. 角色设定：姓名 / 人设 + 内置人设模块一、三、五
 *   2. 语音与语言：MiniMax 语音 ID、语速、语言设置
 *   3. 语言风格与输出：语言风格条目（可 + 新增、选前/中/后插入）+ 内置模块二
 *   4. 备忘录：现有备忘录（AI 也会写）+ 内置模块四
 *
 * **2026-10-15 的两次改动**：先把工具箱的「角色」搬进来做成「资料 / 角色设定」页签，
 * 随后按需求去掉页签、只留资料页，再把内容按主题折成上面四个折叠页 ——
 * 所以这里**不再有页签**，页面标题恒为「我的资料 / 他的资料」。
 *
 * 配色：浮层外壳与内嵌面板（PromptsPanel / StyleRulesPanel / MemoSection）都走主题 token，
 * 折叠页正文不再局部降档（原先的 `dark` 类已去掉），于是整个编辑器跟随全局深浅主题。
 * 注意：MemoDetailDialog 是 portal 到 body 的，同样跟随全局主题。
 *
 * 层级：抽屉是 z-[1200]，这里必须 portal 到 body 并压到它上面，否则被抽屉吃掉。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronDown, Check, ImagePlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { updateSettings } from '@/lib/api/settings';
import { AvatarContent } from '@/components/AvatarContent';
import { uploadImage } from '@/lib/api/attachments';
import { PromptsPanel } from '@/features/prompts/PromptsPanel';
import { StyleRulesPanel } from '@/features/prompts/StyleRulesPanel';
import { MemoSection } from '@/features/memo/MemoSection';

export type ProfileTarget = 'me' | 'partner';

/** 内置人设模块按主题拆到哪一页（名字前缀匹配，见 persona/modules.ts） */
const MODULES_PROFILE = ['模块一', '模块三', '模块五'];
const MODULES_STYLE = ['模块二'];
const MODULES_MEMO = ['模块四'];

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
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60';

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
  /** 备注：就是他/她在聊天里显示的名字（2026-10-19 新加的字段，存在后端 settings） */
  const [remark, setRemark] = useState(store.partnerRemark);
  const [text, setText] = useState(isMe ? store.description : store.persona);
  const [voiceId, setVoiceId] = useState(store.voiceId);
  const [speed, setSpeed] = useState(store.voiceSpeed);
  const [lang, setLang] = useState(store.voiceLanguage);

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
      // 备注同时写后端：AI 改过 / 别处打开时都以服务端为准（失败也不挡保存，本地已生效）
      const nextRemark = remark.trim().slice(0, 12);
      store.setPartnerRemark(nextRemark);
      void updateSettings({ partnerRemark: nextRemark }).catch(() => {});
      store.setPersona(text.trim());
      store.setVoiceId(voiceId.trim());
      store.setVoiceSpeed(speed);
      store.setVoiceLanguage(lang);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1450] flex flex-col bg-page-bg text-foreground" data-testid="profile-editor">
      <motion.div
        role="dialog"
        aria-label={isMe ? '我的资料' : '他的资料'}
        className="flex h-full w-full flex-col overflow-hidden bg-page-bg"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      >
        {/* 顶栏：返回 + 标题（参考图二） */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2.5 py-2.5">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            data-testid="profile-editor-back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p
            data-testid="profile-editor-title"
            className="flex-1 text-center text-[15px] font-semibold text-foreground"
          >
            {isMe ? '我的资料' : '他的资料'}
          </p>
          <span className="h-8 w-8 shrink-0" aria-hidden />
        </div>

        <div
          data-testid="profile-scroll"
          className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {/* ---- 头像区块（两套共用，放在折叠页外面当主视觉） ---- */}
          <AvatarBlock target={target} value={avatar} onChange={setAvatar} />

          {isMe ? (
            /* ---- 我的：名称 + 描述 ---- */
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
            /* ---- 他：四个折叠页 ---- */
            <div className="mt-4 space-y-2.5" data-testid="profile-sections">
              <FoldSection title="角色设定" testid="fold-profile" defaultOpen>
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

                <Field label="备注" htmlFor="pe-remark">
                  <input
                    id="pe-remark"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    maxLength={12}
                    placeholder="聊天里显示的名字，比如「哥哥」"
                    data-testid="profile-editor-remark"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    填了之后，聊天顶栏和「小心思」就显示这个名字（AI 也能帮你改）。
                  </p>
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

                <div className="mt-4">
                  <PromptsPanel
                    namePrefixes={MODULES_PROFILE}
                    heading="内置人设模块"
                    showPreview
                  />
                </div>
              </FoldSection>

              <FoldSection title="语音与语言" testid="fold-voice">
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
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
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
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 accent-primary"
                    />
                    <span
                      data-testid="profile-editor-speed-value"
                      className="w-11 shrink-0 text-right text-[12px] tabular-nums text-foreground"
                    >
                      {speed.toFixed(1)}x
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    调整角色语音播放的语速（0.5 倍 - 2.0 倍）
                  </p>
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
                      <option key={l.value} value={l.value} className="bg-surface text-foreground">
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </FoldSection>

              <FoldSection title="语言风格与输出" testid="fold-style">
                <StyleRulesPanel />
                <div className="mt-3">
                  <PromptsPanel
                    namePrefixes={MODULES_STYLE}
                    heading="内置人设模块"
                    showPreview={false}
                  />
                </div>
              </FoldSection>

              <FoldSection title="备忘录" testid="fold-memo">
                <MemoSection />
                <div className="mt-3">
                  <PromptsPanel
                    namePrefixes={MODULES_MEMO}
                    heading="内置人设模块"
                    showPreview={false}
                  />
                </div>
              </FoldSection>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={save}
            data-testid="profile-editor-save"
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary py-3 text-[15px] font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <Check className="h-4 w-4" /> 保存
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------------------------- 折叠页 ---------------------------- */

/**
 * 一个折叠页：标题行 + 展开后的正文。
 *
 * 正文不额外加 `dark`：外壳与面板都走同一套主题 token，跟随全局深浅主题。
 */
function FoldSection({
  title,
  testid,
  defaultOpen = false,
  children,
}: {
  title: string;
  testid: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      data-testid={testid}
      data-open={open ? '1' : '0'}
      className="paper-card overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`${testid}-toggle`}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition hover:bg-surface-2"
      >
        <span className="flex-1 text-[14px] font-medium text-foreground">{title}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div data-testid={`${testid}-body`} className="border-t border-border px-3.5 py-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

/* ---------------------------- 头像区块（两套内容共用） ---------------------------- */

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
    <div className="paper-card px-4 py-4">
      <p className="text-center text-[13px] font-medium text-foreground">头像</p>

      <div className="mt-3 flex justify-center">
        <span
          data-testid="profile-editor-preview"
          className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand/25 to-gold/25 text-[34px] text-foreground"
        >
          {hasImage ? (
            <AvatarContent value={value} fallback={DEFAULT_AVATAR[target]} />
          ) : (
            <span className="leading-none text-foreground">
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
          className="flex w-full max-w-[260px] items-center justify-center gap-2 rounded-full border border-border bg-surface-2 py-2.5 text-[13px] text-foreground transition hover:bg-surface-3 disabled:opacity-60"
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
        <p data-testid="profile-editor-upload-error" className="mt-2 text-center text-[11px] text-destructive">
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
          className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition hover:text-foreground"
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
                value === e ? 'bg-primary/15 ring-2 ring-primary' : 'bg-surface-2 hover:bg-surface-3',
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
              className="flex h-9 items-center rounded-full bg-surface-2 px-3 text-[11px] text-muted-foreground transition hover:bg-surface-3"
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
    <div className="mt-4 first:mt-0">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-foreground">
        {label}
      </label>
      {hint && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

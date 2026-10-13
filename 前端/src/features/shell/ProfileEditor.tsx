/**
 * 角色调整浮层：点抽屉「纪念日块」上的头像打开，调整「我」或「TA」的头像与称呼。
 *
 * 为什么单独做个浮层而不是让用户绕去设置页：
 * 抽屉里那两个头像本来就是「聊天角色」的脸，随手点一下就该能改，
 * 绕去设置页要跨三层导航。设置页那张「个人资料」卡保持不变，两边读写同一个
 * profileStore，改哪边都同步。
 *
 * 层级：抽屉是 z-[1200]，这里必须 portal 到 body 并压到它上面，否则被抽屉吃掉。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';

export type ProfileTarget = 'me' | 'partner';

/** 备选头像：常用的一屏就能点完，不想用预设也能自己敲一个 emoji */
const AVATARS: string[] = [
  '🫐', '🐰', '🐻', '🐱', '🐶', '🦊', '🐺', '🐼',
  '🐨', '🐯', '🦁', '🐹', '🍓', '🍑', '🌸', '🌙',
  '⭐', '☀️', '🍀', '🎧', '📖', '☕', '🎂', '💌',
];

const DEFAULT_AVATAR: Record<ProfileTarget, string> = { me: '🫐', partner: '🐰' };

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
  const avatar = useProfileStore((s) => (isMe ? s.avatar : s.partnerAvatar));
  const name = useProfileStore((s) => (isMe ? s.name : s.partnerName));
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const setName = useProfileStore((s) => s.setName);
  const setPartnerAvatar = useProfileStore((s) => s.setPartnerAvatar);
  const setPartnerName = useProfileStore((s) => s.setPartnerName);

  const [draftAvatar, setDraftAvatar] = useState(avatar);
  const [draftName, setDraftName] = useState(name);

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
    const nextAvatar = draftAvatar.trim() || DEFAULT_AVATAR[target];
    const nextName = draftName.trim();
    if (isMe) {
      setAvatar(nextAvatar);
      setName(nextName);
    } else {
      setPartnerAvatar(nextAvatar);
      setPartnerName(nextName);
    }
    onClose();
  };

  const title = isMe ? '调整我的资料' : '调整 TA 的角色';
  const hint = isMe
    ? '头像和昵称会出现在抽屉与聊天里'
    : '称呼留空就沿用默认的「小蓝莓」';

  return (
    <div className="fixed inset-0 z-[1450] flex items-end justify-center" data-testid="profile-editor">
      <motion.div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-label={title}
        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-[#0f1424] shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#e8ecf6]" data-testid="profile-editor-title">
              {title}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-[#6b7488]">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            data-testid="profile-editor-close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8b93a7] transition hover:bg-white/[0.08]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {/* 当前头像预览 */}
          <div className="flex flex-col items-center">
            <span
              data-testid="profile-editor-preview"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#3b4a7a] to-[#5b3f6e] text-[32px]"
            >
              {draftAvatar.trim() || DEFAULT_AVATAR[target]}
            </span>
          </div>

          <p className="mt-4 mb-2 text-[11px] font-medium tracking-wider text-[#6b7488]">头像</p>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                data-testid={`avatar-option-${a}`}
                aria-label={`头像 ${a}`}
                aria-pressed={draftAvatar === a}
                onClick={() => setDraftAvatar(a)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-[20px] transition',
                  draftAvatar === a
                    ? 'bg-white/[0.14] ring-2 ring-[#7aa2ff]'
                    : 'bg-white/[0.05] hover:bg-white/[0.1]',
                )}
              >
                {a}
              </button>
            ))}
            <input
              value={draftAvatar}
              onChange={(e) => setDraftAvatar(e.target.value)}
              maxLength={4}
              aria-label="自定义头像"
              data-testid="profile-editor-avatar-input"
              className="h-10 w-14 rounded-full bg-white/[0.05] text-center text-[20px] text-[#e8ecf6] outline-none focus:ring-1 focus:ring-[#7aa2ff]"
            />
          </div>

          <p className="mt-4 mb-2 text-[11px] font-medium tracking-wider text-[#6b7488]">
            {isMe ? '昵称' : '称呼'}
          </p>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={isMe ? '你的昵称' : '如 小蓝莓'}
            data-testid="profile-editor-name"
            className="w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2.5 text-[14px] text-[#e8ecf6] outline-none placeholder:text-[#6b7488] focus:border-[#7aa2ff]/60"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.08] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/[0.06] py-2.5 text-[13px] text-[#c3cade] transition hover:bg-white/[0.1]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            data-testid="profile-editor-save"
            className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-[#7aa2ff] py-2.5 text-[13px] font-medium text-[#0b1020] transition hover:bg-[#8fb1ff]"
          >
            <Check className="h-4 w-4" /> 保存
          </button>
        </div>
      </motion.div>
    </div>
  );
}

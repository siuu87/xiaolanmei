import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { uploadImage } from '@/lib/api/attachments';
import { updateSettings } from '@/lib/api/settings';

export type ProfileTarget = 'me' | 'partner';

/**
 * 头像上传（复用于「我的资料」/「他的资料」两页）。
 *
 * 用法：在页面里渲染 `uploader.input`（隐藏 file input），把头像的
 * `onAvatarClick` 接到 `uploader.trigger()`。选图后自动上传并写回对应 store。
 */
export function useAvatarUploader(target: ProfileTarget) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setAvatar = useProfileStore((s) =>
    target === 'me' ? s.setAvatar : s.setPartnerAvatar,
  );

  const trigger = () => fileRef.current?.click();

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const up = await uploadImage(file);
      setAvatar(up.url.trim() || '');
    } catch (ex) {
      setErr((ex as Error).message || '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const input = (
    <input
      ref={fileRef}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onChange={onPick}
      className="hidden"
    />
  );

  return { trigger, busy, err, input };
}

/**
 * 行内可编辑卡片：区块右上角一支小笔，点一下就在「这个框里」就地编辑。
 *
 * - 非编辑态：标题（左上灰字）+ 小笔（右上）；有内容显示正文，无内容显示占位。
 * - 编辑态：原正文位置换成 textarea / input，标题右侧出现「取消 / 保存」。
 *
 * 这与「整页大按钮打开一个编辑浮层」是两种完全不同的交互：这里只动当前区块，
 * 不跳出模态、不丢失其它信息（2026-11-10 用户定）。
 */
export function EditableCard({
  title,
  value,
  placeholder,
  multiline = true,
  maxLength,
  rows = 4,
  onSave,
}: {
  title: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  rows?: number;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // 外部值变了（例如别的入口改过）且当前没在编辑 → 同步进来，避免串味
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };
  const save = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  return (
    <div className="mx-4 rounded-2xl bg-chat-ai p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] text-chat-meta">{title}</span>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancel}
              className="text-[12px] text-chat-meta transition hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              data-testid="inline-save"
              className="flex items-center gap-1 rounded-full bg-chat-me px-3 py-1 text-[12px] font-medium text-chat-me-fg transition active:scale-95"
            >
              <Check className="h-3.5 w-3.5" /> 保存
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            data-testid="inline-edit-pen"
            aria-label={`编辑${title}`}
            title={`编辑${title}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-chat-meta transition hover:bg-chat-line hover:text-foreground active:scale-90"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        multiline ? (
          <textarea
            autoFocus
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full resize-y rounded-xl border border-chat-line bg-page-bg px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none focus:border-chat-accent/60"
          />
        ) : (
          <input
            autoFocus
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-chat-line bg-page-bg px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none focus:border-chat-accent/60"
          />
        )
      ) : value.trim() ? (
        <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground">{value}</p>
      ) : (
        <p className="text-[13px] leading-6 text-chat-meta">{placeholder ?? '点右侧小笔编辑'}</p>
      )}
    </div>
  );
}

/**
 * 展开型卡片：用于嵌复杂面板（语言风格 / 语音与语言 / 内置模块 / 备忘录）。
 * 标题行右侧是 ▾ 开关，点开才显示面板；默认收起，避免一进来就被大块设置淹没。
 */
export function ExpandCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mx-4 rounded-2xl bg-chat-ai p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-chat-meta">{title}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'}${title}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-chat-meta transition hover:bg-chat-line hover:text-foreground active:scale-90"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** 备注写回后端（与旧 ProfileEditor 一致：本地 store + 后端 settings 双写） */
export function savePartnerRemark(remark: string) {
  const next = remark.trim().slice(0, 12);
  useProfileStore.getState().setPartnerRemark(next);
  void updateSettings({ partnerRemark: next }).catch(() => {});
}

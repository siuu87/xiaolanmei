import { cn } from '@/lib/utils';

/**
 * 头像取值约定：**emoji 或图片 URL 二选一**。
 * - `/api/files/xxx`（上传头像的返回）、`http(s)://...` → 当图片渲染
 * - 其它（🫐 / 🐰 / 我）→ 当文本渲染
 *
 * 判断收在这一个函数里，避免抽屉、聊天、浮层各自写一份正则然后慢慢跑偏。
 */
export function isImageAvatar(value: string): boolean {
  return /^(\/|https?:)/.test((value || '').trim());
}

/**
 * 头像**内容**（不含圆形外框）。外框（尺寸/圆角/底色/overflow）由调用方给，
 * 这样同一个头像能塞进抽屉 44px、气泡 32px、浮层 64px 等不同容器。
 */
export function AvatarContent({
  value,
  fallback,
  className,
}: {
  value: string;
  fallback: string;
  className?: string;
}) {
  const shown = (value || '').trim() || fallback;
  if (isImageAvatar(shown)) {
    return (
      <img
        src={shown}
        alt=""
        draggable={false}
        data-testid="avatar-image"
        className={cn('h-full w-full rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span data-testid="avatar-emoji" className={cn('leading-none', className)}>
      {shown}
    </span>
  );
}

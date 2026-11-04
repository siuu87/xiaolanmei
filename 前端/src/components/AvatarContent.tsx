import { cn } from '@/lib/utils';

/**
 * 头像取值约定：**只认图片**（2026-10-29 起，产品决定去掉 emoji 头像）。
 * - `/api/files/xxx`（上传头像的返回）、`http(s)://...` → 当图片渲染
 * - 其它（空串 / emoji / 任意文本）→ 一律渲染**中性剪影占位**，不再显示 emoji
 *
 * 判断收在这一个函数里，避免抽屉、聊天、浮层各自写一份正则然后慢慢跑偏。
 */
export function isImageAvatar(value: string): boolean {
  return /^(\/|https?:)/.test((value || '').trim());
}

/** 中性头像剪影：没有图片时全站统一用它，谁都不再是 emoji */
function AvatarSilhouette({ className }: { className?: string }) {
  return (
    <span
      data-testid="avatar-fallback"
      className={cn(
        'flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/[0.06] text-black/35',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[58%] w-[58%]">
        <path d="M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Zm0 2.1c-3.6 0-7.2 1.9-7.2 4.9v1.4h14.4V19c0-3-3.6-4.9-7.2-4.9Z" />
      </svg>
    </span>
  );
}

/**
 * 头像**内容**（不含圆形外框）。外框（尺寸/圆角/底色/overflow）由调用方给，
 * 这样同一个头像能塞进抽屉 44px、气泡 32px、浮层 64px 等不同容器。
 */
export function AvatarContent({
  value,
  className,
}: {
  value: string;
  /** 已废弃：头像不再有 emoji 兜底，参数保留仅为兼容旧调用方签名 */
  fallback?: string;
  className?: string;
}) {
  const shown = (value || '').trim();
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
  return <AvatarSilhouette className={className} />;
}

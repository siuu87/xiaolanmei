import { cn } from '@/lib/utils';

export interface IOSProfileCardProps {
  avatar?: string;
  /** 头像渐变类，如 "from-pink-400 to-purple-500" */
  avatarColor?: string;
  name: string;
  status?: string;
  onClick?: () => void;
}

/** iOS 风格个人资料卡：渐变圆形头像（emoji）+ 22px 加粗昵称 + 状态行 */
export function IOSProfileCard({ avatar, avatarColor, name, status, onClick }: IOSProfileCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-4 text-left"
    >
      <span
        className={cn(
          'flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-3xl',
          avatarColor ?? 'from-pink-400 to-purple-500',
        )}
      >
        {avatar ?? '🫐'}
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-bold leading-tight text-gray-900 dark:text-gray-100">
          {name || '未命名'}
        </span>
        {status && (
          <span className="mt-0.5 block text-[14px] text-gray-500 dark:text-zinc-400">{status}</span>
        )}
      </span>
    </button>
  );
}

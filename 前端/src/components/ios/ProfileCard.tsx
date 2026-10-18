import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarContent } from '@/components/AvatarContent';

export interface IOSProfileCardProps {
  avatar?: string;
  /** 头像渐变类，如 "from-pink-400 to-purple-500" */
  avatarColor?: string;
  name: string;
  status?: string;
  /** 点整张卡的动作（设置页里是展开「我们的档案」） */
  onClick?: () => void;
  /** 展开态：右侧箭头跟着转 90° */
  expanded?: boolean;
}

/**
 * iOS 风格个人资料卡：渐变圆形头像 + 22px 加粗昵称 + 状态行。
 *
 * 头像是 emoji 还是图片由 `AvatarContent` 判断 —— 之前这里直接渲染字符串，
 * 换成上传的图片后会显示成一串 URL。
 */
export function IOSProfileCard({ avatar, avatarColor, name, status, onClick, expanded }: IOSProfileCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="settings-profile-card"
      aria-expanded={expanded}
      title={onClick ? '展开「我们的档案」' : undefined}
      className={cn(
        'mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-4 rounded-2xl text-left transition',
        onClick && 'active:bg-muted/60',
      )}
    >
      <span
        className={cn(
          'flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-3xl',
          avatarColor ?? 'from-pink-400 to-purple-500',
        )}
      >
        <AvatarContent value={avatar ?? ''} fallback="🫐" className="text-3xl" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[22px] font-bold leading-tight text-foreground">
          {name || '未命名'}
        </span>
        {status && (
          <span className="mt-0.5 block text-[14px] text-muted-foreground">{status}</span>
        )}
      </span>
      {onClick && (
        <ChevronRight
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground/60 transition-transform',
            expanded && 'rotate-90',
          )}
        />
      )}
    </button>
  );
}

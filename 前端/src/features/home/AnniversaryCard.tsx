import { AvatarContent } from '@/components/AvatarContent';
import { useProfileStore } from '@/stores/profileStore';
import type { MemorialDay } from './memorialStore';

/** 从起始日到今天实际经过的天数 */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 起始日期文案，如 2026.3.14 */
function formatStartDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 解析 ISO 日期 YYYY-MM-DD 为本地 Date（避免 new Date(string) 按 UTC 解析产生时区偏移） */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 在一起天数卡（2026-11-18 晚改版，放在 /memorial 最上面）：
 *
 * 两个头像居左**贴在一起**（中间不放爱心），「已经 N 天了」在中间，
 * 文字顶部差不多在**头像一半**的高度上（用户原话口径）。
 * 起始日期来自置顶的纪念日 memorial.date；头像下挂一行 since 起始日。
 */
export function AnniversaryCard({ memorial }: { memorial: MemorialDay }) {
  const avatar = useProfileStore((s) => s.avatar);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);

  const startDate = parseISO(memorial.date);
  const totalDays = Math.max(0, daysBetween(startDate, new Date()));

  return (
    <div className="flex w-full items-start gap-3 py-2" data-testid="anniversary-card">
      {/* 左：两人头像贴在一起（第二个往左叠一点 + 页面底色描边分出前后），中间不放爱心 */}
      <div className="flex shrink-0" data-testid="anniversary-avatars">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-chat-pill ring-2 ring-[hsl(var(--page-bg))]">
          <AvatarContent value={avatar} className="h-full w-full text-[22px]" />
        </span>
        <span className="-ml-2.5 h-12 w-12 shrink-0 overflow-hidden rounded-full bg-chat-pill ring-2 ring-[hsl(var(--page-bg))]">
          <AvatarContent value={partnerAvatar} className="h-full w-full text-[22px]" />
        </span>
      </div>

      {/* 中：「已经 N 天了」—— 顶部在头像一半（24px）的高度上，往下垂 */}
      <div className="min-w-0 flex-1 text-center">
        <div className="mt-6 flex items-baseline justify-center gap-1">
          <span className="text-[13px] text-muted-foreground">已经</span>
          <span
            data-testid="anniversary-days"
            className="font-serif text-[30px] font-semibold leading-none tracking-tight tabular-nums text-foreground"
          >
            {totalDays.toLocaleString()}
          </span>
          <span className="text-[13px] text-muted-foreground">天了</span>
        </div>
        <span className="mt-1 block text-[11px] text-muted-foreground/70">
          since {formatStartDate(startDate)}
        </span>
      </div>
    </div>
  );
}

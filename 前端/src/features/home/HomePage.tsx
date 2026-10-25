import { Link } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { AvatarContent } from '@/components/AvatarContent';
import { AnniversaryCard } from './AnniversaryCard';
import { MoodCard } from './MoodCard';
import { CalendarCard } from './CalendarCard';
import { CourseCard } from './CourseCard';
import { TodoCard } from './TodoCard';
import { TokenCard } from './TokenCard';
import { FeatureGrid } from './FeatureGrid';
import { PeriodHint } from './PeriodHint';
import { useMemorialStore } from './memorialStore';
import { useProfileStore } from '@/stores/profileStore';
import { ModuleCards } from '@/features/shell/DrawerSections';
import { LetterInboxCard } from '@/features/notes/LetterInboxCard';
import { loveDays, LOVE_START } from '@/features/shell/loveDays';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/** 与 package.json 对齐；仅用于页脚展示 */
const APP_VERSION = '0.1.0';

function greeting(hour: number) {
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function HomePage() {
  const memorialDays = useMemorialStore((s) => s.days);
  const pinnedDay = memorialDays.find((d) => d.pinned);
  const name = useProfileStore((s) => s.name);
  const avatar = useProfileStore((s) => s.avatar);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const partnerName = useProfileStore((s) => s.partnerRemark || s.partnerName);
  const now = new Date();
  const days = loveDays(now);
  const startDate = `${LOVE_START.y}.${LOVE_START.m}.${LOVE_START.d}`;

  return (
    <div className="relative min-h-full bg-page-bg text-foreground">
      <div className="relative mx-auto w-full max-w-md px-4 py-5">
        {/* 顶部环境光，营造呼吸感 */}
        <div aria-hidden className="page-wash pointer-events-none absolute inset-x-0 top-0 h-52" />

        {/* 刊头：双头像 + 起点日期 + 记忆天数（对齐手绘图） */}
        <header className="rise-in relative mb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex shrink-0 items-center -space-x-3">
                <AvatarContent
                  value={avatar}
                  fallback="🫐"
                  className="h-12 w-12 border-2 border-page-bg bg-surface shadow-sm"
                />
                <AvatarContent
                  value={partnerAvatar}
                  fallback="🐰"
                  className="h-12 w-12 border-2 border-page-bg bg-surface shadow-sm"
                />
              </div>
              <div className="min-w-0">
                <p className="eyebrow mb-1">
                  {startDate} · 周{WEEK[now.getDay()]}
                </p>
                <p className="display flex items-baseline gap-1.5 leading-none">
                  <span className="text-[13px] font-normal text-muted-foreground">已经在一起</span>
                  <span className="text-[34px] font-semibold tracking-tight text-foreground">{days}</span>
                  <span className="text-[13px] font-normal text-muted-foreground">天</span>
                </p>
              </div>
            </div>
            <Link
              to="/settings"
              aria-label="设置"
              title="设置"
              className="icon-btn h-9 w-9 shrink-0"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
            {greeting(now.getHours())}，{name || '你'}
            {partnerName ? `。今天也和 ${partnerName} 一起，记一笔吧。` : '。今天也留一点时间给自己。'}
          </p>
        </header>

        <div className="relative space-y-4">
          {/* 置顶区域：有置顶纪念日才显示，否则留空 */}
          {pinnedDay && <AnniversaryCard memorial={pinnedDay} />}

          {/* Daily：日历 + 待办并排（窄屏自动上下堆叠） */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="eyebrow shrink-0">Daily</h2>
              <span aria-hidden className="hairline flex-1" />
            </div>
            <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
              <CalendarCard />
              <TodoCard />
            </div>
          </section>

          {/* Token + 信封：两枚小卡并排 */}
          <div className="grid grid-cols-2 items-start gap-3">
            <div data-testid="token-capsule">
              <TokenCard />
            </div>
            <LetterInboxCard />
          </div>

          <MoodCard />
          <PeriodHint />
          <CourseCard />
          <FeatureGrid />

          {/* 桌面端抽屉是 md:hidden，生活趣味 / 小酒馆 / 工具箱只收在抽屉里，
              宽屏上点不到。这里补一份模块入口给桌面用户（移动端抽屉已有，故 md:block 避免重复）。 */}
          <div className="hidden md:block">
            <ModuleCards />
          </div>

          <footer className="flex items-center justify-between border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
            <span className="tracking-wide">小蓝莓 · v{APP_VERSION}</span>
            <Link to="/settings" className="transition hover:text-foreground">
              设置
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}

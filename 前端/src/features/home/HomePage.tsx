import { Link, useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { AvatarContent } from '@/components/AvatarContent';
import { MoodArcRow } from './MoodCard';
import { CalendarCard } from './CalendarCard';
import { TodoCard } from './TodoCard';
import { CourseCard } from './CourseCard';
import { TokenCard } from './TokenCard';
import { useProfileStore } from '@/stores/profileStore';
import { ModuleCards } from '@/features/shell/DrawerSections';
import { LifeCard } from './LifeCard';
import { LetterInboxCard } from '@/features/notes/LetterInboxCard';
import { useNotesStore } from '@/features/notes/notesStore';
import { loveDays, LOVE_START } from '@/features/shell/loveDays';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/** 取信件正文首行：跳过开头单独成行的日期（YYYY.M.D）与空行，作为「他写的话」 */
function firstLetterLine(content: string): string | null {
  const line = content
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s && !/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(s));
  return line ?? null;
}

/** 与 package.json 对齐；仅用于页脚展示 */
const APP_VERSION = '0.1.0';

/**
 * 首页 · 完全对齐设计稿（首页稿 2:1 连续长页）：
 * 刊头 2:2 → DAILY 2:35 → 日历卡 2:38 → 待办卡 77:705 →
 * Token与信封 2:115（左 Token 卡 2:116｜右 信件卡 2:134 + 心情行 2:144 三弧38px）→
 * 课程卡 2:155 → 模块分隔 5:8 + 模块卡 → 页脚 2:183。
 *
 * 置顶纪念日不再展示（2026-11-04 用户定）；刊头下的一句话 = 他写的最新一封信念首行，
 * 没有信就不显示，不再放本地拼的问候语。
 */
export function HomePage() {
  const avatar = useProfileStore((s) => s.avatar);
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const navigate = useNavigate();
  const notes = useNotesStore((s) => s.notes);
  const now = new Date();
  const days = loveDays(now);
  const startDate = `${LOVE_START.y}.${LOVE_START.m}.${LOVE_START.d}`;

  // 他写的话：最新一封信念的首行（跳过开头单独成行的日期与空行）；没有就不展示
  const latestNote = notes[0] ?? null;
  const aiLine = latestNote ? firstLetterLine(latestNote.content) : null;

  return (
    <div className="relative min-h-full bg-page-bg text-foreground">
      <div className="relative mx-auto w-full max-w-md px-4 py-5">
        {/* 顶部环境光，营造呼吸感 */}
        <div aria-hidden className="page-wash pointer-events-none absolute inset-x-0 top-0 h-52" />

        {/* 刊头：封面 + 骑线双头像（与资料页 ProfileCoverSheet 同款视觉语言）。
            左=他的资料 / 右=我的资料（2026-11-04：左他右我），头像骑在封面下沿、居中对称。 */}
        <header className="rise-in relative mb-5">
          {/* 封面小条：浅蓝 + 装饰圈，沿用资料页封面 */}
          <div className="relative h-20 overflow-hidden rounded-t-[20px] bg-[#dce9f6] dark:bg-[#1e2c3d]">
            <span className="absolute left-6 top-3 h-10 w-10 rounded-full bg-white/45 dark:bg-white/10" />
            <span className="absolute right-12 top-4 h-7 w-7 rounded-full bg-white/40 dark:bg-white/10" />
            <span className="absolute right-5 top-9 h-4 w-4 rounded-full bg-white/50 dark:bg-white/10" />
          </div>
          {/* 双头像骑线：左=他的 / 右=我的 */}
          <div className="relative -mt-10 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/partner')}
              aria-label="他的资料"
              title="他的资料"
              className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full bg-chat-pill shadow-sm ring-4 ring-white/70 transition active:scale-95 dark:ring-white/10"
            >
              <AvatarContent value={partnerAvatar} className="h-full w-full text-[36px]" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/me')}
              aria-label="我的资料"
              title="我的资料"
              className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full bg-chat-pill shadow-sm ring-4 ring-white/70 transition active:scale-95 dark:ring-white/10"
            >
              <AvatarContent value={avatar} className="h-full w-full text-[36px]" />
            </button>
          </div>
          {/* 信息行：在一起 N 天 + 设置 */}
          <div className="mt-3 flex items-center justify-between gap-3">
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
            <Link
              to="/settings"
              aria-label="设置"
              title="设置"
              className="icon-btn h-9 w-9 shrink-0"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
          </div>
          {/* 他写的话：最新一封信念的首行（实际导入 AI 后由他写）；没有信就不显示 */}
          {aiLine && (
            <p className="mt-2.5 line-clamp-1 text-[12px] leading-relaxed text-muted-foreground">
              {aiLine}
            </p>
          )}
        </header>

        <div className="relative space-y-4">
          {/* DAILY：日历卡（全宽，选中日详情在左栏切换） */}
          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="eyebrow shrink-0">Daily</h2>
              <span aria-hidden className="hairline flex-1" />
            </div>
            <CalendarCard />
          </section>

          {/* 待办卡：独立一张卡（对齐设计稿 77:705，从日历右轨拆出） */}
          <TodoCard />

          {/* Token 与信封：平分空间（2026-11-04 用户定：token 别太宽），右列 信件卡(compact) 上 +
              心情弧 下，信件高度精确占 Token 卡 1/2 */}
          <div className="grid grid-cols-2 gap-3">
            <div data-testid="token-capsule">
              <TokenCard />
            </div>
            <div className="min-w-0">
              <LetterInboxCard compact className="flex h-1/2 flex-col p-3" />
              <div className="flex h-1/2 min-h-0 items-center justify-center">
                <MoodArcRow />
              </div>
            </div>
          </div>

          <CourseCard />

          {/* 模块区：together / 酒馆 / 生活小趣味，移动端与桌面端同一份入口 */}
          <ModuleCards />

          {/* 生活：从设置页移出的经期预测 + 睡前提醒（2026-11-10） */}
          <LifeCard />

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

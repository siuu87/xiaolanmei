/**
 * 主抽屉内容：A 伴侣档案卡 / B 日常生活看板 / C 模块卡 / D 底部固定栏
 *
 * 原则：这里只做「收纳与排版」，所有业务卡片都是直接复用现有组件
 * （CalendarCard / TodoCard / LetterInboxCard / AppearanceSection），
 * 不复制逻辑、不改它们的内部实现——所以抽屉挂上去，原页面该怎样还怎样。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Tv,
  BookOpen,
  Images,
  Phone,
  Utensils,
  NotebookPen,
  Moon,
  Cake,
  GraduationCap,
  Puzzle,
  Star,
  Lightbulb,
  Heart,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { useShellStore } from '@/stores/shellStore';
import { AvatarContent } from '@/components/AvatarContent';
import { CalendarCard } from '@/features/home/CalendarCard';
import { TodoCard } from '@/features/home/TodoCard';
import { WidgetRow } from '@/features/home/WidgetRow';
import { LOVE_START, loveDays } from './loveDays';
import { TOOLBOX_SECTIONS } from '@/features/chat/toolboxSections';
import { useOpenSourceStore } from '@/features/openSource/openSourceStore';

/* ---------------------------- A. 伴侣档案卡 ---------------------------- */

/**
 * 纪念日块（抽屉顶部）：2026-11-18 晚改成与 /memorial 在一起卡同款——
 * 两个头像**居左贴在一起**（中间不放爱心，他在左、我在右），
 * 「已经 N 天了」在中间、文字顶部约在头像一半的高度，下面一行起始日小字。
 *
 * 两个头像仍可点：左边改「TA 的角色」，右边改「我」（头像 + 称呼），
 * 改完主界面顶栏的称呼与挂件头像立刻跟着变。
 */
export function ProfileHeader() {
  const { avatar, partnerAvatar } = useProfileStore();
  const navigate = useNavigate();
  const days = useMemo(() => loveDays(), []);

  return (
    <div className="shrink-0 px-4 pb-4 pt-3" data-testid="anniversary-block">
      <div className="flex w-full items-start gap-3">
        {/* 左：两人头像贴在一起（第二个往左叠一点 + 页面底色描边分出前后），中间不放爱心 */}
        <div className="flex shrink-0" data-testid="anniversary-avatars">
          <button
            type="button"
            onClick={() => navigate('/partner')}
            aria-label="他的资料"
            title="他的资料"
            data-testid="avatar-partner"
            className="group relative rounded-full transition focus-visible:outline-none"
          >
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-[hsl(var(--page-bg))] transition group-hover:ring-primary/40">
              <AvatarContent value={partnerAvatar} className="h-full w-full bg-white" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/me')}
            aria-label="我的资料"
            title="我的资料"
            data-testid="avatar-me"
            className="group relative -ml-2.5 rounded-full transition focus-visible:outline-none"
          >
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-[hsl(var(--page-bg))] transition group-hover:ring-primary/40">
              <AvatarContent value={avatar} className="h-full w-full bg-white" />
            </span>
          </button>
        </div>

        {/* 中：「已经 N 天了」—— 顶部在头像一半（24px）的高度上，往下垂 */}
        <div className="min-w-0 flex-1 text-center">
          <div className="mt-6 flex items-baseline justify-center gap-1">
            <span className="text-[13px] text-muted-foreground">已经</span>
            <span
              data-testid="love-days"
              className="display text-[30px] font-semibold leading-none tracking-tight text-foreground"
            >
              {days}
            </span>
            <span className="text-[13px] text-muted-foreground">天了</span>
          </div>
          <span className="mt-1 block font-serif text-[10px] tracking-wide text-muted-foreground/80">
            {LOVE_START.y}.{LOVE_START.m}.{LOVE_START.d} 起
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- B. 日常生活看板 ---------------------------- */

export function DailyBoard() {
  return (
    <section className="px-4 pb-3">
      <div className="mb-2.5 flex items-center gap-2 px-0.5">
        <span className="eyebrow">日常生活 · Daily</span>
        <span className="h-px flex-1 bg-border/70" aria-hidden />
      </div>
      <div className="space-y-3">
        {/* 日历：农历 / 休班 / 经期都在，点农历开黄历详情（心情点已删） */}
        <CalendarCard />
        <TodoCard />
        {/* 小组件一排：与首页共用 `WidgetRow`（2026-11-18）
            —— Token ｜ 深夜来信（居中）+ 小挂件位，下面礼物盒（正方形）+ 小程序占位 */}
        <WidgetRow />
      </div>
    </section>
  );
}

/* ---------------------------- C. 模块卡片区 ---------------------------- */

interface ModuleEntry {
  to: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
}

interface ModuleGroup {
  title: string;
  icon: typeof Star;
  entries: ModuleEntry[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: 'together',
    icon: Star,
    // 与 TogetherPage 的分块保持一致（watch/read/gallery/goodnight）——
    // 抽屉是镜像入口，那边加一块这边也要加，否则「收拢」就只收了一半。
    // 2026-11-09：diary（日记本）按需求移到「生活小趣味」组，不再挂在 together。
    entries: [
      { to: '/watch', label: 'watch', hint: '电视 · 片单', icon: Tv },
      { to: '/library', label: 'read', hint: '书架 · 管理', icon: BookOpen },
      { to: '/gallery', label: 'gallery', hint: '相册 · 图像记忆', icon: Images },
      { to: '/goodnight', label: 'goodnight', hint: '哄睡 · 陪睡', icon: Moon },
    ],
  },
  {
    title: '酒馆小手机',
    icon: Phone,
    entries: [
      {
        to: '/tavern',
        label: '小手机',
        hint: '角色卡 · 小世界书 · 朋友圈',
        icon: Phone,
      },
    ],
  },
  {
    title: '生活小趣味',
    icon: Utensils,
    entries: [
      { to: '/food', label: '今天吃什么', icon: Utensils },
      { to: '/wishlist', label: '灵感库', icon: Lightbulb },
      { to: '/moments', label: '心动收藏', hint: '聊天里收进来的句子', icon: Heart },
      { to: '/memorial', label: '纪念日', icon: Cake },
      { to: '/schedule', label: '课程表', icon: GraduationCap },
      { to: '/diary', label: '日记本', icon: NotebookPen },
      { to: '/games', label: '游戏屋', hint: '和 AI 一起玩', icon: Gamepad2 },
    ],
  },
];

/**
 * 单个模块分组卡（2026-11-16 从 ModuleCards 里拆出来）。
 *
 * 拆的理由：抽屉首页要把「together」这组提到每日看板前面，
 * 而首页 /home 仍然整块按原顺序铺。同一个卡由两处复用，样式一行没动。
 */
function GroupCard({ group, open, onToggle }: { group: ModuleGroup; open: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  // 只有一项的分组（如酒馆小手机）不再展开：直接点分组头进入
  const direct = group.entries.length === 1;
  const go = (to: string) => {
    closeDrawer();
    navigate(to);
  };

  return (
    <div className="paper-card overflow-hidden">
      {/* 分组头：尺寸和下面的「工具箱」按键完全一致；单项分组点击即进入 */}
      <button
        type="button"
        onClick={() => (direct ? go(group.entries[0].to) : onToggle())}
        aria-expanded={direct ? undefined : open}
        data-testid={`module-group-${group.title}`}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-surface-2"
      >
        <group.icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground">{group.title}</span>
        {/* 单项分组（酒馆）点击即进，不再写「进入」二字（2026-11-04 设计稿） */}
        <span className="ml-auto text-[10px] text-muted-foreground">{direct ? '' : `${group.entries.length} 项`}</span>
        {direct ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        )}
      </button>

      {/* 扩展条：点开才展开（单项分组不渲染） */}
      {!direct && (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-1.5 border-t border-border px-2.5 py-2.5">
                {group.entries.map((e) => (
                  <button
                    key={e.to + e.label}
                    type="button"
                    onClick={() => go(e.to)}
                    className="flex flex-col items-start gap-1 rounded-xl px-2.5 py-2 text-left transition active:scale-[0.98] hover:bg-foreground/10"
                  >
                    <e.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[12px] font-medium leading-tight text-foreground">{e.label}</span>
                    {e.hint && <span className="text-[10px] leading-tight text-muted-foreground">{e.hint}</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

/** 抽屉 / 首页都能单独摆的一个分组（自己管展开状态） */
export function ModuleGroupCard({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const group = MODULE_GROUPS.find((g) => g.title === title);
  if (!group) return null;
  return <GroupCard group={group} open={open} onToggle={() => setOpen((v) => !v)} />;
}

export function ModuleCards() {
  // 手风琴：同时只展开一个分组，点已展开的收起
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="px-4 pb-3">
      <div className="mb-2.5 flex items-center gap-2 px-0.5">
        <span className="eyebrow">模块 · Modules</span>
        <span className="h-px flex-1 bg-border/70" aria-hidden />
      </div>
      <div className="space-y-2.5">
        {MODULE_GROUPS.map((g) => (
          <GroupCard
            key={g.title}
            group={g}
            open={expanded === g.title}
            onToggle={() => setExpanded(expanded === g.title ? null : g.title)}
          />
        ))}

        {/* 工具箱：与其他分组**完全同一套** 2 列图标格。
            2026-11-12 改版：原来这里再套一层「子项 → 面板」折叠，五个整页组件
            各有自己的 h1 与内边距，卡中卡 + 九条相似行叠着，很难看。
            现在点某项走 `openDrawerSection`，由 Drawer 下钻一层全宽渲染。
            「角色」2026-10-15 移到点头像打开的 ProfileEditor → 「角色设定」页签
            2026-11-16：抽成 ToolboxCard，抽屉可以把它摆到最后 */}
        <ToolboxCard
          open={expanded === 'toolbox'}
          onToggle={() => setExpanded(expanded === 'toolbox' ? null : 'toolbox')}
        />
      </div>
    </section>
  );
}

/**
 * 工具箱卡（2026-11-16 从 ModuleCards 里抽出来）
 *
 * 与其他分组**完全同一套** 2 列图标格；点某项走 `openDrawerSection`，
 * 由 Drawer 下钻一层全宽渲染（不再卡中卡）。
 */
export function ToolboxCard({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const openDrawerSection = useShellStore((s) => s.openDrawerSection);
  const openSourceUpdates = useOpenSourceStore((s) => s.updatesCount);

  return (
    <div className="paper-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="module-group-toolbox"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-surface-2"
      >
        <Puzzle className="h-4 w-4 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground">工具箱</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{TOOLBOX_SECTIONS.length} 项</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-1.5 border-t border-border px-2.5 py-2.5">
              {TOOLBOX_SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => openDrawerSection(s.key)}
                  data-testid={`toolbox-entry-${s.key}`}
                  className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition active:scale-[0.98] hover:bg-foreground/5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex items-center justify-center gap-1.5 text-[12px] font-medium leading-tight text-foreground">
                    {s.label}
                    {s.key === 'opensource' && openSourceUpdates > 0 && (
                      <span
                        aria-label={`${openSourceUpdates} 个项目有更新`}
                        data-testid="opensource-dot"
                        className="block h-[7px] w-[7px] shrink-0 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]"
                      />
                    )}
                  </span>
                  {s.hint && (
                    <span className="text-[10px] leading-tight text-muted-foreground">{s.hint}</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------- D. 底部固定栏 ---------------------------- */

export function StickyFooter() {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const openAppearance = useShellStore((s) => s.openAppearance);

  return (
    <div className="sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          v1 · 数据本地同步
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          closeDrawer();
          navigate('/settings');
        }}
        className="rounded-full px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-surface-2"
      >
        全部设置
      </button>
      <button
        type="button"
        onClick={openAppearance}
        aria-label="系统设置"
        title="外观自定义"
        data-testid="drawer-settings"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition',
          'hover:bg-foreground/10 hover:text-foreground',
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}

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
  Headphones,
  Images,
  Phone,
  Utensils,
  NotebookPen,
  Cake,
  GraduationCap,
  Puzzle,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { useShellStore } from '@/stores/shellStore';
import { ProfileEditor, type ProfileTarget } from './ProfileEditor';
import { AvatarContent } from '@/components/AvatarContent';
import { CalendarCard } from '@/features/home/CalendarCard';
import { TodoCard } from '@/features/home/TodoCard';
import { LetterInboxCard } from '@/features/notes/LetterInboxCard';
import { TokenCard } from '@/features/home/TokenCard';
import { LOVE_START, loveDays } from './loveDays';
import { TOOLBOX_SECTIONS } from '@/features/chat/toolboxSections';

/* ---------------------------- A. 伴侣档案卡 ---------------------------- */

/**
 * 纪念日块（日历正上方）：两个人的头像挨着，下面一个更大的「在一起 N 天」数字。
 * 不要边框、不要名字——就放纪念日这一件事。
 *
 * 两个头像可点：左边改「我」，右边改「TA 的角色」（头像 + 称呼），
 * 改完主界面顶栏的称呼与挂件头像立刻跟着变——抽屉里这两张脸本来就是聊天角色的脸，
 * 顺手点一下就该能改，不用绕去设置页。设置页那张卡读写同一个 store，两边同步。
 */
export function ProfileHeader() {
  const { avatar, partnerAvatar } = useProfileStore();
  const [editing, setEditing] = useState<ProfileTarget | null>(null);
  const days = useMemo(() => loveDays(), []);

  return (
    <div className="shrink-0 px-4 pb-3 pt-4" data-testid="anniversary-block">
      <div className="flex flex-col items-center">
        {/* 两个人的头像挨着（可点）——按需求**他在左、我在右** */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing('partner')}
            aria-label="调整他的资料"
            title="调整他的资料"
            data-testid="avatar-partner"
            className="rounded-full transition hover:ring-2 hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-[#7aa2ff]"
          >
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#5b3f6e] to-[#7a4a63] text-[22px]">
              <AvatarContent value={partnerAvatar} fallback="🐰" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setEditing('me')}
            aria-label="调整我的资料"
            title="调整我的资料"
            data-testid="avatar-me"
            className="rounded-full transition hover:ring-2 hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-[#7aa2ff]"
          >
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#3b4a7a] to-[#5b3f6e] text-[22px]">
              <AvatarContent value={avatar} fallback="🫐" />
            </span>
          </button>
        </div>

        {/* 在一起 N 天：数字给到 32px，一眼看到 */}
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="text-[12px] text-[#8b93a7]">在一起</span>
          <span
            data-testid="love-days"
            className="font-serif text-[32px] font-semibold leading-none text-[#e8ecf6]"
          >
            {days}
          </span>
          <span className="text-[12px] text-[#8b93a7]">天</span>
        </div>

        <span className="mt-1 text-[10px] text-[#6b7488]">
          {LOVE_START.y}.{LOVE_START.m}.{LOVE_START.d} 起
        </span>
      </div>

      {/* 点头像弹出来的角色调整浮层（portal 到 body，压过抽屉） */}
      <ProfileEditor target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/* ---------------------------- B. 日常生活看板 ---------------------------- */

export function DailyBoard() {
  return (
    <section className="px-4 pb-3">
      <h3 className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-[#6b7488]">
        日常生活
      </h3>
      <div className="space-y-3">
        {/* 日历：农历 / 休班 / 经期 / 心情点全在，点农历开黄历详情 */}
        <CalendarCard />
        <TodoCard />
        {/* Token 与收信匣并排，一半一半 */}
        <div className="grid grid-cols-2 gap-3">
          <div data-testid="token-capsule">
            <TokenCard />
          </div>
          {/* 深夜来信 · 收信匣：一封信 + 原地展开 + 左右换信 */}
          <LetterInboxCard />
        </div>
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
    // 与 TogetherPage 的五个分块保持一致（watch/listen/read/gallery/diary）——
    // 抽屉是镜像入口，那边加一块这边也要加，否则「收拢」就只收了一半。
    entries: [
      { to: '/watch', label: 'watch', hint: '电视 · 片单', icon: Tv },
      { to: '/listen', label: 'listen', hint: '进入一起听', icon: Headphones },
      { to: '/library', label: 'read', hint: '书架 · 管理', icon: BookOpen },
      { to: '/gallery', label: 'gallery', hint: '相册 · 图像记忆', icon: Images },
      { to: '/diary', label: 'diary', hint: '日记本 · 随手写', icon: NotebookPen },
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
      { to: '/memorial', label: '纪念日', icon: Cake },
      { to: '/schedule', label: '课程表', icon: GraduationCap },
    ],
  },
];

export function ModuleCards() {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  // 手风琴：同时只展开一个分组，点已展开的收起
  const [expanded, setExpanded] = useState<string | null>(null);
  // 工具箱内部的子项（插件/世界书/…），独立于分组手风琴
  const [toolboxSection, setToolboxSection] = useState<string | null>(null);

  const go = (to: string) => {
    closeDrawer();
    navigate(to);
  };

  return (
    <section className="px-4 pb-3">
      <h3 className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-[#6b7488]">
        模块
      </h3>
      <div className="space-y-2.5">
        {MODULE_GROUPS.map((g) => {
          const open = expanded === g.title;
          // 只有一项的分组（如酒馆小手机）不再展开：直接点分组头进入
          const direct = g.entries.length === 1;
          return (
            <div key={g.title} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151b2b]">
              {/* 分组头：尺寸和下面的「工具箱」按键完全一致；单项分组点击即进入 */}
              <button
                type="button"
                onClick={() => (direct ? go(g.entries[0].to) : setExpanded(open ? null : g.title))}
                aria-expanded={direct ? undefined : open}
                data-testid={`module-group-${g.title}`}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
              >
                <g.icon className="h-4 w-4 text-[#9aa3b8]" />
                <span className="text-[12px] font-medium text-[#dfe4ef]">{g.title}</span>
                <span className="ml-auto text-[10px] text-[#6b7488]">{direct ? '进入' : `${g.entries.length} 项`}</span>
                {direct ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#6b7488]" />
                ) : (
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-[#6b7488] transition-transform', open && 'rotate-180')}
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
                      <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.06] px-2.5 py-2.5">
                        {g.entries.map((e) => (
                          <button
                            key={e.to + e.label}
                            type="button"
                            onClick={() => go(e.to)}
                            className="flex flex-col items-start gap-1 rounded-xl px-2.5 py-2 text-left transition active:scale-[0.98] hover:bg-white/[0.06]"
                          >
                            <e.icon className="h-4 w-4 text-[#9aa3b8]" />
                            <span className="text-[12px] font-medium leading-tight text-[#dfe4ef]">{e.label}</span>
                            {e.hint && <span className="text-[10px] leading-tight text-[#6b7488]">{e.hint}</span>}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          );
        })}

        {/* 工具箱：插件 / 世界书 / 工作区 / 技能，抽屉内展开成手风琴（不再弹独立面板）
            「角色」2026-10-15 移到点头像打开的 ProfileEditor → 「角色设定」页签 */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151b2b]">
          <button
            type="button"
            onClick={() => setExpanded(expanded === 'toolbox' ? null : 'toolbox')}
            aria-expanded={expanded === 'toolbox'}
            data-testid="module-group-toolbox"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
          >
            <Puzzle className="h-4 w-4 text-[#9aa3b8]" />
            <span className="text-[12px] font-medium text-[#dfe4ef]">工具箱</span>
            <span className="ml-auto text-[10px] text-[#6b7488]">{TOOLBOX_SECTIONS.length} 项</span>
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 text-[#6b7488] transition-transform', expanded === 'toolbox' && 'rotate-180')}
            />
          </button>

          <AnimatePresence initial={false}>
            {expanded === 'toolbox' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="space-y-2 border-t border-white/[0.06] p-2.5">
                  {TOOLBOX_SECTIONS.map((s) => {
                    const isOpen = toolboxSection === s.key;
                    return (
                      <div key={s.key} className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03]">
                        <button
                          type="button"
                          onClick={() => setToolboxSection(isOpen ? null : s.key)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/[0.06]"
                        >
                          <s.icon className="h-4 w-4 shrink-0 text-[#9aa3b8]" />
                          <span className="text-[12px] font-medium text-[#dfe4ef]">{s.label}</span>
                          <ChevronDown
                            className={cn('ml-auto h-4 w-4 shrink-0 text-[#6b7488] transition-transform', isOpen && 'rotate-180')}
                          />
                        </button>
                        {isOpen && <div className="border-t border-white/[0.06] p-3">{s.render()}</div>}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- D. 底部固定栏 ---------------------------- */

export function StickyFooter() {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const openAppearance = useShellStore((s) => s.openAppearance);

  return (
    <div className="sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-white/[0.08] bg-[#111726]/95 px-4 py-2.5 backdrop-blur">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[10px] text-[#6b7488]">
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
        className="rounded-full px-2.5 py-1 text-[11px] text-[#8b93a7] transition hover:bg-white/[0.06]"
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
          'flex h-8 w-8 items-center justify-center rounded-full text-[#a8b0c4] transition',
          'hover:bg-white/[0.08] hover:text-white',
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

/**
 * 主抽屉内容：A 伴侣档案卡 / B 日常生活看板 / C 模块卡 / D 底部固定栏
 *
 * 原则：这里只做「收纳与排版」，所有业务卡片都是直接复用现有组件
 * （CalendarCard / TodoCard / InspirationNoteCard / AppearanceSection），
 * 不复制逻辑、不改它们的内部实现——所以抽屉挂上去，原页面该怎样还怎样。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronDown,
  Clapperboard,
  BookOpen,
  Headphones,
  Library,
  Phone,
  Utensils,
  NotebookPen,
  Cake,
  GraduationCap,
  Puzzle,
  Sparkles,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';
import { useShellStore } from '@/stores/shellStore';
import { CalendarCard } from '@/features/home/CalendarCard';
import { TodoCard } from '@/features/home/TodoCard';
import { InspirationNoteCard } from '@/features/notes/InspirationNoteCard';
import { TokenCard } from '@/features/home/TokenCard';
import { LOVE_START, loveDays } from './loveDays';

/* ---------------------------- A. 伴侣档案卡 ---------------------------- */

export function ProfileHeader() {
  const { name, avatar, partnerAvatar } = useProfileStore();
  const days = useMemo(() => loveDays(), []);

  return (
    <div className="shrink-0 px-4 pb-3 pt-4">
      {/* 纪念日卡：不要边框（用户要求），靠渐变本身和下面的内容区分层次 */}
      <div className="rounded-2xl bg-gradient-to-br from-[#1b2440] to-[#141a2c] p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3b4a7a] to-[#5b3f6e] text-2xl">
            {avatar || '🫐'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#e8ecf6]">{name || '小蓝莓'}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8b93a7]">
              <Sparkles className="h-3 w-3 text-primary" />
              在一起
              <span className="font-medium text-primary" data-testid="love-days">
                {days}
              </span>
              天
              <span className="ml-0.5 opacity-60">
                （{LOVE_START.y}.{LOVE_START.m}.{LOVE_START.d} 起）
              </span>
            </p>
          </div>
          <span className="shrink-0 text-xl">{partnerAvatar || '🐰'}</span>
        </div>
      </div>
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
        {/* Token 和信箱并排，一半一半（跟旧首页那排一样） */}
        <div className="grid grid-cols-2 gap-3">
          <div data-testid="token-capsule">
            <TokenCard />
          </div>
          <InspirationNoteCard />
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
  icon: typeof Clapperboard;
}

interface ModuleGroup {
  title: string;
  icon: typeof Star;
  entries: ModuleEntry[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: '星空与共度',
    icon: Star,
    entries: [
      { to: '/sky', label: '放映厅 · 音乐', hint: '片单 TV / 黑胶', icon: Clapperboard },
      { to: '/listen', label: '一起听 · 听书', icon: Headphones },
      { to: '/read', label: '一起读 · 书架', icon: BookOpen },
      { to: '/library', label: '书库', icon: Library },
    ],
  },
  {
    title: '酒馆小手机',
    icon: Phone,
    entries: [
      {
        to: '/tavern',
        label: '小手机',
        hint: '角色卡 · 通讯录 · 小世界书 · 朋友圈',
        icon: Phone,
      },
    ],
  },
  {
    title: '生活小趣味',
    icon: Utensils,
    entries: [
      { to: '/food', label: '今天吃什么', icon: Utensils },
      { to: '/diary', label: '日记本', icon: NotebookPen },
      { to: '/memorial', label: '纪念日', icon: Cake },
      { to: '/schedule', label: '课程表', icon: GraduationCap },
    ],
  },
];

export function ModuleCards() {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);
  const openToolbox = useShellStore((s) => s.openToolbox);
  // 手风琴：同时只展开一个分组，点已展开的收起
  const [expanded, setExpanded] = useState<string | null>(null);

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
          return (
            <div key={g.title} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151b2b]">
              {/* 分组头：尺寸和下面的「工具箱」按键完全一致 */}
              <button
                type="button"
                onClick={() => setExpanded(open ? null : g.title)}
                aria-expanded={open}
                data-testid={`module-group-${g.title}`}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
              >
                <g.icon className="h-4 w-4 text-[#9aa3b8]" />
                <span className="text-[12px] font-medium text-[#dfe4ef]">{g.title}</span>
                <span className="ml-auto text-[10px] text-[#6b7488]">{g.entries.length} 项</span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-[#6b7488] transition-transform', open && 'rotate-180')}
                />
              </button>

              {/* 扩展条：点开才展开 */}
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
            </div>
          );
        })}

        {/* 原聊天「工具箱」（插件 / 角色 / 世界书 / 工作区 / 技能）收在这里，功能一个不少 */}
        <button
          type="button"
          onClick={openToolbox}
          className="flex w-full items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#151b2b] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
        >
          <Puzzle className="h-4 w-4 text-[#9aa3b8]" />
          <span className="text-[12px] font-medium text-[#dfe4ef]">工具箱</span>
          <span className="ml-auto text-[10px] text-[#6b7488]">插件 / 角色 / 世界书 / 工作区 / 技能</span>
        </button>
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

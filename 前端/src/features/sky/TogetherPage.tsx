import { useNavigate } from 'react-router-dom';
import {
  Tv,
  Headphones,
  BookOpen,
  Images,
  NotebookPen,
  Moon,
  ChevronRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { StarBackdrop } from './StarBackdrop';

interface TogetherBlock {
  key: string;
  label: string;
  hint: string;
  to: string;
  icon: LucideIcon;
}

/**
 * together 的分块。
 *
 * 2026-10-16：`gallery`（相册 · 图像记忆）与 `diary`（日记本）按需求收拢到这里，
 * 跟 watch / listen / read 并列 —— 这一页就是「两个人的回忆与生活记录中心」。
 * 它们原来的入口（抽屉「生活小趣味」组、首页 FeatureGrid）已移除，但**路由没变**
 * （`/gallery` `/diary`），所以旧链接照样能用。
 * 标签沿用现有的小写英文风格（watch / listen / read），中文说明放 hint。
 * 2026-10-18：新增 `goodnight`（晚安 · 哄睡陪睡），路由 `/goodnight`。
 */
const BLOCKS: TogetherBlock[] = [
  { key: 'watch', label: 'watch', hint: '电视 · 片单', to: '/watch', icon: Tv },
  { key: 'listen', label: 'listen', hint: '进入一起听', to: '/listen', icon: Headphones },
  { key: 'read', label: 'read', hint: '书架 · 管理', to: '/library', icon: BookOpen },
  { key: 'gallery', label: 'gallery', hint: '相册 · 图像记忆', to: '/gallery', icon: Images },
  { key: 'diary', label: 'diary', hint: '日记本 · 随手写', to: '/diary', icon: NotebookPen },
  { key: 'goodnight', label: 'goodnight', hint: '哄睡 · 陪睡', to: '/goodnight', icon: Moon },
];

/**
 * together：原「星空与共度」的新主页，五个分块，
 * 每个分块点进去都是一个独立的新页面。
 */
export function TogetherPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8">
        <header className="relative mb-8 text-center">
          {/* 全站唯一一个原本没有返回键的二级页：没有它就只能靠浏览器后退 */}
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="返回"
            className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-[10px] tracking-[0.4em] text-slate-400/80">TOGETHER</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-wide text-slate-100">together</h1>
        </header>

        <div className="space-y-3">
          {BLOCKS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => navigate(b.to)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-300 transition group-hover:scale-105">
                <b.icon className="h-7 w-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium tracking-wide text-slate-100">{b.label}</span>
                <span className="mt-1 block text-[11px] text-slate-400">{b.hint}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { ChefHat, Headphones, BookOpen, ChevronRight, Beer, Gamepad2, type LucideIcon } from 'lucide-react';
import { StarBackdrop } from './StarBackdrop';
import { VinylPlayer } from './VinylPlayer';
import { Bookshelf } from './Bookshelf';

function SectionTitle({ eyebrow, icon: Icon }: { eyebrow: string; icon: LucideIcon }) {
  return (
    <div className="mb-3 flex items-center justify-center gap-2 text-center">
      <Icon className="h-4 w-4 text-slate-400" />
      <p className="text-[10px] tracking-[0.35em] text-slate-400/80">{eyebrow}</p>
    </div>
  );
}

function EntryCard({ label, hint, icon: Icon, onClick }: { label: string; hint: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.08]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-amber-300 transition group-hover:scale-105">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

/**
 * 星空主页：上方「一起听」双头像播放器（占位），下方「一起读」书架。
 * 食谱 / 甜品小屋收成底部小入口。
 */
export function StarrySkyPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />

      <div className="relative mx-auto w-full max-w-md px-4 py-6">
        {/* 一起听 + 一起读：竖排 */}
        <div className="space-y-8">
          <section>
            <button
              type="button"
              onClick={() => navigate('/listen')}
              title="进入一起听"
              className="mx-auto mb-3 flex items-center justify-center gap-2 text-center transition hover:opacity-70"
            >
              <Headphones className="h-4 w-4 text-slate-400" />
              <p className="text-[10px] tracking-[0.35em] text-slate-400/80">LISTEN</p>
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            </button>
            <VinylPlayer />
          </section>

          <section>
            <SectionTitle eyebrow="READ" icon={BookOpen} />
            <Bookshelf />
          </section>

          <section>
            <SectionTitle eyebrow="PLAY" icon={Gamepad2} />
            <div className="grid grid-cols-2 gap-3">
              <EntryCard label="今天吃什么" hint="正餐 · 甜品 · 抽盲盒" icon={ChefHat} onClick={() => navigate('/food')} />
              <EntryCard label="酒馆" hint="角色扮演 · 进入聊天" icon={Beer} onClick={() => navigate('/tavern')} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

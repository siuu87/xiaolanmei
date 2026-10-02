import { useNavigate } from 'react-router-dom';
import { ChefHat, Cake, Headphones, BookOpen, type LucideIcon } from 'lucide-react';
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

      <div className="relative mx-auto w-full max-w-md px-4 pt-6 pb-10 md:max-w-3xl lg:max-w-5xl">
        {/* 一起听 + 一起读：手机竖排，平板/电脑并排 */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:items-start">
          <section>
            <SectionTitle eyebrow="LISTEN" icon={Headphones} />
            <VinylPlayer />
          </section>

          <section>
            <SectionTitle eyebrow="READ" icon={BookOpen} />
            <Bookshelf />
          </section>
        </div>

        {/* 其它小入口：卡片式 */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:max-w-md">
          <EntryCard label="食谱" hint="点菜 · 看食材用量" icon={ChefHat} onClick={() => navigate('/cookbook')} />
          <EntryCard label="甜品小屋" hint="按品类挑甜品" icon={Cake} onClick={() => navigate('/dessert')} />
        </div>
      </div>
    </div>
  );
}

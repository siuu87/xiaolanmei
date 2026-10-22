import { useNavigate } from 'react-router-dom';
import { ChefHat, Headphones, BookOpen, ChevronRight, Beer, Gamepad2, Tv, type LucideIcon } from 'lucide-react';
import { StarBackdrop } from './StarBackdrop';
import { VinylPlayer } from './VinylPlayer';
import { Bookshelf } from './Bookshelf';
import { WatchlistTV } from './WatchlistTV';

function SectionTitle({ eyebrow, icon: Icon }: { eyebrow: string; icon: LucideIcon }) {
  return (
    <div className="mb-3 flex items-center justify-center gap-2 text-center">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="text-[10px] tracking-[0.35em] text-muted-foreground">{eyebrow}</p>
    </div>
  );
}

function EntryCard({ label, hint, icon: Icon, onClick }: { label: string; hint: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="paper-card group flex flex-col items-start gap-2.5 p-4 text-left transition hover:border-gold/30"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold transition group-hover:scale-105">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
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
    <div className="relative min-h-full bg-page-bg text-foreground">
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
              <Headphones className="h-4 w-4 text-muted-foreground" />
              <p className="text-[10px] tracking-[0.35em] text-muted-foreground">LISTEN</p>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <VinylPlayer />
          </section>

          <section>
            <SectionTitle eyebrow="READ" icon={BookOpen} />
            <Bookshelf />
          </section>

          <section>
            <SectionTitle eyebrow="WATCH" icon={Tv} />
            <WatchlistTV />
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

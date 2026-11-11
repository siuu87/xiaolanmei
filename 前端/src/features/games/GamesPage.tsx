import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { GAMES } from './gameMeta';

/**
 * 游戏屋首页（/games，2026-11-11）：
 * 顶部一句引导 + 游戏卡片墙。每张卡点进对应对战页。
 * 卡片沿用首页模块卡的 paper-card 视觉语言，左上角色块做区分。
 */
export function GamesPage() {
  const navigate = useNavigate();

  return (
    <PageShell title="游戏屋" eyebrow="GAMES" backTo="/chat">
      {/* 引导语 */}
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-primary/8 px-4 py-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-relaxed text-foreground">
            和 AI 一起玩的小游戏
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            都是本地对战，AI 当对手，不花 token。挑一款开局吧。
          </p>
        </div>
      </div>

      {/* 游戏卡片墙 */}
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g) => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => navigate(`/games/${g.id}`)}
              data-testid={`game-card-${g.id}`}
              className="paper-card group flex flex-col gap-3 p-4 text-left transition active:scale-[0.98] hover:-translate-y-0.5"
            >
              {/* 顶部：图标色块 + 难度星 */}
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${g.accent} ${g.accentText}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
                  {g.en}
                </span>
              </div>

              {/* 名称 + 描述 */}
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-tight text-foreground">{g.name}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {g.desc}
                </p>
              </div>

              {/* 底部：标签 + 进入箭头 */}
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {g.tag}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-muted-foreground/60">
        更多游戏陆续上架 · 想玩什么尽管说
      </p>
    </PageShell>
  );
}

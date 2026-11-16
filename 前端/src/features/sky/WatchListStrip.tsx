/**
 * 片单横滑卡带（2026-11-16）
 *
 * 从「整屏片单浮层」里长出来的一截：播放页银幕下面直接铺一排海报卡，
 * 点一张就把那一部挂到银幕上（片名、海报都跟着换）。
 * 增删改 / 自动检索这些重活仍然留在整屏片单页里 —— 这里右上角「管理」进得去。
 *
 * 卡片的配色跟电视机、片单页共用 `tintOf()`，三处不打架。
 */
import { useEffect, useRef } from 'react';
import { ChevronRight, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIES, tintOf, useWatchListStore, type WatchItem } from './watchListStore';

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
);

export function WatchListStrip({
  currentId,
  onPick,
  onManage,
}: {
  /** 现在挂在银幕上的那一部（高亮） */
  currentId: string | null;
  onPick: (item: WatchItem) => void;
  onManage: () => void;
}) {
  const items = useWatchListStore((s) => s.items);
  const load = useWatchListStore((s) => s.load);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  // 换片后把那部卡滚到视线中间，别让高亮停在屏幕外
  useEffect(() => {
    if (!currentId || !railRef.current) return;
    const el = railRef.current.querySelector<HTMLElement>(`[data-item-id="${currentId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentId]);

  const list = [...items].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <section className="shrink-0">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] tracking-[0.3em] text-watch-dim">片单</span>
        <button
          type="button"
          onClick={onManage}
          data-testid="watch-manage"
          className="flex items-center gap-0.5 text-[10px] text-watch-dim transition hover:text-watch-fg"
        >
          管理 <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {list.length === 0 ? (
        <button
          type="button"
          onClick={onManage}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-watch-capsule py-3 text-[11px] text-watch-dim transition hover:text-watch-fg"
        >
          <Film className="h-3.5 w-3.5" />
          片单还空着 · 去添一部
        </button>
      ) : (
        <div
          ref={railRef}
          data-testid="watch-strip"
          className="scrollbar-none mt-2 flex gap-2.5 overflow-x-auto overscroll-x-contain pb-1"
          style={{ touchAction: 'pan-x' }}
        >
          {list.map((it) => {
            const [c1, c2] = tintOf(it.title);
            const on = it.id === currentId;
            return (
              <button
                key={it.id}
                type="button"
                data-item-id={it.id}
                data-testid="watch-strip-card"
                onClick={() => onPick(it)}
                className={cn(
                  'group relative w-[86px] shrink-0 overflow-hidden rounded-[8px] text-left transition active:scale-[0.97]',
                  on ? 'ring-2 ring-watch-gold' : 'ring-1 ring-white/5 hover:ring-white/15',
                )}
              >
                <span
                  className="relative flex h-[118px] w-full items-center justify-center overflow-hidden p-2"
                  style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}
                >
                  {it.poster ? (
                    <img src={it.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    // 没海报就放首字当封面，别再写一遍片名（下面那行已经有了）
                    <span className="text-[28px] font-light leading-none text-white/55">
                      {it.title.trim().charAt(0) || '影'}
                    </span>
                  )}
                </span>
                <span className="block truncate bg-watch-surface px-1.5 py-1 text-[10px] text-watch-fg">
                  {it.title}
                </span>
                {on && (
                  <span className="absolute left-1 top-1 rounded-[4px] bg-watch-gold px-1 py-[1px] text-[8px] text-watch-bg">
                    放映中
                  </span>
                )}
                <span className="sr-only">{CAT_LABEL[it.category]}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default WatchListStrip;

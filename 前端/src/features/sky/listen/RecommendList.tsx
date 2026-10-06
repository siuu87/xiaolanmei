import { useEffect, useState } from 'react';
import { Plus, Check, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRecommendPlaylist, type PlaylistTab } from './neteaseMcpConnector';

/** 推荐列表：Tab 切换 + 封面/歌名/歌手 + 添加按钮 */
export function RecommendList() {
  const [tabs, setTabs] = useState<PlaylistTab[]>([]);
  const [active, setActive] = useState('daily');
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getRecommendPlaylist().then((list) => {
      setTabs(list);
      if (list.length) setActive(list[0].key);
    });
  }, []);

  const current = tabs.find((t) => t.key === active);

  const toggleAdd = (id: string) => {
    setAdded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-white/10 px-3 pt-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs transition',
              active === t.key ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="max-h-96 overflow-y-auto p-2">
        {current?.tracks.map((track) => {
          const isAdded = added.has(track.id);
          return (
            <div key={track.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-400/70 to-purple-500/70 text-white">
                <Music className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-100">{track.name}</p>
                <p className="truncate text-xs text-slate-400">{track.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleAdd(track.id)}
                aria-label={isAdded ? '已添加' : '添加'}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition',
                  isAdded ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-slate-300 hover:bg-white/20',
                )}
              >
                {isAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
        {!current?.tracks.length && <p className="py-8 text-center text-sm text-slate-500">暂无曲目</p>}
      </div>
    </div>
  );
}

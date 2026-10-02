import { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';

/**
 * 一起听（占位版）：一副耳机 = 两个头像，左耳是 TA、右耳是我。
 * 点击播放，两个头像往中间一靠、碰在一起；再点暂停，各自回到原位。
 * 真实音频源 / 网易云式细节后续再接。
 */
export function VinylPlayer() {
  const meAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';
  const meName = useProfileStore((s) => s.name) || '我';

  const [playing, setPlaying] = useState(false);

  return (
    <div className="space-y-4">
      {/* 两个头像 = 一副耳机的左右单元 */}
      <div className="flex items-center justify-center gap-3">
        <div
          className={cn(
            'flex flex-col items-center gap-1.5 transition-transform duration-500 ease-out',
            playing && 'translate-x-2.5',
          )}
        >
          <span className="text-5xl drop-shadow-lg">{taAvatar}</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">左耳机 · TA</span>
        </div>

        <div
          className={cn(
            'flex flex-col items-center gap-1.5 transition-transform duration-500 ease-out',
            playing && '-translate-x-2.5',
          )}
        >
          <span className="text-5xl drop-shadow-lg">{meAvatar}</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">右耳机 · {meName}</span>
        </div>
      </div>

      {/* 播放 / 暂停 */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? '暂停' : '播放'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-500 active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
      </div>

      <div className="text-center text-[10px] text-slate-500">
        {playing ? '正在一起听 · 占位中' : '点击播放，两个头像碰一下'}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, type Track } from './neteaseMcpConnector';

interface Props {
  track: Track | null;
  playing: boolean;
  progressMs: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
}

type PlayMode = 0 | 1 | 2; // 0 列表循环 / 1 随机 / 2 单曲循环

/** 播放小卡片（淡灰、整体缩小约四分之一）：歌曲信息 + 极细进度条 + 控制行 */
export function PlayerCard({ track, playing, progressMs, onToggle, onPrev, onNext, onSeek }: Props) {
  const [liked, setLiked] = useState(false);
  const [mode, setMode] = useState<PlayMode>(0);
  const duration = track?.durationMs ?? 0;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (progressMs / duration) * 100)) : 0;

  const cycleMode = () => setMode((m) => (((m + 1) % 3) as PlayMode));

  return (
    <div className="rounded-2xl bg-[#E9EAEC] p-2 text-gray-700 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
      {/* 歌曲信息（居中，放大） */}
      <div className="text-center">
        <h2 className="truncate text-lg font-medium text-gray-700">{track?.name ?? '—'}</h2>
        <p className="mt-0.5 truncate text-sm text-gray-400">{track?.artist ?? '暂无曲目'}</p>
      </div>

      {/* 极细进度条（浅灰，随卡片缩细）+ 时间 */}
      <div className="mt-2">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={progressMs}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="播放进度"
          className="player-range player-range--light"
          style={{ background: `linear-gradient(to right, #6B7280 ${pct}%, rgba(0,0,0,0.08) ${pct}%)` }}
        />
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-gray-400">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 控制行（按钮略微放大）：收藏 | 上一曲 | 播放/暂停 | 下一曲 | 循环模式 */}
      <div className="mt-2 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          aria-label={liked ? '取消收藏' : '收藏'}
          className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-black/5"
        >
          <Star className={cn('h-4 w-4 transition', liked ? 'fill-[#ff4d4d] text-[#ff4d4d]' : 'text-gray-400')} />
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="上一曲"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-black/5"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? '暂停' : '播放'}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-white shadow-md transition hover:bg-gray-700 active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="下一曲"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-black/5"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={cycleMode}
          aria-label="循环模式"
          title={mode === 0 ? '列表循环' : mode === 1 ? '随机播放' : '单曲循环'}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-black/5',
            mode !== 0 ? 'text-gray-800' : 'text-gray-400',
          )}
        >
          {mode === 0 ? <Repeat className="h-4 w-4" /> : mode === 1 ? <Shuffle className="h-4 w-4" /> : <Repeat1 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

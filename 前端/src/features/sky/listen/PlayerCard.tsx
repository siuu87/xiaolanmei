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

/** 沉浸式播放区（无外框、悬浮式）：居中歌曲信息 + 极细进度条 + 控制行 */
export function PlayerCard({ track, playing, progressMs, onToggle, onPrev, onNext, onSeek }: Props) {
  const [liked, setLiked] = useState(false);
  const [mode, setMode] = useState<PlayMode>(0);
  const duration = track?.durationMs ?? 0;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (progressMs / duration) * 100)) : 0;

  const cycleMode = () => setMode((m) => (((m + 1) % 3) as PlayMode));

  return (
    <div>
      {/* 歌曲信息（居中） */}
      <div className="text-center">
        <h2 className="truncate text-xl font-semibold tracking-wide text-[#E0E0E0]">{track?.name ?? '—'}</h2>
        <p className="mt-1 truncate text-sm text-[#8A8A8A]">{track?.artist ?? '暂无曲目'}</p>
      </div>

      {/* 极细进度条（发光滑块）+ 时间 */}
      <div className="mt-5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={progressMs}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="播放进度"
          className="player-range"
          style={{ background: `linear-gradient(to right, #D4AF37 ${pct}%, rgba(255,255,255,0.18) ${pct}%)` }}
        />
        <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[#8A8A8A]">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 控制行：收藏 | 上一曲 | 播放/暂停 | 下一曲 | 循环模式 */}
      <div className="mt-5 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          aria-label={liked ? '取消收藏' : '收藏'}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/5"
        >
          <Star className={cn('h-5 w-5 transition', liked ? 'fill-[#ff4d4d] text-[#ff4d4d]' : 'text-[#8A8A8A]')} />
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="上一曲"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#E0E0E0] transition hover:bg-white/5"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? '暂停' : '播放'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#D4AF37] text-black shadow-md transition hover:bg-[#E6C45A] active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="下一曲"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#E0E0E0] transition hover:bg-white/5"
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={cycleMode}
          aria-label="循环模式"
          title={mode === 0 ? '列表循环' : mode === 1 ? '随机播放' : '单曲循环'}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/5',
            mode !== 0 ? 'text-[#D4AF37]' : 'text-[#8A8A8A]',
          )}
        >
          {mode === 0 ? <Repeat className="h-5 w-5" /> : mode === 1 ? <Shuffle className="h-5 w-5" /> : <Repeat1 className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

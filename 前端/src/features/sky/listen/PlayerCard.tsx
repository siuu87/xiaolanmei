import { useState } from 'react';
import { Heart, HeartHandshake, Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
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
  onAiPick: () => void;
  aiPicking: boolean;
}

/** 沉浸式播放区（无外框、悬浮式）：歌名/歌手 + 极细进度条 + 控制行 */
export function PlayerCard({ track, playing, progressMs, onToggle, onPrev, onNext, onSeek, onAiPick, aiPicking }: Props) {
  const [liked, setLiked] = useState(false);
  const duration = track?.durationMs ?? 0;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (progressMs / duration) * 100)) : 0;

  return (
    <div>
      {/* 歌名 + 歌手 */}
      <div className="text-center">
        <h2 className="truncate text-xl font-bold text-[#E0E0E0]">{track?.name ?? '—'}</h2>
        <p className="mt-1 truncate text-sm text-[#8A8A8A]">{track?.artist ?? '暂无曲目'}</p>
      </div>

      {/* 极细进度条（发光滑块）+ 时间 */}
      <div className="mt-4">
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

      {/* 控制行：红心 | 上一曲 | 播放/暂停 | 下一曲 | AI 选歌（双爱心） */}
      <div className="mt-4 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          aria-label={liked ? '取消喜欢' : '喜欢'}
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/5"
        >
          <Heart className={cn('h-5 w-5 transition', liked ? 'fill-[#ec4141] text-[#ec4141]' : 'text-[#8A8A8A]')} />
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
          onClick={onAiPick}
          disabled={aiPicking}
          aria-label="AI 选歌"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-60"
        >
          {aiPicking ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartHandshake className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
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

/** 核心播放卡片（极简玻璃拟态）：歌名 + 歌手 + 进度条 + 播放控制 */
export function PlayerCard({ track, playing, progressMs, onToggle, onPrev, onNext, onSeek }: Props) {
  const duration = track?.durationMs ?? 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-7 shadow-[0_8px_32px_rgba(0,0,0,0.37)] ring-1 ring-white/5 backdrop-blur-xl">
      {/* 歌名 + 歌手 */}
      <div className="text-center">
        <h2 className="truncate text-2xl font-bold tracking-tight text-slate-50">{track?.name ?? '—'}</h2>
        <p className="mt-1.5 truncate text-sm text-slate-400">{track?.artist ?? '暂无曲目'}</p>
      </div>

      {/* 进度条 */}
      <div className="mt-6">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={progressMs}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="播放进度"
          className="w-full cursor-pointer accent-rose-400"
        />
        <div className="mt-2 flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 播放控制 */}
      <div className="mt-5 flex items-center justify-center gap-8">
        <button
          type="button"
          onClick={onPrev}
          aria-label="上一曲"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-slate-200 ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? '暂停' : '播放'}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-400 text-white shadow-lg transition hover:scale-105 active:scale-95"
        >
          {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-1 h-6 w-6" />}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="下一曲"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-slate-200 ring-1 ring-white/15 transition hover:bg-white/20 active:scale-95"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

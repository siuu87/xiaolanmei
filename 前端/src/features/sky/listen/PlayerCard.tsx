import { Play, Pause, SkipBack, SkipForward, MessageCircle, Share2, SlidersHorizontal, Music } from 'lucide-react';
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

/** 核心播放卡片：毛玻璃质感，封面 + 曲名 + 进度条 + 播放控制 + 副功能占位 */
export function PlayerCard({ track, playing, progressMs, onToggle, onPrev, onNext, onSeek }: Props) {
  const duration = track?.durationMs ?? 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {/* 封面 */}
      <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400/80 to-purple-600/80 shadow-lg">
        <Music className="h-16 w-16 text-white/80" />
      </div>

      {/* 曲名 / 歌手 / 专辑 */}
      <div className="mt-5 text-center">
        <h2 className="truncate text-lg font-semibold text-slate-100">{track?.name ?? '—'}</h2>
        <p className="mt-1 truncate text-sm text-slate-400">{track ? `${track.artist} · ${track.album}` : '暂无曲目'}</p>
      </div>

      {/* 进度条 */}
      <div className="mt-5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={progressMs}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="播放进度"
          className="w-full cursor-pointer accent-rose-400"
        />
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 播放控制 */}
      <div className="mt-4 flex items-center justify-center gap-6">
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
          {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
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

      {/* 副功能占位：评论 / 分享 / 音效 */}
      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          title="评论"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-400 transition hover:bg-white/15 hover:text-slate-200"
        >
          <MessageCircle className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="分享"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-400 transition hover:bg-white/15 hover:text-slate-200"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="音效"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-400 transition hover:bg-white/15 hover:text-slate-200"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

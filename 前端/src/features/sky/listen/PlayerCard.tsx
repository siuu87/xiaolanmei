import { useState } from 'react';
import { Headphones, Heart, HeartHandshake, Loader2, Pause, Play, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, type Track } from './neteaseMcpConnector';

interface Props {
  track: Track | null;
  playing: boolean;
  progressMs: number;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onAiPick: () => void;
  aiPicking: boolean;
}

/** 核心播放卡片（黑金配色、紧凑布局）：歌名/歌手 + 进度条 + 一起听 + 控制行 */
export function PlayerCard({ track, playing, progressMs, onToggle, onSeek, onAiPick, aiPicking }: Props) {
  const [liked, setLiked] = useState(false);
  const duration = track?.durationMs ?? 0;

  return (
    <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#121212] px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
      {/* 歌名 + 歌手（进度条左上角）+ 时长 */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[#E0E0E0]">
          {track?.name ?? '—'}
          <span className="ml-1.5 font-normal text-[#8A8A8A]">· {track?.artist ?? '暂无曲目'}</span>
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-[#8A8A8A]">
          {formatTime(progressMs)} / {formatTime(duration)}
        </span>
      </div>

      {/* 进度条 */}
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={progressMs}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="播放进度"
        className="mt-2 w-full cursor-pointer accent-[#D4AF37]"
      />

      {/* 一起听：两个头像连着一只耳机 */}
      <div className="mt-3 flex flex-col items-center gap-1">
        <div className="flex items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#E6C45A] to-[#B8860B] ring-1 ring-[#D4AF37]/40">
            <UserRound className="h-4 w-4 text-black" />
          </div>
          <span className="mx-1 h-px w-5 bg-[#D4AF37]/50" />
          <Headphones className="h-5 w-5 text-[#D4AF37]" />
          <span className="mx-1 h-px w-5 bg-[#D4AF37]/50" />
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8a6a1f] to-[#3c2f0d] ring-1 ring-[#D4AF37]/40">
            <UserRound className="h-4 w-4 text-[#E6C45A]" />
          </div>
        </div>
        <span className="text-[10px] text-[#8A8A8A]">一起听</span>
      </div>

      {/* 控制行：红心 | 播放 | AI 选歌（双爱心） */}
      <div className="mt-3 flex items-center justify-center gap-7">
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
          onClick={onToggle}
          aria-label={playing ? '暂停' : '播放'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#D4AF37] text-black shadow-md transition hover:bg-[#E6C45A] active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
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

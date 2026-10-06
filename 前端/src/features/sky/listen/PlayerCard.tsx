import { useState } from 'react';
import { Heart, HeartHandshake, Loader2, Pause, Play, SkipBack, SkipForward, UserRound } from 'lucide-react';
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

/** 沉浸式播放区（无外框、悬浮式）：歌名/歌手 + 极细进度条 + 一起听 + 控制行 */
export function PlayerCard({ track, playing, progressMs, onToggle, onPrev, onNext, onSeek, onAiPick, aiPicking }: Props) {
  const [liked, setLiked] = useState(false);
  const duration = track?.durationMs ?? 0;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (progressMs / duration) * 100)) : 0;

  return (
    <div>
      {/* 歌名 + 歌手（进度条左上角，左对齐）+ 时长 */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-base font-semibold text-[#E0E0E0]">
          {track?.name ?? '—'}
          <span className="ml-1.5 text-sm font-normal text-[#8A8A8A]">· {track?.artist ?? '暂无曲目'}</span>
        </p>
        <span className="shrink-0 text-[10px] tabular-nums text-[#8A8A8A]">
          {formatTime(progressMs)} / {formatTime(duration)}
        </span>
      </div>

      {/* 极细进度条（发光滑块） */}
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={progressMs}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="播放进度"
        className="player-range mt-2"
        style={{ background: `linear-gradient(to right, #D4AF37 ${pct}%, rgba(255,255,255,0.18) ${pct}%)` }}
      />

      {/* 一起听（两个头像 + 中间带圈的连接线，对齐上下方切歌键） */}
      <div className="relative mt-3 grid grid-cols-5 items-center">
        {/* 连接线 + 中间圆圈 */}
        <div className="pointer-events-none absolute left-[30%] right-[30%] top-1/2 h-px -translate-y-1/2 bg-[#D4AF37]/40" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D4AF37] bg-black shadow-[0_0_6px_rgba(212,175,55,0.6)]" />
        <div />
        <div className="flex justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#E6C45A] to-[#B8860B] ring-1 ring-[#D4AF37]/40">
            <UserRound className="h-4 w-4 text-black" />
          </div>
        </div>
        <div />
        <div className="flex justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8a6a1f] to-[#3c2f0d] ring-1 ring-[#D4AF37]/40">
            <UserRound className="h-4 w-4 text-[#E6C45A]" />
          </div>
        </div>
        <div />
      </div>

      {/* 控制行：红心 | 上一曲 | 播放/暂停 | 下一曲 | AI 选歌（与头像对齐） */}
      <div className="mt-1.5 grid grid-cols-5 items-center">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setLiked((v) => !v)}
            aria-label={liked ? '取消喜欢' : '喜欢'}
            className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/5"
          >
            <Heart className={cn('h-5 w-5 transition', liked ? 'fill-[#ec4141] text-[#ec4141]' : 'text-[#8A8A8A]')} />
          </button>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onPrev}
            aria-label="上一曲"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#E0E0E0] transition hover:bg-white/5"
          >
            <SkipBack className="h-5 w-5" />
          </button>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? '暂停' : '播放'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#D4AF37] text-black shadow-md transition hover:bg-[#E6C45A] active:scale-95"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onNext}
            aria-label="下一曲"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#E0E0E0] transition hover:bg-white/5"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>
        <div className="flex justify-center">
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
    </div>
  );
}

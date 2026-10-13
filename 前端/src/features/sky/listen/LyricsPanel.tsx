import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatTime, type LyricLine } from './neteaseMcpConnector';

interface Props {
  progressMs: number;
  lines: LyricLine[];
  /** 传入即开启「拖歌词调进度」（网易云那套）：上下拖动 → 松手 seek 到目标行的时间点 */
  onSeek?: (ms: number) => void;
}

/** 每行固定高度（主行 24px + 译文 20px）。行高恒定，「第 3 行 = 当前行」才成立 */
const ROW_H = 44;
/** 可视 5 行，当前行固定坐在正中那一格 */
const VISIBLE = 5;
const CENTER = Math.floor(VISIBLE / 2); // 2 → 第 3 行

/**
 * 歌词面板（网易云式滚动窗口）：
 * - 一屏 5 行，当前行**恒定落在第 3 行（正中）**，靠 translateY 滚动整条轨道实现，
 *   而不是丢进滚动容器里 —— 滚动容器没法保证「当前行正好在第 3 行」。
 * - 播放推进时整条轨道带 300ms 过渡平滑上移；拖动时去掉过渡，跟手。
 * - 上下拖动 = 调进度：按住起手，按 `Δy / ROW_H` 折算成行的位移，松手 seek 到
 *   目标行的 timeMs；拖动中右侧出一根进度轨 + 圆点 + 目标时间。
 * - `touch-none` 是必需的：不加的话竖直拖会被浏览器当成页面滚动吃掉。
 */
export function LyricsPanel({ progressMs, lines, onSeek }: Props) {
  const [drag, setDrag] = useState<{ startY: number; startIdx: number; idx: number } | null>(null);

  // 当前行：最后一条 timeMs <= progressMs 的行
  const activeIdx = lines.reduce((acc, line, i) => (line.timeMs <= progressMs ? i : acc), 0);
  const displayIdx = drag ? drag.idx : activeIdx;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek || lines.length === 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ startY: e.clientY, startIdx: activeIdx, idx: activeIdx });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    // 往上拖 = 往后走：行位移取整，行号按「起手时的当前行」换算，避免累积漂移
    const rows = Math.round((drag.startY - e.clientY) / ROW_H);
    const idx = Math.min(lines.length - 1, Math.max(0, drag.startIdx + rows));
    if (idx !== drag.idx) setDrag({ ...drag, idx });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.idx !== activeIdx) onSeek?.(lines[drag.idx].timeMs);
    setDrag(null);
  };

  if (lines.length === 0) {
    return <p className="py-4 text-center text-sm text-[#8A8A8A]">暂无歌词</p>;
  }

  const offset = -(displayIdx - CENTER) * ROW_H;
  const targetMs = lines[displayIdx]?.timeMs ?? 0;
  const pct = lines.length > 1 ? (displayIdx / (lines.length - 1)) * 100 : 0;

  return (
    <div
      data-testid="lyrics-panel"
      data-active-idx={displayIdx}
      data-dragging={drag ? '1' : '0'}
      aria-label="歌词，上下拖动可调节播放进度"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'relative select-none overflow-hidden touch-none',
        onSeek && 'cursor-ns-resize',
      )}
      style={{ height: VISIBLE * ROW_H }}
    >
      {/* 整条轨道：当前行被推到正中那一格 */}
      <div
        data-testid="lyrics-track"
        className={cn('absolute inset-x-0 top-0', !drag && 'transition-transform duration-300 ease-out')}
        style={{ transform: `translate3d(0, ${offset}px, 0)` }}
      >
        {lines.map((line, i) => {
          const on = i === displayIdx;
          return (
            <div
              key={i}
              data-idx={i}
              data-testid={`lyric-row-${i}`}
              className={cn(
                'flex flex-col items-center justify-center text-center',
                on ? 'text-[#D4AF37]' : 'text-[#8A8A8A]',
              )}
              style={{ height: ROW_H }}
            >
              <p className={cn('text-sm leading-6', on && 'font-medium')}>{line.text}</p>
              {line.translation && (
                <p className={cn('text-xs leading-5', on ? 'text-[#D4AF37]/70' : 'text-[#8A8A8A]/70')}>
                  {line.translation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 拖动中：右侧进度轨 + 圆点 + 目标时间（对标网易云的「拖歌词调歌曲」） */}
      {drag && (
        <div
          data-testid="lyrics-scrub"
          className="pointer-events-none absolute bottom-4 right-1.5 top-4 w-px rounded-full bg-white/15"
        >
          <div
            data-testid="lyrics-scrub-knob"
            className="absolute -left-[4px] h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.6)]"
            style={{ top: `${pct}%` }}
          >
            <span
              data-testid="lyrics-scrub-time"
              className="absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap text-[10px] tabular-nums text-[#D4AF37]"
            >
              {formatTime(targetMs)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

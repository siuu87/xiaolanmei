import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LyricLine } from './neteaseMcpConnector';

interface Props {
  progressMs: number;
  lines: LyricLine[];
}

/** 歌词面板：多行歌词、当前行高亮、双语占位、可滚动 */
export function LyricsPanel({ progressMs, lines }: Props) {
  const activeRef = useRef<HTMLDivElement>(null);

  // 当前高亮行：最后一条 timeMs <= progressMs 的行
  const activeIdx = lines.reduce((acc, line, i) => (line.timeMs <= progressMs ? i : acc), 0);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (lines.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-slate-500 backdrop-blur-sm">
        暂无歌词
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {lines.map((line, i) => (
          <div
            key={i}
            ref={i === activeIdx ? activeRef : undefined}
            className={cn('transition-colors duration-300', i === activeIdx ? 'text-slate-100' : 'text-slate-500')}
          >
            <p className={cn('text-sm leading-6', i === activeIdx && 'font-medium')}>{line.text}</p>
            {line.translation && <p className="text-xs leading-5 text-slate-500/80">{line.translation}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

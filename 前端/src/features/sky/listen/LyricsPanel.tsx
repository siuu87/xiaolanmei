import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LyricLine } from './neteaseMcpConnector';

interface Props {
  progressMs: number;
  lines: LyricLine[];
}

/** 歌词面板：只显示 2-3 句、随进度滚动并高亮当前句（无点击分析） */
export function LyricsPanel({ progressMs, lines }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // 当前高亮行：最后一条 timeMs <= progressMs 的行
  const activeIdx = lines.reduce((acc, line, i) => (line.timeMs <= progressMs ? i : acc), 0);

  // 当前句滚动到居中位置
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (lines.length === 0) {
    return <p className="py-4 text-center text-sm text-[#8A8A8A]">暂无歌词</p>;
  }

  return (
    <div
      ref={listRef}
      className="h-24 space-y-1 overflow-y-auto px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {lines.map((line, i) => (
        <div
          key={i}
          data-idx={i}
          className={cn(
            'text-center transition-colors duration-300',
            i === activeIdx ? 'text-[#D4AF37]' : 'text-[#8A8A8A]',
          )}
        >
          <p className={cn('text-sm leading-6', i === activeIdx && 'font-medium')}>{line.text}</p>
          {line.translation && (
            <p className={cn('text-xs leading-5', i === activeIdx ? 'text-[#D4AF37]/70' : 'text-[#8A8A8A]/70')}>
              {line.translation}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

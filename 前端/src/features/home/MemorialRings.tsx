import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMemorialStore, dayStatus, type MemorialDay } from './memorialStore';

/**
 * 纪念日圆环倒数排（2026-11-18 三十四改，参考小红书「Nid douillet」的
 * 「116 DAYS TOGETHER + 四个圆环倒数」）：
 *
 * 首页刊头下面的一排小圆环——每条纪念日一个圈，圈里是「还差几天」，
 * 下面挂日期和名字；快到的排在前面，正好就是今天的那个圈反色高亮。
 * 点击整排任意一个圈 → /memorial 去管理。
 *
 * 挑选规则：只显示「今天 + 未来」的倒数（不重复且已经过去的不翻出来），
 * 最多 5 个；一条都不剩时整排不渲染，不留空壳。
 */

interface Ring {
  day: MemorialDay;
  kind: 'today' | 'future';
  count: number;
}

const MAX_RINGS = 5;

export function MemorialRings() {
  const navigate = useNavigate();
  const days = useMemorialStore((s) => s.days);
  const loaded = useMemorialStore((s) => s.loaded);
  const load = useMemorialStore((s) => s.load);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const rings = useMemo<Ring[]>(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const out: Ring[] = [];
    for (const day of days) {
      const st = dayStatus(day, today);
      if (st.kind === 'today') out.push({ day, kind: 'today', count: 0 });
      else if (st.kind === 'future') out.push({ day, kind: 'future', count: st.count });
      // past（不重复且已过）不进倒数排
    }
    // 今天的最前，其余按剩的天数升序
    return out
      .sort((a, b) => (a.kind === 'today' ? -1 : b.kind === 'today' ? 1 : a.count - b.count))
      .slice(0, MAX_RINGS);
  }, [days]);

  if (rings.length === 0) return null;

  return (
    <div
      data-testid="memorial-rings"
      className="rise-in mt-4 flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {rings.map(({ day, kind, count }) => (
        <button
          key={day.id}
          type="button"
          onClick={() => navigate('/memorial')}
          data-testid={`memorial-ring-${day.id}`}
          title={day.title}
          className="flex w-[64px] shrink-0 flex-col items-center gap-1"
        >
          {/* 圈：今天反色高亮，其余细描边 */}
          <span
            className={
              kind === 'today'
                ? 'flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full bg-foreground text-background'
                : 'flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border-[1.5px] border-foreground/35 text-foreground'
            }
          >
            <span className="font-serif text-[20px] font-semibold leading-none tabular-nums">
              {count}
            </span>
            <span className="mt-0.5 text-[8.5px] leading-none opacity-75">
              {kind === 'today' ? '就是今天' : '天'}
            </span>
          </span>
          {/* 日期 + 名字 */}
          <span className="text-[9.5px] tabular-nums leading-tight text-muted-foreground">
            {(() => {
              const [, m, d] = day.date.split('-').map(Number);
              return `${m}.${d}`;
            })()}
          </span>
          <span className="line-clamp-1 w-full text-center text-[10px] leading-tight text-foreground/85">
            {day.title}
          </span>
        </button>
      ))}
    </div>
  );
}

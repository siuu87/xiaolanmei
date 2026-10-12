/**
 * MOOD · 今日心情（首页，日历上方）
 *
 * 这里是**唯一**能填心情的地方，而且**只填我自己**：
 * AI 的心情不在这里出现——它由系统在一天里随机挑个时刻自动抓一次（aiMood.ts），
 * 抓到之后直接落到当天记录里，要去日历拓展页点开那一天才看得到（「心情」那一行两个人的图标）。
 *
 * 只有三种心情，图案就是这套弧线：高兴（上扬·黄）/ 平静（水平·绿）/ 难过（下弯·蓝）。
 * 填完日历上当天就会多出对应颜色的圆点。
 *
 * 单选语义：再点一次同一项 = 取消，回到「还没告诉我」。
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOODS, moodInfo, useMoodStore, todayKey, type MoodKey } from './moodStore';

const DEFAULT_TITLE = 'MOOD · 今天的心情还没告诉我';

function MoodRow({
  who,
  value,
  onPick,
}: {
  who: '我' | 'AI';
  value?: MoodKey;
  onPick: (m: MoodKey | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[11px] text-[#8b93a8]">{who}</span>
      <div className="flex flex-1 items-center justify-around">
        {MOODS.map((m) => {
          const on = value === m.key;
          return (
            <motion.button
              key={m.key}
              type="button"
              onClick={() => onPick(on ? null : m.key)}
              aria-label={`${who}的心情：${m.label}`}
              aria-pressed={on}
              title={m.label}
              whileTap={{ scale: 0.92 }}
              animate={{ scale: on ? 1.06 : 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 20, mass: 0.6 }}
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-full',
                'border transition-colors duration-300',
                on
                  ? 'border-white/25 bg-white/[0.06]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15',
              )}
            >
              {/* 选中时的柔和淡光晕 */}
              <AnimatePresence>
                {on && (
                  <motion.span
                    key="halo"
                    aria-hidden
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.32, ease: 'easeOut' }}
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{
                      boxShadow: `0 0 18px 4px ${m.color}55, inset 0 0 12px ${m.color}22`,
                    }}
                  />
                )}
              </AnimatePresence>

              <svg
                viewBox="0 0 32 32"
                className={cn('h-6 w-6 transition-colors duration-300', on ? '' : 'opacity-70')}
                fill="none"
                stroke={on ? m.color : '#9aa3b8'}
                strokeWidth={2.2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d={m.path} />
              </svg>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function MoodCard() {
  const days = useMoodStore((s) => s.days);
  const load = useMoodStore((s) => s.load);
  const setMood = useMoodStore((s) => s.setMood);

  useEffect(() => {
    load();
  }, [load]);

  const key = todayKey();
  const day = days[key] ?? {};
  const mine = moodInfo(day.me);
  const title = mine ? `MOOD · 我的心情：${mine.label}` : DEFAULT_TITLE;

  return (
    <div className="px-1 py-1">
      {/* 标题：纤细衬线 + 浅灰白 */}
      <p className={cn('font-serif font-light tracking-wide text-[#c9cede]', 'text-[13px] sm:text-sm')}>
        {title}
      </p>

      <div className="mt-3">
        <MoodRow who="我" value={day.me} onPick={(m) => setMood(key, 'me', m)} />
      </div>
    </div>
  );
}

export default MoodCard;

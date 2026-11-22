import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * 小风铃（2026-11-20：用户要求把信封侧面的挂链改成小风铃）
 *
 * 上一版是「细绳吊坠」：一根绳吊着一枚坠子（月牙/星/钥匙/铃，点一下换一枚）。
 * 现在整枚挂件改成**小风铃**：顶部挂环 + 细绳 + 顶帽，下面挂三根长短不一的
 * 风铃管，最中间那根底下带一片小风帆 —— 挂在信封侧面，像一串真的风铃。
 *
 * 互动照旧（用户要的「碰一下有反馈」）：
 *   ① 被碰响了整串风铃摆起来（钟摆式衰减，`transform-origin` 钉在挂环上）；
 *   ② 散出三颗小星，像几根管子叮叮当当响。
 *
 * 不写字、不弹层：这格只有 32px 宽，一句话要么压到信封上，要么溢出到礼盒上。
 * 摆动 + 星点已经把「叮」说清楚了。
 */

export function WindChime({ className = '' }: { className?: string }) {
  const [swing, setSwing] = useState(0);
  const [sparking, setSparking] = useState(false);
  const timer = useRef<number | null>(null);

  const onTap = useCallback(() => {
    // 每点一次换 key 重播一遍摆动；星点 0.7 秒后没了
    setSwing((t) => t + 1);
    setSparking(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSparking(false), 760);
  }, []);

  return (
    // 这里不写 relative：Tailwind 里 relative 排在 absolute 之后，后写的赢，外面传的 absolute 会被它按死（2026-11-18 晚踩过）。定位只给 inner 的 button，星点挂在它里面。
    <div
      className={`flex h-[58px] w-[32px] items-start justify-center ${className}`}
    >
      <button
        type="button"
        onClick={onTap}
        data-testid="wind-chime"
        aria-label="碰一下这个小风铃"
        title="碰一下"
        className="relative block h-full w-full text-muted-foreground/70 transition-colors duration-300 hover:text-muted-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {/* 摆动：每点一次换 key 重播一遍，`transform-origin` 钉在挂环上 ——
            钉在中间就会像原地打转，不像挂着的东西 */}
        <motion.svg
          key={swing}
          viewBox="0 0 24 44"
          className="h-full w-full"
          fill="none"
          aria-hidden
          initial={{ rotate: 0 }}
          animate={{ rotate: [0, -15, 11, -7, 4, 0] }}
          transition={{ duration: 1.15, ease: 'easeOut' }}
          style={{ transformOrigin: '50% 9%' }}
        >
          {/* 挂环 + 细绳 + 顶帽：不换，永远这一套 */}
          <circle cx="12" cy="5.5" r="2.4" stroke="currentColor" strokeWidth="1" />
          <path d="M12 7.9 V14.5" stroke="currentColor" strokeWidth="0.9" strokeOpacity="0.32" strokeLinecap="round" />
          <path d="M7 14.5 H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />

          {/* 三根风铃管：长短不一，管底各坠一颗小球（被碰响的就是它们） */}
          <path d="M8.4 14.5 V27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8.4" cy="28.5" r="1.5" fill="currentColor" fillOpacity="0.75" />

          <path d="M12 14.5 V34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="35.5" r="1.6" fill="currentColor" fillOpacity="0.75" />

          <path d="M15.6 14.5 V24.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="15.6" cy="26" r="1.5" fill="currentColor" fillOpacity="0.75" />

          {/* 中管底下的小风帆：受风的那片叶，让这一串像真的风铃 */}
          <path
            d="M12 37 C 10 38.8 10 41 12 42.5 C 14 41 14 38.8 12 37 Z"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </motion.svg>

        {/* 三颗小星：被碰响了才冒出来，0.7 秒后没了 */}
        <AnimatePresence>
          {sparking && (
            <>
              {[
                { x: -9, y: -12, d: 0 },
                { x: 1, y: -16, d: 0.08 },
                { x: 10, y: -10, d: 0.16 },
              ].map((s, i) => (
                <motion.span
                  key={i}
                  className="pointer-events-none absolute left-1/2 top-[38%] h-[2px] w-[2px] rounded-full bg-current"
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 0.9, 0], x: s.x, y: s.y, scale: [0.6, 1, 0.4] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.66, delay: s.d, ease: 'easeOut' }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}

export default WindChime;

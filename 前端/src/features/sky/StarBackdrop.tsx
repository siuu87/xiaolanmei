import { useMemo } from 'react';

/** 星空背景：深空渐变 + 随机星点（可复现的伪随机），供星空下各功能页复用 */
export function StarBackdrop() {
  const stars = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const r = (i * 9301 + 49297) % 233280 / 233280; // 伪随机 [0,1)
        return {
          left: ((i * 37) % 100) + '%',
          top: (r * 100) + '%',
          size: 1 + ((i * 7) % 3),
          delay: ((i * 13) % 40) / 10,
        };
      }),
    [],
  );

  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,73,150,0.35),_transparent_60%),radial-gradient(ellipse_at_bottom,_rgba(30,20,60,0.5),_transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white/70"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animation: `twinkle 3s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`@keyframes twinkle { 0%,100% { opacity: 0.15; } 50% { opacity: 0.9; } }`}</style>
    </>
  );
}

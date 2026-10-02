import { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';

const NOTES = [
  { left: '6%', top: '18%', ch: '♪', delay: 0, dur: 6 },
  { left: '88%', top: '24%', ch: '♫', delay: 0.9, dur: 7 },
  { left: '12%', top: '62%', ch: '♩', delay: 1.6, dur: 5.5 },
  { left: '84%', top: '58%', ch: '♪', delay: 0.4, dur: 6.5 },
  { left: '48%', top: '6%', ch: '♫', delay: 1.2, dur: 7.5 },
];

const SPARKLES = [
  { left: '20%', top: '12%', delay: 0 },
  { left: '72%', top: '10%', delay: 0.7 },
  { left: '90%', top: '44%', delay: 1.4 },
  { left: '8%', top: '48%', delay: 0.3 },
  { left: '58%', top: '4%', delay: 1.0 },
];

/**
 * 一起听（网易云式暖色插画，占位）：黑胶唱片 + 两个贴靠共享耳机的头像。
 * 左头像戴左耳耳机（一根线向下连到唱片），右头像戴右耳耳机。
 * 点播放：唱片转动、两个头像碰一下、音符亮起；真实音频源后续再接。
 */
export function VinylPlayer() {
  const meAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';
  const meName = useProfileStore((s) => s.name) || '我';

  const [playing, setPlaying] = useState(false);
  const [bumping, setBumping] = useState(false);

  const toggle = () => {
    setPlaying((p) => !p);
    if (!playing) {
      setBumping(true);
      window.setTimeout(() => setBumping(false), 700);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-rose-200/60 bg-gradient-to-b from-[#fff8ee] via-[#ffe9ee] to-[#ffd9e6] p-5 shadow-[inset_0_0_60px_rgba(255,183,197,0.4)]">
      {/* 漂浮音符 */}
      {NOTES.map((n, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'pointer-events-none absolute text-base text-rose-400/80 transition-opacity duration-700',
            playing ? 'opacity-100' : 'opacity-40',
          )}
          style={{ left: n.left, top: n.top, animation: `note-float ${n.dur}s ease-in-out ${n.delay}s infinite` }}
        >
          {n.ch}
        </span>
      ))}
      {/* 光点 */}
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute h-1 w-1 rounded-full bg-rose-300/80"
          style={{ left: s.left, top: s.top, animation: `sparkle 3s ease-in-out ${s.delay}s infinite` }}
        />
      ))}

      {/* 耳机线：从左耳耳机向下连到唱片 */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M 33 24 C 22 32, 18 44, 34 58 S 44 72, 50 74"
          fill="none"
          stroke="#f7a6bd"
          strokeWidth="0.6"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative flex flex-col items-center">
        {/* 两个头像 = 一副耳机 */}
        <div className="flex items-end justify-center">
          {/* 左耳机 · TA */}
          <div
            className={cn(
              'flex flex-col items-center gap-1 transition-transform duration-500 ease-out',
              playing && 'translate-x-1.5',
              bumping && 'animate-[bump-left_0.5s_ease]',
            )}
          >
            <div className="relative flex h-16 w-16 rotate-6 items-center justify-center rounded-full bg-white text-3xl shadow-md ring-2 ring-rose-200/70">
              <span className="drop-shadow-sm">{taAvatar}</span>
              {/* 左耳耳机罩 */}
              <span className="absolute -left-2 -top-1 h-3.5 w-5 rounded-full bg-rose-400 shadow" />
            </div>
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-rose-500">左耳机 · TA</span>
          </div>

          {/* 右耳机 · 我 */}
          <div
            className={cn(
              '-ml-1 flex flex-col items-center gap-1 transition-transform duration-500 ease-out',
              playing && '-translate-x-1.5',
              bumping && 'animate-[bump-right_0.5s_ease]',
            )}
          >
            <div className="relative flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-white text-3xl shadow-md ring-2 ring-rose-200/70">
              <span className="drop-shadow-sm">{meAvatar}</span>
              {/* 右耳耳机罩 */}
              <span className="absolute -right-2 -top-1 h-3.5 w-5 rounded-full bg-rose-400 shadow" />
            </div>
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-rose-500">右耳机 · {meName}</span>
          </div>
        </div>

        {/* 黑胶唱片（旋转）+ 中心播放键 */}
        <div className="relative mt-3 h-44 w-44">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              animation: 'vinyl-spin 12s linear infinite',
              animationPlayState: playing ? 'running' : 'paused',
              background:
                'repeating-radial-gradient(circle at 50% 50%, #1c1c20 0px, #1c1c20 1px, #26262b 1px, #26262b 2px)',
              boxShadow: '0 14px 40px rgba(190,80,110,0.35), 0 0 0 6px rgba(255,255,255,0.55)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#ff9fb0] to-[#e76b84] shadow-inner" />
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? '暂停' : '播放'}
              className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-white text-rose-500 shadow-md transition hover:scale-105 active:scale-95"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="mt-3 text-center text-[11px] text-rose-500/80">
          {playing ? '正在一起听 · 占位中' : '点击播放，两个头像碰一下'}
        </div>
      </div>

      <style>{`
        @keyframes vinyl-spin { to { transform: rotate(360deg); } }
        @keyframes note-float { 0% { transform: translateY(0) scale(0.9); opacity: 0; } 30% { opacity: 0.9; } 100% { transform: translateY(-26px) scale(1.1); opacity: 0; } }
        @keyframes sparkle { 0%, 100% { opacity: 0.15; transform: scale(0.7); } 50% { opacity: 0.9; transform: scale(1.2); } }
        @keyframes bump-left { 0%, 100% { transform: translateX(0); } 45% { transform: translateX(5px); } }
        @keyframes bump-right { 0%, 100% { transform: translateX(0); } 45% { transform: translateX(-5px); } }
      `}</style>
    </div>
  );
}

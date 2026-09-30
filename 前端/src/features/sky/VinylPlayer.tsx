import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Radio, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profileStore';

const NOISES = [
  { key: 'rain', label: '雨声', kind: 'brown' as const, lowpass: 1200 },
  { key: 'white', label: '白噪音', kind: 'white' as const, lowpass: 0 },
  { key: 'pink', label: '粉噪音', kind: 'pink' as const, lowpass: 0 },
  { key: 'brown', label: '棕噪音', kind: 'brown' as const, lowpass: 0 },
];

const STATIONS = [
  { name: 'SomaFM · Groove Salad', url: 'https://ice1.somafm.com/groovesalad-256-mp3' },
  { name: 'SomaFM · Drone Zone', url: 'https://ice1.somafm.com/dronezone-256-mp3' },
  { name: 'Radio Paradise · 主混音', url: 'https://stream.radioparadise.com/mp3-192' },
];

/** 生成一段噪声 AudioBuffer（白/粉/棕） */
function makeNoise(ctx: AudioContext, kind: 'white' | 'pink' | 'brown', seconds = 4): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = rate * seconds;
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      data[i] = (b0 + b1 + b2 + w * 0.5362) * 0.11;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buf;
}

/** 飘浮音符：播放时从唱片四周缓缓升起 */
const FLOAT_NOTES = [
  { left: '5%', top: '58%', ch: '♪', delay: 0, dur: 9 },
  { left: '90%', top: '46%', ch: '♫', delay: 1.2, dur: 11 },
  { left: '15%', top: '14%', ch: '♫', delay: 0.6, dur: 10 },
  { left: '82%', top: '10%', ch: '♪', delay: 2.1, dur: 12 },
  { left: '56%', top: '2%', ch: '♩', delay: 3, dur: 9 },
];

/** 云雾里的星星：与星空背景融合 */
const CLOUD_STARS = [
  { left: '10%', top: '58%', delay: 0 },
  { left: '26%', top: '68%', delay: 0.7 },
  { left: '42%', top: '62%', delay: 1.4 },
  { left: '58%', top: '72%', delay: 0.3 },
  { left: '74%', top: '60%', delay: 1.0 },
  { left: '88%', top: '66%', delay: 1.7 },
  { left: '34%', top: '78%', delay: 0.5 },
  { left: '68%', top: '80%', delay: 1.2 },
];

function FloatingNotes() {
  return (
    <>
      {FLOAT_NOTES.map((n, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute select-none text-lg text-slate-300/50"
          style={{ left: n.left, top: n.top, animation: `note-float ${n.dur}s ease-in ${n.delay}s infinite` }}
        >
          {n.ch}
        </span>
      ))}
      <style>{`@keyframes note-float { 0% { transform: translateY(0) scale(0.9); opacity: 0; } 25% { opacity: 0.7; } 100% { transform: translateY(-90px) scale(1.15); opacity: 0; } }`}</style>
    </>
  );
}

/** 唱臂：右上角为轴，J 形臂向内折；播放贴黑圈、暂停抬起 */
function Tonearm({ playing }: { playing: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute right-0 top-0 z-20 h-full w-full"
      aria-hidden
    >
      <g
        style={{
          transformOrigin: '78px 13px',
          transformBox: 'view-box',
          transform: playing ? 'rotate(0deg)' : 'rotate(-20deg)',
          transition: 'transform 700ms cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* 底座 */}
        <circle cx="78" cy="13" r="5.5" fill="#1e293b" />
        <circle cx="78" cy="13" r="3" fill="#475569" />
        {/* J 形臂（向内折） */}
        <path
          d="M 78 13 L 83 49 L 71 77"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
        {/* 唱针：椭圆米白色 */}
        <ellipse cx="71" cy="77" rx="2.6" ry="1.8" fill="#efe7d6" transform="rotate(113 71 77)" />
      </g>
    </svg>
  );
}

/** 一起听：网易云式黑胶唱片。中心 = 播放/暂停（不转），黑圈（反光）转动，左右滑动换曲，音量跟随系统。 */
export function VinylPlayer() {
  const [mode, setMode] = useState<'noise' | 'radio'>('noise');
  const [noiseKey, setNoiseKey] = useState<string>('rain');
  const [noisePlaying, setNoisePlaying] = useState(false);
  const [station, setStation] = useState<number>(0);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const meAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';

  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const radioRef = useRef<HTMLAudioElement>(null);
  const swipeStartX = useRef<number | null>(null);

  const playing = mode === 'noise' ? noisePlaying : radioPlaying;

  const stopNoise = () => {
    noiseSrcRef.current?.stop();
    noiseSrcRef.current?.disconnect();
    noiseSrcRef.current = null;
    setNoisePlaying(false);
  };

  const pauseRadio = () => {
    radioRef.current?.pause();
    setRadioPlaying(false);
  };

  // 真正开始播放（只在点播放键 / 播放中切歌时调用）
  const startNoise = (key: string) => {
    const preset = NOISES.find((n) => n.key === key);
    if (!preset) return;
    pauseRadio();
    stopNoise();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    const ctx = audioCtxRef.current;
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, preset.kind);
    src.loop = true;
    if (preset.lowpass > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = preset.lowpass;
      src.connect(lp).connect(ctx.destination);
    } else {
      src.connect(ctx.destination);
    }
    src.start();
    noiseSrcRef.current = src;
    setNoiseKey(key);
    setNoisePlaying(true);
  };

  const startRadio = (i: number) => {
    stopNoise();
    setStation(i);
    const el = radioRef.current;
    if (el) {
      el.src = STATIONS[i].url;
      void el.play().catch(() => setRadioPlaying(false));
      setRadioPlaying(true);
    }
  };

  // 选择（只高亮，不自动播放）
  const selectNoise = (key: string) => {
    stopNoise();
    setNoiseKey(key);
  };

  const selectRadio = (i: number) => {
    pauseRadio();
    setStation(i);
  };

  // 中心播放/暂停键
  const toggle = () => {
    if (mode === 'noise') {
      if (noisePlaying) stopNoise();
      else startNoise(noiseKey);
    } else if (radioPlaying) {
      pauseRadio();
    } else {
      startRadio(station);
    }
  };

  // 切歌（上一首 / 下一首 / 左右滑动）
  const nextTrack = () => {
    if (mode === 'noise') {
      const idx = NOISES.findIndex((n) => n.key === noiseKey);
      const key = NOISES[(idx + 1) % NOISES.length].key;
      if (noisePlaying) startNoise(key);
      else setNoiseKey(key);
    } else {
      const i = (station + 1) % STATIONS.length;
      if (radioPlaying) startRadio(i);
      else setStation(i);
    }
  };

  const prevTrack = () => {
    if (mode === 'noise') {
      const idx = NOISES.findIndex((n) => n.key === noiseKey);
      const key = NOISES[(idx - 1 + NOISES.length) % NOISES.length].key;
      if (noisePlaying) startNoise(key);
      else setNoiseKey(key);
    } else {
      const i = (station - 1 + STATIONS.length) % STATIONS.length;
      if (radioPlaying) startRadio(i);
      else setStation(i);
    }
  };

  const switchMode = (m: 'noise' | 'radio') => {
    stopNoise();
    pauseRadio();
    setMode(m);
  };

  useEffect(() => {
    const el = radioRef.current;
    return () => {
      stopNoise();
      el?.pause();
    };
  }, []);

  const nowPlaying = mode === 'noise'
    ? (NOISES.find((n) => n.key === noiseKey)?.label ?? '白噪音')
    : STATIONS[station].name;

  return (
    <div className="space-y-5">
      {/* 一起听：两个人的头像（无圆圈，更贴近） */}
      <div className="flex items-center justify-center gap-0.5">
        <span className="text-2xl leading-none">{taAvatar}</span>
        <span className="text-[11px] leading-none text-rose-300/90">♡</span>
        <span className="text-2xl leading-none">{meAvatar}</span>
      </div>

      {/* 唱片 + 切歌键：中心播放/暂停，两侧/左右滑动切歌 */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={prevTrack}
          aria-label="上一首"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
        >
          <SkipBack className="h-5 w-5" />
        </button>

        <div
          className="relative aspect-square w-full max-w-[180px] touch-pan-y select-none"
          onPointerDown={(e) => {
          swipeStartX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipeStartX.current == null) return;
          const dx = e.clientX - swipeStartX.current;
          swipeStartX.current = null;
          if (Math.abs(dx) > 50) (dx < 0 ? nextTrack() : prevTrack());
        }}
        onPointerCancel={() => {
          swipeStartX.current = null;
        }}
      >
        {/* 光晕（播放时更亮） */}
        <div
          className={cn(
            'pointer-events-none absolute -inset-6 rounded-full blur-2xl transition-opacity duration-700',
            playing ? 'opacity-50' : 'opacity-25',
          )}
          style={{
            background:
              'radial-gradient(circle, rgba(129,140,248,0.55) 0%, rgba(129,140,248,0.18) 45%, transparent 70%)',
          }}
        />
        {playing && <FloatingNotes />}

        {/* 黑圈（转动）：沟槽 + 反光一起转 */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            animation: 'vinyl-spin 12s linear infinite',
            animationPlayState: playing ? 'running' : 'paused',
            background:
              'repeating-radial-gradient(circle at 50% 50%, #0b0b0f 0px, #0b0b0f 1px, #131319 1px, #131319 2px)',
            boxShadow:
              '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), 0 0 90px rgba(129,140,248,0.28), inset 0 0 70px rgba(0,0,0,0.75)',
          }}
        >
          {/* 反光（随黑圈转，转动看得见） */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 210deg, rgba(255,255,255,0.14), transparent 30%, transparent 62%, rgba(255,255,255,0.08), transparent 80%)',
            }}
          />
          {/* 细微划痕（拟物纹理） */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <g fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.4">
              <path d="M 18 32 Q 45 29 72 36" />
              <path d="M 28 74 Q 55 77 80 71" />
              <path d="M 14 54 Q 40 58 62 51" />
              <path d="M 48 14 Q 51 42 47 68" />
              <path d="M 60 18 Q 66 45 62 72" />
            </g>
          </svg>
        </div>

        {/* 内圈（不动）：红底置底，醒目的播放/暂停键浮在红底上方 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="absolute h-[84px] w-[84px] rounded-full bg-gradient-to-br from-[#b8342c] via-[#8c0b08] to-[#5f0704] opacity-80 shadow-[inset_0_0_18px_rgba(0,0,0,0.55),0_0_0_2px_rgba(255,255,255,0.08)]" />
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? '暂停' : '播放'}
            className="pointer-events-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.5),0_0_0_2px_rgba(194,12,12,0.4)] transition-transform active:scale-95"
          >
            {playing ? (
              <Pause className="h-8 w-8 text-[#c20c0c]" />
            ) : (
              <Play className="ml-0.5 h-8 w-8 text-[#c20c0c]" />
            )}
          </button>
        </div>

        {/* 唱臂（J 形臂向内折） */}
        <Tonearm playing={playing} />

        {/* 底部云雾：延伸到左右顶端，上下都柔和（无硬直线） */}
        <div className="pointer-events-none absolute bottom-[-20px] left-1/2 z-10 h-[75%] w-screen -translate-x-1/2">
          <div className="absolute bottom-0 left-0 h-28 w-3/4 rounded-full bg-[#18233d]/45 blur-3xl" />
          <div className="absolute bottom-2 right-0 h-32 w-2/3 rounded-full bg-[#141d33]/50 blur-3xl" />
          <div className="absolute bottom-4 left-1/4 h-24 w-2/3 rounded-full bg-[#1b2743]/40 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-20 w-1/2 rounded-full bg-[#0c1324]/45 blur-3xl" />
          {/* 云雾里的星星 */}
          {CLOUD_STARS.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white/80"
              style={{
                left: s.left,
                top: s.top,
                width: 2,
                height: 2,
                animation: `twinkle 3s ease-in-out ${s.delay}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

        <button
          type="button"
          onClick={nextTrack}
          aria-label="下一首"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>

      {/* 正在播放 */}
      <div className="text-center">
        <div className="truncate px-2 text-sm font-medium text-slate-100">{nowPlaying}</div>
        <div className="mt-0.5 text-xs text-slate-400">
          {playing ? '和 TA 一起听 · 正在播放' : '和 TA 一起听 · 已暂停'}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">点击中心播放 · 两侧按键或左右滑动切歌</div>
      </div>

      {/* 模式切换 */}
      <div className="flex gap-2">
        {(['noise', 'radio'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-sm transition',
              mode === m ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5',
            )}
          >
            {m === 'noise' ? '白噪音' : '背景音乐'}
          </button>
        ))}
      </div>

      {mode === 'noise' ? (
        <div className="flex flex-wrap justify-center gap-2">
          {NOISES.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => selectNoise(n.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs transition',
                noiseKey === n.key ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <audio ref={radioRef} className="hidden" />
          {STATIONS.map((s, i) => (
            <button
              key={s.url}
              type="button"
              onClick={() => selectRadio(i)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition',
                station === i ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              <Radio className={cn('h-4 w-4', station === i && radioPlaying && 'animate-pulse')} />
              {s.name}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes vinyl-spin { to { transform: rotate(360deg); } } @keyframes twinkle { 0%,100% { opacity: 0.2; } 50% { opacity: 0.9; } }`}</style>
    </div>
  );
}

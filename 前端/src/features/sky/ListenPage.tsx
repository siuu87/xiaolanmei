import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBackdrop } from './StarBackdrop';

const NOISES = [
  { key: 'rain', label: '雨声', kind: 'brown' as const, lowpass: 1200 },
  { key: 'white', label: '白噪音', kind: 'white' as const, lowpass: 0 },
  { key: 'pink', label: '粉噪音', kind: 'pink' as const, lowpass: 0 },
  { key: 'brown', label: '棕噪音', kind: 'brown' as const, lowpass: 0 },
];

const STATIONS = [
  { name: 'SomaFM · Groove Salad（氛围电子）', url: 'https://ice1.somafm.com/groovesalad-256-mp3' },
  { name: 'SomaFM · Drone Zone（氛围 Drone）', url: 'https://ice1.somafm.com/dronezone-256-mp3' },
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

/** 一起听：白噪音 + 背景电台 */
export function ListenPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8 md:max-w-2xl">
        <header className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/sky')}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-xs tracking-[0.3em] text-slate-400/80">LISTEN</p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-100">一起听</h1>
          </div>
          <span className="w-8" />
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
          <MusicPanel />
        </div>
      </div>
    </div>
  );
}

function MusicPanel() {
  const [mode, setMode] = useState<'noise' | 'radio'>('noise');
  const [noiseKey, setNoiseKey] = useState<string | null>(null);
  const [station, setStation] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.5);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const radioRef = useRef<HTMLAudioElement>(null);

  const stopNoise = () => {
    noiseSrcRef.current?.stop();
    noiseSrcRef.current?.disconnect();
    noiseSrcRef.current = null;
  };

  const playNoise = (key: string) => {
    const preset = NOISES.find((n) => n.key === key);
    if (!preset) return;
    if (noiseKey === key) {
      stopNoise();
      setNoiseKey(null);
      return;
    }
    stopNoise();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    const ctx = audioCtxRef.current;
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, preset.kind);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    if (preset.lowpass > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = preset.lowpass;
      src.connect(lp).connect(gain).connect(ctx.destination);
    } else {
      src.connect(gain).connect(ctx.destination);
    }
    src.start();
    noiseSrcRef.current = src;
    gainRef.current = gain;
    setNoiseKey(key);
  };

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
    if (radioRef.current) radioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => () => stopNoise(), []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['noise', 'radio'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
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
        <div className="space-y-2">
          {NOISES.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => playNoise(n.key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition',
                noiseKey === n.key ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              {noiseKey === n.key ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {n.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <audio
            ref={radioRef}
            src={station != null ? STATIONS[station].url : undefined}
            controls={false}
            className="hidden"
          />
          {STATIONS.map((s, i) => (
            <button
              key={s.url}
              type="button"
              onClick={() => {
                setStation(i);
                const el = radioRef.current;
                if (el) {
                  el.src = s.url;
                  void el.play();
                }
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition',
                station === i ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              <Radio className={cn('h-4 w-4', station === i && 'animate-pulse')} />
              {s.name}
            </button>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-400">
        音量
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 accent-slate-300"
        />
      </label>
    </div>
  );
}

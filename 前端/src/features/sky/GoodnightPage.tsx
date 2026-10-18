import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Moon,
  ArrowLeft,
  Upload,
  Play,
  Pause,
  Trash2,
  Volume2,
  Wind,
  Clock,
  Music2,
} from 'lucide-react';
import { StarBackdrop } from './StarBackdrop';
import { listSleepAudio, uploadSleepAudio, deleteSleepAudio, type SleepAudioDTO } from '@/lib/api/sleepAudio';

type NoiseType = 'white' | 'pink' | 'brown';

const NOISE_META: Record<NoiseType, { label: string; hint: string }> = {
  white: { label: '白噪音', hint: '均匀沙沙声 · 专注' },
  pink: { label: '粉噪音', hint: '更柔 · 像细雨' },
  brown: { label: '棕噪音', hint: '低沉 · 像远雷海浪' },
};

function formatTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 生成一段可循环的噪音缓冲（2 秒），白/粉/棕三种算法 */
function makeNoiseBuffer(ctx: AudioContext, type: NoiseType): AudioBuffer {
  const seconds = 2;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (type === 'white') {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } else if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

const TIMER_OPTIONS = [15, 30, 45, 60];

export function GoodnightPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState<SleepAudioDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 白噪音
  const [noise, setNoise] = useState<NoiseType | null>(null);
  const [volume, setVolume] = useState(0.5);

  // 睡眠定时器
  const [timerMin, setTimerMin] = useState<number | null>(null);
  const [timerLeft, setTimerLeft] = useState<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef<Partial<Record<NoiseType, AudioBuffer>>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listSleepAudio();
      setItems(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 卸载时停掉所有声音
  useEffect(() => {
    return () => {
      stopAllInternal();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
      gainRef.current = gain;
      audioCtxRef.current = ctx;
    }
    return audioCtxRef.current!;
  }

  const stopNoiseInternal = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
  }, []);

  const stopAllInternal = useCallback(() => {
    stopNoiseInternal();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setNoise(null);
    setPlayingId(null);
  }, [stopNoiseInternal]);

  // 切换某类白噪音（点同一个=停）
  const toggleNoise = useCallback(
    (type: NoiseType) => {
      const ctx = getCtx();
      if (ctx.state === 'suspended') void ctx.resume();

      if (noise === type) {
        // 点当前在播的 -> 停
        stopNoiseInternal();
        setNoise(null);
        return;
      }
      stopNoiseInternal();
      let buf = buffersRef.current[type];
      if (!buf) {
        buf = makeNoiseBuffer(ctx, type);
        buffersRef.current[type] = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gainRef.current!);
      src.start();
      sourceRef.current = src;
      setNoise(type);
    },
    [noise, stopNoiseInternal],
  );

  // 音量实时调节
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选同一文件
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const dto = await uploadSleepAudio(file);
      setItems((prev) => [dto, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const togglePlay = (item: SleepAudioDTO) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === item.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = item.url;
    audio.play().then(
      () => setPlayingId(item.id),
      () => setError('播放失败，可能是格式不支持'),
    );
  };

  const onDelete = async (id: string) => {
    if (!confirm('删除这段哄睡音频？')) return;
    try {
      await deleteSleepAudio(id);
      if (playingId === id) {
        audioRef.current?.pause();
        setPlayingId(null);
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (a && a.duration) setProgress(a.currentTime / a.duration);
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const v = Number(e.target.value);
    a.currentTime = v * a.duration;
    setProgress(v);
  };

  // 睡眠定时器
  const startTimer = (min: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerMin(min);
    setTimerLeft(min * 60);
    timerRef.current = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          stopAllInternal();
          setTimerMin(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerMin(null);
    setTimerLeft(0);
  };

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />
      <div className="relative mx-auto w-full max-w-md px-4 py-8">
        <header className="relative mb-8 text-center">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="返回"
            className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-[10px] tracking-[0.4em] text-slate-400/80">GOODNIGHT</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-wide text-slate-100">
            goodnight
          </h1>
          <p className="mt-1 text-[11px] text-slate-400">哄睡 · 陪睡 · 把今晚交给我</p>
        </header>

        {/* 导入音频 */}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] py-4 text-sm text-slate-300 transition hover:border-white/30 hover:bg-white/[0.06]">
          <Upload className="h-4 w-4" />
          {uploading ? '导入中…' : '导入一段音频（mp3 / wav / ogg / m4a …）'}
          <input type="file" accept="audio/*" className="hidden" onChange={onPickFile} />
        </label>

        {error && <p className="mt-3 text-center text-xs text-rose-400">{error}</p>}

        {/* 已导入音频列表 */}
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <Music2 className="h-3.5 w-3.5" /> 我的哄睡音频
          </h2>

          {loading ? (
            <p className="px-1 text-sm text-slate-500">加载中…</p>
          ) : items.length === 0 ? (
            <p className="px-1 text-sm text-slate-500">还没有导入任何音频，先从上面加一段吧。</p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((it) => {
                const playing = playingId === it.id;
                return (
                  <li
                    key={it.id}
                    data-testid="sleep-audio-item"
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => togglePlay(it)}
                        aria-label={playing ? '暂停' : '播放'}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-amber-300 transition hover:bg-white/20"
                      >
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-100">{it.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatTime(it.duration)} · {(it.size ?? 0) / 1024 / 1024 < 1
                            ? `${Math.round((it.size ?? 0) / 1024)} KB`
                            : `${(it.size ?? 0) / 1024 / 1024 > 0 ? (it.size! / 1024 / 1024).toFixed(1) : 0} MB`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDelete(it.id)}
                        aria-label="删除"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={progress}
                      onChange={seek}
                      disabled={!playing}
                      className="mt-3 w-full accent-amber-300 disabled:opacity-40"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 白噪音生成器 */}
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <Wind className="h-3.5 w-3.5" /> 白噪音
          </h2>
          <div className="space-y-2.5">
            {(Object.keys(NOISE_META) as NoiseType[]).map((t) => {
              const on = noise === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleNoise(t)}
                  data-testid={`noise-${t}`}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                    on
                      ? 'border-amber-300/40 bg-amber-300/10'
                      : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      on ? 'bg-amber-300 text-[#070b1a]' : 'bg-white/10 text-slate-300',
                    )}
                  >
                    <Wind className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-100">{NOISE_META[t].label}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{NOISE_META[t].hint}</span>
                  </span>
                  {on && <span className="text-[11px] text-amber-300">播放中</span>}
                </button>
              );
            })}
          </div>

          {/* 音量 */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <Volume2 className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-amber-300"
              aria-label="音量"
            />
            <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </section>

        {/* 睡眠定时器 */}
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <Clock className="h-3.5 w-3.5" /> 睡眠定时器
          </h2>
          {timerMin ? (
            <div className="flex items-center justify-between rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3">
              <span className="text-sm text-slate-100">
                {timerMin} 分钟后停止 · 剩余 {formatTime(timerLeft)}
              </span>
              <button
                type="button"
                onClick={cancelTimer}
                className="rounded-full px-3 py-1 text-[11px] text-slate-300 transition hover:bg-white/10"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {TIMER_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => startTimer(m)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-slate-200 transition hover:bg-white/[0.1]"
                >
                  {m} 分钟
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 px-0.5 text-[11px] leading-relaxed text-slate-500">
            定时器到点会自动停掉所有声音——安心睡，剩下的交给我。
          </p>
        </section>
      </div>
    </div>
  );
}

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

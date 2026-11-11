import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Volume2,
  Plus,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { useWakeLock } from '@/lib/useWakeLock';
import { cn } from '@/lib/utils';
import { listSleepAudio, uploadSleepAudio, deleteSleepAudio, type SleepAudioDTO } from '@/lib/api/sleepAudio';
import { fetchRadioTurn, type RadioChannel, type RadioSegment } from '@/lib/api/radio';

/**
 * goodnight · 电台改版 · Apple Music 现在播放式（2026-11-11）
 *
 * 设计稿：goodnight `8:1`「电台改版设计」（截图核对：goodnight · 电台改版 · Apple Music 式）。
 * 双主题：深色纯黑 #0E0F11 / 浅色纯白，颜色走主题 token 随 App 切换。
 *
 * 关键改动（对照旧 MIDNIGHT FM 收音机 UI）：
 *  - 封面不放图，是「他的话」——电台播他的声音，封面用一句他的话（默认「今晚也，慢慢睡吧」）
 *  - 台名在他播出时写好：用户先在输入框告诉「今天想听什么」，点播放(他开始播出)时台名自动定为该请求；不再有手动「AI 起名」
 *  - 环境声·可叠加：雨 / 炉火 / 风 三条横推子，展开即纯净播放器
 *  - 回放可拖动·直播锁进度：往期录音是真实音频，进度可拖；直播(他的话)锁进度
 *  - 往期录音·可反复听：列出过往录制，点开即回放
 *
 * 音频引擎（环境声 Web Audio + Web Speech TTS）原样移植旧实现，功能不丢。
 */

/* ── 环境声类型 ───────────────────────────────────────── */
type LayerKind = 'rain' | 'fire' | 'wind';
/** 心跳只给枕话台垫底，不进混音台（本期未启用，保留引擎兼容） */
type BedKind = 'heart';
type AmbientKind = LayerKind | BedKind;

const GN_ACCENT = '#8b7cf6'; // 蓝紫强调色，深/浅主题共用

function formatTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 生成一段可无缝循环的环境声（2~4 秒）。只有雨 / 壁炉 / 风 / 心跳。 */
function makeAmbientBuffer(ctx: AudioContext, kind: AmbientKind): AudioBuffer {
  const seconds = kind === 'heart' ? 4 : 3;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === 'rain' || kind === 'fire' || kind === 'wind') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      let v = last * 3.2;
      if (kind === 'rain') {
        v = v * 0.5 + white * 0.1;
        if (Math.random() < 0.0022) v += (Math.random() * 2 - 1) * 0.7;
      } else if (kind === 'fire') {
        v *= 0.42;
        const density = 0.0035 + 0.002 * Math.sin((i / len) * Math.PI * 2);
        if (Math.random() < density) v += (Math.random() * 2 - 1) * (0.55 + Math.random() * 0.5);
      } else {
        const gust =
          0.34 + 0.2 * Math.sin((i / len) * Math.PI * 2) + 0.1 * Math.sin((i / len) * Math.PI * 6.5);
        v *= Math.max(0.12, gust);
      }
      data[i] = v;
    }
    return loopSmooth(buffer);
  }

  let bed = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    bed = (bed + 0.02 * white) / 1.02;
    data[i] = bed * 0.35;
  }
  const thump = (start: number, gain: number) => {
    const s = Math.floor(start * ctx.sampleRate);
    const dur = Math.floor(0.16 * ctx.sampleRate);
    for (let i = 0; i < dur && s + i < len; i++) {
      const t = i / ctx.sampleRate;
      data[s + i] += Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t * 26) * gain;
    }
  };
  for (let t = 0; t < seconds; t += 1.1) {
    thump(t, 0.55);
    thump(t + 0.28, 0.35);
  }
  return buffer;
}

/** 把缓冲首尾做交叉淡化，循环接缝不「咔」。 */
function loopSmooth(buffer: AudioBuffer): AudioBuffer {
  const data = buffer.getChannelData(0);
  const n = data.length;
  const fade = Math.min(Math.floor(n * 0.08), 4096);
  const tail = data.slice(n - fade);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + tail[i] * (1 - t);
  }
  return buffer;
}

export function GoodnightPage() {
  const navigate = useNavigate();

  /* ── 模式：直播(他的话) / 回放(往期录音) ──────────────── */
  const [mode, setMode] = useState<'live' | 'replay'>('live');

  /* ── 直播(他的话) ───────────────────────────────────── */
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState('');
  const [status, setStatus] = useState('');
  const [showName, setShowName] = useState('深夜电台');
  const [request, setRequest] = useState(
    () => localStorage.getItem('blueberry.goodnight.request') ?? '',
  );

  /* ── 环境声 ─────────────────────────────────────────── */
  const [levels, setLevels] = useState<Record<LayerKind, number>>({ rain: 0, fire: 0, wind: 0 });
  const [ambientVolume, setAmbientVolume] = useState(0.18);
  const [voiceVolume] = useState(0.9);

  /* ── 往期录音（保留原上传音频功能） ──────────────────── */
  const [items, setItems] = useState<SleepAudioDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ── 加载 ───────────────────────────────────────────── */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── 音频引擎 refs ──────────────────────────────────── */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const layersRef = useRef<Partial<Record<LayerKind, { src: AudioBufferSourceNode; gain: GainNode }>>>({});
  const bedRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const buffersRef = useRef<Partial<Record<AmbientKind, AudioBuffer>>>({});
  const levelsRef = useRef(levels);
  const tokenRef = useRef(0);
  const lastLineRef = useRef('');

  const playingRef = useRef(false);
  const modeRef = useRef(mode);
  const ambientVolumeRef = useRef(ambientVolume);
  const voiceVolumeRef = useRef(voiceVolume);
  const channelRef = useRef<RadioChannel | null>(null);
  playingRef.current = playing;
  modeRef.current = mode;
  ambientVolumeRef.current = ambientVolume;
  voiceVolumeRef.current = voiceVolume;
  levelsRef.current = levels;

  const hasAmbient = levels.rain > 0 || levels.fire > 0 || levels.wind > 0;
  useWakeLock(playing || hasAmbient);

  /* ── 加载往期录音 ───────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    const [audioRes] = await Promise.allSettled([listSleepAudio()]);
    if (audioRes.status === 'fulfilled') setItems(audioRes.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Web Audio：环境声 ──────────────────────────────── */
  function getCtx(): AudioContext {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = ambientVolumeRef.current * 0.8;
      gain.connect(ctx.destination);
      gainRef.current = gain;
      audioCtxRef.current = ctx;
    }
    return audioCtxRef.current;
  }

  const bufferFor = useCallback((ctx: AudioContext, kind: AmbientKind): AudioBuffer => {
    let buf = buffersRef.current[kind];
    if (!buf) {
      buf = makeAmbientBuffer(ctx, kind);
      buffersRef.current[kind] = buf;
    }
    return buf;
  }, []);

  const applyLevel = useCallback(
    (kind: LayerKind, v: number) => {
      const ctx = getCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      const cur = layersRef.current[kind];
      if (v <= 0.005) {
        if (cur) {
          try {
            cur.src.stop();
          } catch {
            /* already stopped */
          }
          cur.src.disconnect();
          cur.gain.disconnect();
          delete layersRef.current[kind];
        }
        return;
      }
      if (!cur) {
        const src = ctx.createBufferSource();
        src.buffer = bufferFor(ctx, kind);
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(gainRef.current!);
        src.start();
        g.gain.setTargetAtTime(v, ctx.currentTime, 0.12);
        layersRef.current[kind] = { src, gain: g };
      } else {
        cur.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.06);
      }
    },
    [bufferFor],
  );

  const setLevel = useCallback(
    (kind: LayerKind, v: number) => {
      setLevels((prev) => (prev[kind] === v ? prev : { ...prev, [kind]: v }));
      applyLevel(kind, v);
    },
    [applyLevel],
  );

  /** 只留一条轨（切台默认垫底）：其余推到 0 */
  const soloLayer = useCallback(
    (kind: LayerKind, v = 0.55) => {
      (['rain', 'fire', 'wind'] as LayerKind[]).forEach((k) => {
        const next = k === kind ? v : 0;
        if (levelsRef.current[k] !== next) applyLevel(k, next);
      });
      setLevels({ rain: 0, fire: 0, wind: 0, [kind]: v } as Record<LayerKind, number>);
    },
    [applyLevel],
  );

  // 音量实时调节：环境声走总线 gain（再乘 0.8 压低底噪），回放音频跟随
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = ambientVolume * 0.8;
    if (audioRef.current) audioRef.current.volume = ambientVolume;
  }, [ambientVolume]);

  /* ── TTS：Web Speech ───────────────────────────────── */
  function pickVoice(): SpeechSynthesisVoice | undefined {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => /zh[-_]?CN/i.test(v.lang) && /Yunxi|Xiaoxiao|Ting|Huihui|Female/i.test(v.name)) ??
      voices.find((v) => /zh/i.test(v.lang)) ??
      undefined
    );
  }

  function speakText(
    text: string,
    opts: { rate?: number; pitch?: number; volume?: number } = {},
  ): Promise<void> {
    const clean = text.trim();
    if (!clean) return Promise.resolve();
    lastLineRef.current = clean;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return new Promise<void>((r) => window.setTimeout(() => r(), Math.min(6000, Math.max(1200, clean.length * 160))));
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const u = new SpeechSynthesisUtterance(clean);
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.lang = 'zh-CN';
      u.rate = opts.rate ?? 0.9;
      u.pitch = opts.pitch ?? 0.92;
      u.volume = Math.min(1, Math.max(0, opts.volume ?? voiceVolumeRef.current));
      const fallback = window.setTimeout(done, Math.min(20_000, Math.max(2500, clean.length * 230)));
      u.onend = () => {
        window.clearTimeout(fallback);
        done();
      };
      u.onerror = () => {
        window.clearTimeout(fallback);
        done();
      };
      window.speechSynthesis.speak(u);
    });
  }

  const stopVoice = useCallback(() => {
    tokenRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    setLine('');
    setStatus('');
  }, []);

  // 卸载时清场
  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
      (Object.keys(layersRef.current) as LayerKind[]).forEach((k) => {
        const cur = layersRef.current[k];
        if (!cur) return;
        try {
          cur.src.stop();
        } catch {
          /* noop */
        }
      });
      layersRef.current = {};
      const hb = bedRef.current;
      if (hb) {
        try {
          hb.src.stop();
        } catch {
          /* noop */
        }
        bedRef.current = null;
      }
    };
  }, []);

  /* ── 直播循环（他的话） ─────────────────────────────── */
  async function speakSegments(segments: RadioSegment[], token: number): Promise<void> {
    for (const seg of segments) {
      if (token !== tokenRef.current || !playingRef.current || modeRef.current !== 'live') return;
      if (seg.type === 'speak') {
        setLine(seg.text);
        await speakText(seg.text, {
          rate: seg.tone === '耳语' ? 0.78 : seg.tone === '低声' ? 0.84 : 0.9,
          pitch: seg.tone === '耳语' ? 1.04 : 0.92,
          volume: seg.tone === '耳语' ? voiceVolumeRef.current * 0.75 : voiceVolumeRef.current,
        });
      } else if (seg.type === 'pause') {
        await new Promise<void>((r) => window.setTimeout(() => r(), seg.ms));
      } else if (seg.type === 'se') {
        setStatus(`音效 · ${seg.name}`);
      } else if (seg.type === 'song') {
        setStatus(`♪ ${seg.name}${seg.artist ? ` · ${seg.artist}` : ''}`);
      }
    }
  }

  async function runTalkLoop(token: number) {
    let history = '';
    while (token === tokenRef.current && channelRef.current === 'talk' && playingRef.current && modeRef.current === 'live') {
      setStatus('正在写下一段…');
      try {
        const res = await fetchRadioTurn({ channel: 'talk', history });
        setStatus(res.source === 'llm' ? '' : '模型不在，先念一段存稿');
        await speakSegments(res.segments, token);
        history = `${history}\n${res.script}`.slice(-1600);
      } catch {
        setStatus('信号有点弱，再试一次…');
      }
      if (token !== tokenRef.current || !playingRef.current || modeRef.current !== 'live') return;
      await new Promise<void>((r) => window.setTimeout(() => r(), 2200));
    }
  }

  const startLive = useCallback(() => {
    tokenRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    if (modeRef.current !== 'live') setMode('live');
    channelRef.current = 'talk';
    setPlaying(true);
    playingRef.current = true;
    setLine('');
    setStatus('正在调频…');
    // 台名在他播出时写好：用你「今天想听什么」的请求作为台名
    const want = request.trim();
    setShowName(want ? (want.length > 40 ? `${want.slice(0, 40)}…` : want) : '深夜电台');
    soloLayer('wind', 0.5);
    const token = tokenRef.current;
    void runTalkLoop(token);
  }, [soloLayer, request]);

  const stopLive = useCallback(() => {
    stopVoice();
    setPlaying(false);
    setStatus('');
  }, [stopVoice]);

  const toggleLive = useCallback(() => {
    if (playing && mode === 'live') stopLive();
    else startLive();
  }, [playing, mode, startLive, stopLive]);

  /* ── 往期录音 / 回放 ────────────────────────────────── */
  const playingItem = useMemo(() => items.find((i) => i.id === replayId) ?? null, [items, replayId]);

  const enterReplay = useCallback((item: SleepAudioDTO) => {
    stopVoice();
    setMode('replay');
    modeRef.current = 'replay';
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = item.url;
    audio.volume = ambientVolumeRef.current;
    setReplayId(item.id);
    setCurrentTime(0);
    setDuration(item.duration ?? 0);
    void audio.play().catch(() => setError('这个录音播放不了'));
    setPlaying(true);
    playingRef.current = true;
  }, [stopVoice]);

  const toggleReplay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !replayId) return;
    if (playing && mode === 'replay') {
      audio.pause();
      setPlaying(false);
    } else {
      if (mode !== 'replay') {
        setMode('replay');
        modeRef.current = 'replay';
      }
      void audio.play().catch(() => setError('这个录音播放不了'));
      setPlaying(true);
      playingRef.current = true;
    }
  }, [playing, mode, replayId]);

  /* ── 中央播放键：按当前模式分发 ─────────────────────── */
  const onPlayToggle = useCallback(() => {
    if (mode === 'live') toggleLive();
    else toggleReplay();
  }, [mode, toggleLive, toggleReplay]);

  /* ── 进度条拖动（仅回放可拖） ───────────────────────── */
  const onSeek = (v: number) => {
    const audio = audioRef.current;
    if (!audio || mode !== 'replay') return;
    audio.currentTime = v;
    setCurrentTime(v);
  };

  /* ── 「回放」胶囊：直播↔回放 切换 ───────────────────── */
  const onToggleReplayMode = useCallback(() => {
    if (mode === 'replay') {
      stopVoice();
      setMode('live');
      modeRef.current = 'live';
    } else {
      const first = items[0];
      if (first) enterReplay(first);
      else setStatus('还没有往期录音，先「+ 添加」一段');
    }
  }, [mode, items, enterReplay, stopVoice]);

  /* ── 台名在播出时写好 ──
     用户先在下方输入框告诉「今天想听什么」，点击播放(他开始播出)时，
     startLive 会把台名定为该请求（见 startLive）。不再有手动「AI 起名」。 */

  /* ── 上传录音（保留原功能） ─────────────────────────── */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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

  const onDelete = async (id: string) => {
    try {
      await deleteSleepAudio(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (replayId === id) {
        audioRef.current?.pause();
        setReplayId(null);
        setPlaying(false);
      }
    } catch {
      /* noop */
    }
  };

  /* ── 回放音频事件 ───────────────────────────────────── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      if (repeat) {
        audio.currentTime = 0;
        void audio.play();
      } else if (shuffle && items.length > 1) {
        const others = items.filter((i) => i.id !== replayId);
        const next = others[Math.floor(Math.random() * others.length)];
        if (next) enterReplay(next);
      } else {
        setPlaying(false);
      }
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, [repeat, shuffle, items, replayId, enterReplay]);

  /* ── 文案 ───────────────────────────────────────────── */
  const coverText = mode === 'replay' ? playingItem?.title ?? '往期录音' : line || '今晚也，慢慢睡吧';
  const remaining = mode === 'replay' && duration > 0 ? duration - currentTime : 0;
  const ENV_LAYERS: { id: LayerKind; label: string }[] = [
    { id: 'rain', label: '雨' },
    { id: 'fire', label: '炉火' },
    { id: 'wind', label: '风' },
  ];

  return (
    <div className="relative min-h-full bg-white text-black/90 dark:bg-[#0E0F11] dark:text-white/90">
      <audio ref={audioRef} preload="metadata" />

      {/* ── 顶栏 ── */}
      <div className="flex items-center justify-between px-5 pt-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-black/[0.04] transition active:scale-95 dark:border-white/15 dark:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <Radio className="h-4 w-4" style={{ color: GN_ACCENT }} />
          MIDNIGHT FM
        </div>
        <button
          onClick={onToggleReplayMode}
          className={cn(
            'rounded-full px-3 py-1.5 text-[12px] font-medium transition active:scale-95',
            mode === 'replay'
              ? 'text-white'
              : 'border border-black/10 bg-black/[0.04] text-black/70 dark:border-white/15 dark:bg-white/[0.06] dark:text-white/70',
          )}
          style={mode === 'replay' ? { background: GN_ACCENT } : undefined}
        >
          回放
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-5 pb-10 pt-3">
        {/* ── 封面：他的话 ── */}
        <div className="relative">
          <div
            className="absolute inset-x-8 -top-4 bottom-8 -z-10 blur-3xl"
            style={{ background: GN_ACCENT, opacity: 0.35 }}
            aria-hidden
          />
          <div
            className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[28px] bg-gradient-to-br from-[#cdc6f7] via-[#a994f2] to-[#7c5cff] p-7 text-center shadow-[0_24px_70px_-20px_rgba(124,92,255,0.55)] dark:from-[#241f47] dark:via-[#432f86] dark:to-[#6b4dff]"
          >
            <span className="absolute left-5 top-5 rounded-full bg-black/25 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
              他的话
            </span>
            <p className="display px-4 text-2xl font-semibold leading-relaxed text-white drop-shadow-sm">
              {coverText}
            </p>
          </div>
        </div>

        {/* ── 先告诉他今天想听什么 ── */}
        <input
          value={request}
          onChange={(e) => {
            setRequest(e.target.value);
            try {
              localStorage.setItem('blueberry.goodnight.request', e.target.value);
            } catch {
              /* 隐私模式忽略 */
            }
          }}
          placeholder="今天想听点什么？告诉他就好"
          className="w-full rounded-2xl border border-black/10 bg-black/[0.03] px-4 py-3 text-[14px] text-foreground outline-none transition placeholder:text-black/35 focus:border-black/20 dark:border-white/12 dark:bg-white/[0.05] dark:placeholder:text-white/35 dark:focus:border-white/25"
        />

        {/* ── 标题区（台名在他播出时自动写好） ── */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="display truncate text-[22px] font-bold tracking-tight">{showName}</h1>
            {mode === 'replay' && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="回放中" />
            )}
          </div>
          <p className="text-[13px] text-black/55 dark:text-white/55">只放给一个人听 · 晚安频道</p>
        </div>

        {/* ── 进度条 ── */}
        {mode === 'replay' ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full"
              style={{ accentColor: GN_ACCENT }}
              aria-label="进度"
            />
            <div className="flex justify-between text-[11px] tabular-nums text-black/50 dark:text-white/50">
              <span>{formatTime(currentTime)}</span>
              <span>-{formatTime(remaining)}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full w-1/3 animate-pulse rounded-full" style={{ background: GN_ACCENT }} />
            </div>
            <div className="flex justify-between text-[11px] tabular-nums text-black/50 dark:text-white/50">
              <span className="font-semibold text-black/70 dark:text-white/70">直播中</span>
              <span>{status || '他的声音，正在说'}</span>
            </div>
          </div>
        )}

        {/* ── 播放控制行 ── */}
        <div className="flex items-center justify-between px-2">
          <button
            onClick={() => setShuffle((s) => !s)}
            aria-label="随机"
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full transition active:scale-90',
              shuffle ? 'text-white' : 'text-black/55 dark:text-white/55',
            )}
            style={shuffle ? { background: GN_ACCENT } : undefined}
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              const a = audioRef.current;
              if (mode === 'replay' && a) onSeek(Math.max(0, a.currentTime - 15));
              else if (lastLineRef.current) void speakText(lastLineRef.current);
            }}
            aria-label="后退 15 秒"
            className="grid h-11 w-11 place-items-center rounded-full text-black/70 transition active:scale-90 dark:text-white/70"
          >
            <SkipBack className="h-6 w-6" />
          </button>
          <button
            onClick={onPlayToggle}
            aria-label={playing ? '暂停' : '播放'}
            className="grid h-16 w-16 place-items-center rounded-full text-white shadow-lg transition active:scale-95"
            style={{ background: GN_ACCENT }}
          >
            {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 translate-x-0.5" />}
          </button>
          <button
            onClick={() => {
              const a = audioRef.current;
              if (mode === 'replay' && a) onSeek(Math.min(duration || 0, a.currentTime + 15));
              else {
                // 直播：跳过当前句，循环会自动取下一轮
                try {
                  window.speechSynthesis?.cancel();
                } catch {
                  /* noop */
                }
              }
            }}
            aria-label="前进 15 秒"
            className="grid h-11 w-11 place-items-center rounded-full text-black/70 transition active:scale-90 dark:text-white/70"
          >
            <SkipForward className="h-6 w-6" />
          </button>
          <button
            onClick={() => setRepeat((r) => !r)}
            aria-label="循环"
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full transition active:scale-90',
              repeat ? 'text-white' : 'text-black/55 dark:text-white/55',
            )}
            style={repeat ? { background: GN_ACCENT } : undefined}
          >
            <Repeat className="h-5 w-5" />
          </button>
        </div>

        {/* ── 音量 + 环境声·可叠加 ── */}
        <div className="flex flex-col gap-4 rounded-3xl border border-black/10 bg-black/[0.03] p-5 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <Volume2 className="h-4 w-4 shrink-0 text-black/55 dark:text-white/55" />
            <span className="w-10 text-[13px] text-black/70 dark:text-white/70">音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={ambientVolume}
              onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{ accentColor: GN_ACCENT }}
              aria-label="音量"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium" style={{ color: GN_ACCENT }}>
                环境音 · 可叠加
              </span>
              <span className="text-[11px] text-black/40 dark:text-white/40">
                {hasAmbient ? '几条一起推会叠在一起' : '往上推就出声'}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {ENV_LAYERS.map((l) => (
                <div key={l.id} className="flex items-center gap-3">
                  <span className="w-10 text-[13px] text-black/70 dark:text-white/70">{l.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={levels[l.id]}
                    onChange={(e) => setLevel(l.id, parseFloat(e.target.value))}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
                    style={{ accentColor: GN_ACCENT }}
                    aria-label={`${l.label}音量`}
                  />
                  <span className="w-10 text-right text-[12px] tabular-nums text-black/50 dark:text-white/50">
                    {Math.round(levels[l.id] * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 往期录音 ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">往期录音</h2>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1 text-[12px] text-black/55 transition hover:text-black/80 dark:text-white/55 dark:hover:text-white/80">
                <Plus className="h-3.5 w-3.5" />
                {uploading ? '上传中' : '添加'}
                <input type="file" accept="audio/*" hidden onChange={onPickFile} />
              </label>
              <button className="flex items-center gap-0.5 text-[12px] text-black/45 dark:text-white/45">
                查看全部 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="py-6 text-center text-[13px] text-black/40 dark:text-white/40">加载中…</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-black/40 dark:text-white/40">
              还没有往期录音，点「+ 添加」存一段哄睡音频
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <li key={it.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => enterReplay(it)}
                    onKeyDown={(e) => e.key === 'Enter' && enterReplay(it)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border p-2.5 transition active:scale-[0.99]',
                      replayId === it.id && playing
                        ? 'border-transparent'
                        : 'border-black/10 dark:border-white/10',
                    )}
                    style={
                      replayId === it.id && playing
                        ? { background: 'rgba(139,124,246,0.16)', borderColor: GN_ACCENT }
                        : undefined
                    }
                  >
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow-inner"
                      style={{ background: 'linear-gradient(135deg,#a994f2,#6b4dff)' }}
                    >
                      <Play className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{it.title}</p>
                      <p className="truncate text-[12px] text-black/45 dark:text-white/45">
                        {new Date(it.createdAt).toLocaleDateString('zh-CN', {
                          month: 'long',
                          day: 'numeric',
                        })}
                        {' · '}
                        {it.duration ? `${Math.round(it.duration / 60)} 分钟` : '录音'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDelete(it.id);
                      }}
                      className="shrink-0 rounded-full px-2 py-1 text-[11px] text-black/40 transition hover:text-red-500 dark:text-white/40"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="rounded-2xl bg-red-500/10 px-4 py-2 text-center text-[12px] text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
}

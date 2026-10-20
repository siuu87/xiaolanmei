import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Pause,
  Upload,
  Trash2,
  Volume2,
  Volume1,
  Wind,
  Clock,
  Music2,
  Radio,
  Lock,
  Send,
  Moon,
  Loader2,
} from 'lucide-react';
import { StarBackdrop } from './StarBackdrop';
import { useWakeLock } from '@/lib/useWakeLock';
import { cn } from '@/lib/utils';
import { listSleepAudio, uploadSleepAudio, deleteSleepAudio, type SleepAudioDTO } from '@/lib/api/sleepAudio';
import { listReadingBooks, type ReadingBook } from '@/lib/api/reading';
import {
  fetchRadioTurn,
  type RadioChannel,
  type RadioChannelMeta,
  type RadioSegment,
} from '@/lib/api/radio';

/**
 * MIDNIGHT FM · 深夜电台（2026-10-19，取代原「goodnight」页）。
 *
 * 参考 chuochuochuo36-png/midnight-fm 的设计，四个台：
 *   FM 90.6 故事台 —— 直接读「一起读」书架里选中的小说正文（一字不改）
 *   FM 97.3 夜话台 —— 白起的第一人称晚安随笔；切过去整页关灯
 *   FM 104.1 音乐台 —— 雨 / 风 / 炉火 / 白粉棕噪音 + 自己导入的哄睡音频
 *   隐藏台（枕话）—— 音乐台再往右一格；心跳底噪 + 低声耳语
 *
 * 三条体验原则：
 * 1. **切台先出声**：程序化 BGM 立刻响，广播稿在后台生成，消除几十秒等待；
 * 2. **纯台词**：念出来的内容由后端 radio_parse 洗过，动作/括号旁白不会进 TTS；
 * 3. **纸条插话**：递进去的纸条进入下一轮广播上下文，白起在下一段自然回应。
 *
 * TTS 用浏览器自带的 Web Speech（零依赖、不花钱）；没有可用语音时静默降级为文字。
 */

type NoiseType = 'white' | 'pink' | 'brown';
type AmbientKind = NoiseType | 'rain' | 'wind' | 'fire' | 'heart';

const NOISE_META: Record<NoiseType, { label: string; hint: string }> = {
  white: { label: '白噪音', hint: '均匀沙沙声 · 专注' },
  pink: { label: '粉噪音', hint: '更柔 · 像细雨' },
  brown: { label: '棕噪音', hint: '低沉 · 像远雷海浪' },
};

const CHANNELS: RadioChannelMeta[] = [
  { id: 'story', freq: 'FM 90.6', name: '故事台', subtitle: '听一段故事', accent: '#e9b872' },
  { id: 'talk', freq: 'FM 97.3', name: '夜话台', subtitle: '关灯以后', accent: '#cf8f63', lightsOff: true },
  { id: 'music', freq: 'FM 104.1', name: '音乐台', subtitle: '雨、风与炉火', accent: '#8fb08a' },
  { id: 'pillow', freq: 'FM —', name: '枕话', subtitle: '再往右一格', accent: '#b07f9e', hidden: true },
];

const TIMER_OPTIONS = [15, 30, 45, 60];

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(() => r(), ms));

function formatTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 生成一段可循环的环境声（2~4 秒）。白/粉/棕之外，再加雨/风/炉火/心跳。 */
function makeAmbientBuffer(ctx: AudioContext, kind: AmbientKind): AudioBuffer {
  const seconds = kind === 'heart' ? 4 : 2;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === 'white') {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  if (kind === 'pink') {
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
    return buffer;
  }
  if (kind === 'brown' || kind === 'wind' || kind === 'rain' || kind === 'fire') {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      let v = last * 3.5;
      if (kind === 'rain') {
        // 雨：棕噪 + 偶尔的水滴
        v *= 0.55;
        if (Math.random() < 0.0025) v += (Math.random() * 2 - 1) * 0.8;
      } else if (kind === 'fire') {
        // 炉火：低沉底噪 + 随机爆裂
        v *= 0.5;
        if (Math.random() < 0.004) v += (Math.random() * 2 - 1) * 0.9;
      } else if (kind === 'wind') {
        // 风：慢速起伏
        v *= 0.45 + 0.25 * Math.sin((i / len) * Math.PI * 2);
      }
      data[i] = v;
    }
    if (kind === 'wind' || kind === 'rain' || kind === 'fire') return buffer;
    return buffer;
  }

  // heart：每 1.1 秒两次低频搏动 + 一层很低的底噪
  const beat = 1.1;
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
  for (let t = 0; t < seconds; t += beat) {
    thump(t, 0.55);
    thump(t + 0.28, 0.35);
  }
  return buffer;
}

/** 喇叭/耳机的左右耳提示（仅 UI 文案；Web Speech 不支持声道，留给以后接 TTS） */
function earLabel(ear?: 'left' | 'right'): string {
  return ear === 'left' ? '左耳' : ear === 'right' ? '右耳' : '';
}

export function GoodnightPage() {
  const navigate = useNavigate();

  /* ── 上传的哄睡音频（保留原功能） ───────────────────── */
  const [items, setItems] = useState<SleepAudioDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ── 电台 ───────────────────────────────────────────── */
  const [channel, setChannel] = useState<RadioChannel | null>(null);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState<'llm' | 'local' | null>(null);
  const [ambient, setAmbient] = useState<AmbientKind | null>(null);
  const [noise, setNoise] = useState<NoiseType | null>(null);
  /** 环境声（雨/风/炉火/白噪）与 AI 人声分开调；环境声默认压得很低 */
  const [ambientVolume, setAmbientVolume] = useState(0.18);
  const [voiceVolume, setVoiceVolume] = useState(0.9);
  const [pillowUnlocked, setPillowUnlocked] = useState(false);

  /* ── 书架（故事台） ─────────────────────────────────── */
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [book, setBook] = useState<ReadingBook | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);

  /* ── 纸条 ───────────────────────────────────────────── */
  const [note, setNote] = useState('');
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);
  const [delivered, setDelivered] = useState<{ text: string; at: number }[]>([]);

  /* ── 定时器 / 加载 ──────────────────────────────────── */
  const [timerMin, setTimerMin] = useState<number | null>(null);
  const [timerLeft, setTimerLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const ambientSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef<Partial<Record<AmbientKind, AudioBuffer>>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 语音代次：切台/暂停时 +1，旧的朗读循环看到代次变了就退出 */
  const tokenRef = useRef(0);

  // 异步循环里读最新值用的 ref（闭包会拿到旧 state）
  const playingRef = useRef(false);
  const channelRef = useRef<RadioChannel | null>(null);
  const pendingNotesRef = useRef<string[]>([]);
  const ambientVolumeRef = useRef(ambientVolume);
  const voiceVolumeRef = useRef(voiceVolume);
  const chapterRef = useRef(0);
  const bookRef = useRef<ReadingBook | null>(null);
  playingRef.current = playing;
  channelRef.current = channel;
  pendingNotesRef.current = pendingNotes;
  ambientVolumeRef.current = ambientVolume;
  voiceVolumeRef.current = voiceVolume;
  chapterRef.current = chapterIdx;
  bookRef.current = book;

  const channelMeta = useMemo(() => CHANNELS.find((c) => c.id === channel) ?? null, [channel]);
  const lightsOff = !!channelMeta?.lightsOff;

  useWakeLock(playing || !!noise);

  /* ── 加载书架 + 已导入音频 ──────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    const [bookRes, audioRes] = await Promise.allSettled([listReadingBooks(), listSleepAudio()]);
    if (bookRes.status === 'fulfilled') {
      const withText = bookRes.value.filter((b) => (b.content ?? '').trim().length > 0);
      setBooks(withText);
      setBook((prev) => prev ?? withText[0] ?? null);
    }
    if (audioRes.status === 'fulfilled') setItems(audioRes.value);
    if (bookRes.status === 'rejected' && audioRes.status === 'rejected') {
      setError('书架与音频都没加载出来，稍后再试。');
    }
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

  const stopAmbient = useCallback(() => {
    if (ambientSrcRef.current) {
      try {
        ambientSrcRef.current.stop();
      } catch {
        /* already stopped */
      }
      ambientSrcRef.current.disconnect();
      ambientSrcRef.current = null;
    }
    setAmbient(null);
    setNoise(null);
  }, []);

  const startAmbient = useCallback(
    (kind: AmbientKind) => {
      const ctx = getCtx();
      if (ctx.state === 'suspended') void ctx.resume();
      if (ambientSrcRef.current) {
        try {
          ambientSrcRef.current.stop();
        } catch {
          /* already stopped */
        }
        ambientSrcRef.current.disconnect();
      }
      let buf = buffersRef.current[kind];
      if (!buf) {
        buf = makeAmbientBuffer(ctx, kind);
        buffersRef.current[kind] = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gainRef.current!);
      src.start();
      ambientSrcRef.current = src;
      setAmbient(kind);
      setNoise(kind === 'white' || kind === 'pink' || kind === 'brown' ? kind : null);
    },
    [],
  );

  // 音量实时调节：环境声走 gain（再乘 0.8 压低底噪），人声只影响 TTS
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

  /**
   * 念一句。返回的 Promise 一定 resolve —— 浏览器没语音、被切台打断、
   * headless 不触发 onend，都靠兜底计时器收尾。
   */
  function speakText(
    text: string,
    opts: { rate?: number; pitch?: number; volume?: number } = {},
  ): Promise<void> {
    const clean = text.trim();
    if (!clean) return Promise.resolve();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      // 没有 TTS：至少让文字在屏幕上走一遍，停留时长按字数估
      return sleep(Math.min(6000, Math.max(1200, clean.length * 160)));
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
      // 兜底：某些 WebView / headless 不会触发 onend
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
    setSource(null);
  }, []);

  const stopEverything = useCallback(() => {
    stopVoice();
    stopAmbient();
    if (audioRef.current) audioRef.current.pause();
    setPlaying(false);
    setPlayingId(null);
  }, [stopAmbient, stopVoice]);

  // 卸载时停掉所有声音
  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* noop */
      }
      if (ambientSrcRef.current) {
        try {
          ambientSrcRef.current.stop();
        } catch {
          /* noop */
        }
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ── MediaSession ──────────────────────────────────── */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !channelMeta) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: channelMeta.name,
      artist: channelMeta.freq,
      album: 'MIDNIGHT FM',
    });
    const play = () => {
      if (channelRef.current) void startChannel(channelRef.current);
    };
    const pause = () => stopEverything();
    try {
      ms.setActionHandler('play', play);
      ms.setActionHandler('pause', pause);
    } catch {
      /* 某些浏览器只支持部分 action */
    }
    return () => {
      try {
        ms.setActionHandler('play', null);
        ms.setActionHandler('pause', null);
      } catch {
        /* noop */
      }
    };
  }, [channelMeta]);

  /* ── 纸条 ───────────────────────────────────────────── */
  const takeNote = useCallback((): string | undefined => {
    const q = pendingNotesRef.current;
    if (!q.length) return undefined;
    const [first, ...rest] = q;
    pendingNotesRef.current = rest;
    setPendingNotes(rest);
    return first;
  }, []);

  const submitNote = () => {
    const text = note.trim();
    if (!text) return;
    setPendingNotes((p) => [...p, text]);
    setDelivered((d) => [...d.slice(-5), { text, at: Date.now() }]);
    setNote('');
    setStatus('纸条递进去了 · 下一段念给你听');
  };

  /* ── 四个台的运行循环 ──────────────────────────────── */
  async function speakSegments(segments: RadioSegment[], token: number): Promise<void> {
    for (const seg of segments) {
      if (token !== tokenRef.current || !playingRef.current) return;
      if (seg.type === 'speak') {
        setLine(`${earLabel(seg.ear)}${earLabel(seg.ear) ? ' · ' : ''}${seg.text}`);
        await speakText(seg.text, {
          rate: seg.tone === '耳语' ? 0.78 : seg.tone === '低声' ? 0.84 : 0.9,
          pitch: seg.tone === '耳语' ? 1.04 : 0.92,
          volume: seg.tone === '耳语' ? voiceVolumeRef.current * 0.75 : voiceVolumeRef.current,
        });
      } else if (seg.type === 'pause') {
        await sleep(seg.ms);
      } else if (seg.type === 'bgm') {
        const mood = seg.mood;
        startAmbient(mood.includes('雨') ? 'rain' : mood.includes('风') ? 'wind' : mood.includes('炉') ? 'fire' : 'brown');
      } else if (seg.type === 'se') {
        if (/心跳/.test(seg.name)) startAmbient('heart');
        setStatus(`音效 · ${seg.name}`);
      } else if (seg.type === 'song') {
        setStatus(`♪ ${seg.name}${seg.artist ? ` · ${seg.artist}` : ''}`);
      }
    }
  }

  async function runTalkLoop(token: number) {
    let history = '';
    while (token === tokenRef.current && channelRef.current === 'talk' && playingRef.current) {
      const noteText = takeNote();
      setStatus(noteText ? '正在接住那张纸条…' : '正在写下一段…');
      try {
        const res = await fetchRadioTurn({
          channel: 'talk',
          note: noteText,
          history,
          bookTitle: bookRef.current?.title,
        });
        setSource(res.source);
        setStatus(res.source === 'llm' ? '' : '模型不在，先念一段存稿');
        await speakSegments(res.segments, token);
        history = `${history}\n${res.script}`.slice(-1600);
      } catch (err) {
        setStatus('信号有点弱，再试一次…');
        setError((err as Error).message);
      }
      if (token !== tokenRef.current || !playingRef.current) return;
      // 章节间隙：有纸条就先回应，再继续
      await sleep(pendingNotesRef.current.length ? 200 : 2200);
    }
  }

  async function runStoryLoop(token: number) {
    let i = chapterRef.current;
    while (token === tokenRef.current && channelRef.current === 'story' && playingRef.current) {
      const b = bookRef.current;
      if (!b) {
        setStatus('书房里还没有能读的书');
        return;
      }
      const paras = (b.content ?? '')
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (i >= paras.length) {
        setStatus('这一本读完了 · 晚安');
        setPlaying(false);
        stopAmbient();
        return;
      }

      // 纸条：在章节间隙用夜话台的口吻接一句，再继续读
      const noteText = takeNote();
      if (noteText) {
        try {
          const res = await fetchRadioTurn({ channel: 'talk', note: noteText, bookTitle: b.title });
          await speakSegments(res.segments, token);
        } catch {
          /* 纸条没接住也不影响继续读 */
        }
      }

      const slice = paras.slice(i, i + 4);
      setStatus(`${b.title} · ${Math.floor(i / 4) + 1} / ${Math.ceil(paras.length / 4)} 段`);
      for (const p of slice) {
        if (token !== tokenRef.current || !playingRef.current) return;
        setLine(p.length > 120 ? `${p.slice(0, 120)}…` : p);
        await speakText(p, { rate: 0.88, pitch: 0.9 });
      }
      i += 4;
      setChapterIdx(i);
      chapterRef.current = i;
      await sleep(1200);
    }
  }

  async function runPillowLoop(token: number) {
    const lines = [
      '[低声] 过来一点。',
      '[耳语] 别怕，我在。',
      '[停顿]',
      '[低声] 听我的心跳。',
      '[耳语] 慢慢呼吸。',
      '[停顿]',
      '[低声] 今晚哪也不去。',
    ];
    while (token === tokenRef.current && channelRef.current === 'pillow' && playingRef.current) {
      for (const raw of lines) {
        if (token !== tokenRef.current || !playingRef.current) return;
        const tone = raw.match(/^\[(低声|耳语|停顿)\]$/)?.[1];
        const text = raw.replace(/^\[[^\]]+\]\s*/, '');
        if (tone === '停顿') {
          await sleep(1400);
          continue;
        }
        if (!text) continue;
        setLine(text);
        await speakText(text, {
          rate: tone === '耳语' ? 0.72 : 0.8,
          pitch: tone === '耳语' ? 1.05 : 0.95,
          volume: voiceVolumeRef.current * (tone === '耳语' ? 0.6 : 0.75),
        });
        await sleep(1600);
      }
      await sleep(4200);
    }
  }

  const startChannel = async (id: RadioChannel) => {
    if (channel === id && playing) {
      stopEverything();
      return;
    }
    tokenRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* noop */
    }
    setChannel(id);
    channelRef.current = id;
    setPlaying(true);
    playingRef.current = true;
    setError(null);
    setLine('');
    setStatus('正在调频…');

    // 开场垫底：先出声，不等模型
    if (id === 'music') startAmbient(noise ?? 'rain');
    else if (id === 'talk') startAmbient('wind');
    else if (id === 'story') startAmbient('rain');
    else startAmbient('heart');

    const token = tokenRef.current;
    if (id === 'talk') void runTalkLoop(token);
    else if (id === 'story') void runStoryLoop(token);
    else if (id === 'pillow') void runPillowLoop(token);
    else {
      setStatus('♪ 雨声 · 炉火');
      setLine('先放一点雨声。');
    }
  };

  /* ── 上传音频（保留原功能） ────────────────────────── */
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

  const togglePlay = (item: SleepAudioDTO) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === item.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = item.url;
    audio.volume = ambientVolume;
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

  /* ── 睡眠定时器 ────────────────────────────────────── */
  const startTimer = (min: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerMin(min);
    setTimerLeft(min * 60);
    timerRef.current = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          stopEverything();
          setChannel(null);
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

  /* ── 渲染 ──────────────────────────────────────────── */
  const visibleChannels = CHANNELS.filter((c) => !c.hidden || pillowUnlocked || channel === 'pillow');
  const needleIdx = Math.max(0, visibleChannels.findIndex((c) => c.id === channel));
  const needleLeft = visibleChannels.length > 1 ? 8 + (needleIdx / (visibleChannels.length - 1)) * 84 : 50;

  return (
    <div
      data-testid="midnight-fm"
      className={cn(
        'relative min-h-full text-amber-50 transition-colors duration-700',
        lightsOff ? 'bg-[#040303]' : 'bg-[#0a0806]',
      )}
    >
      <StarBackdrop />
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a && a.duration) setProgress(a.currentTime / a.duration);
        }}
        onEnded={() => {
          setPlayingId(null);
          setProgress(0);
        }}
        className="hidden"
      />

      <div className="relative mx-auto w-full max-w-md px-4 pb-16 pt-6">
        <header className="relative mb-6 text-center">
          <button
            type="button"
            onClick={() => navigate('/chat')}
            aria-label="返回"
            className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-amber-200/60 transition hover:bg-white/10 hover:text-amber-100"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-[10px] tracking-[0.45em] text-amber-200/45">MIDNIGHT FM</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-wide text-amber-100">
            深夜电台
          </h1>
          <p className="mt-1 text-[11px] text-amber-200/50">只放给一个人听 · 你随时可以走</p>
        </header>

        {/* ── 收音机机身 ─────────────────────────────── */}
        <section className="rounded-[30px] border border-amber-900/50 bg-gradient-to-b from-[#2b1d13] via-[#1b130d] to-[#100b08] p-4 shadow-[0_24px_70px_rgba(0,0,0,.65)]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[9px] tracking-[0.35em] text-amber-200/40">MIDNIGHT FM</span>
            <span className="flex items-center gap-1.5 text-[9px] text-amber-200/40">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  playing ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-amber-900',
                )}
              />
              {playing ? 'ON AIR' : channel ? 'STANDBY' : 'OFF'}
            </span>
          </div>

          {/* LCD */}
          <div className="rounded-xl border border-emerald-900/70 bg-[#08130d] px-3 py-2.5 shadow-inner">
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-[15px] tracking-[0.18em] text-emerald-300">
                {channelMeta?.freq ?? '--.-'}
              </span>
              <span className="text-[10px] text-emerald-700">
                {channelMeta?.name ?? '待机'}
                {source ? (source === 'llm' ? ' · LIVE' : ' · TAPE') : ''}
              </span>
            </div>
            <p className="mt-1 min-h-[3.2em] text-[12px] leading-[1.55] text-emerald-200/80">
              {line || status || '把指针拨到一个台。'}
            </p>
          </div>

          {/* 频率刻度 */}
          <div className="relative mt-4 px-1">
            <div className="flex items-end justify-between text-[9px] text-amber-200/45">
              {visibleChannels.map((c) => (
                <span key={c.id}>{c.freq.replace('FM ', '')}</span>
              ))}
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-black/60 ring-1 ring-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-800/50 via-amber-500/30 to-amber-800/50" />
            </div>
            <div
              className="absolute top-4 h-4 w-0.5 rounded bg-amber-300 shadow-[0_0_6px_#fbbf24] transition-all duration-500"
              style={{ left: `${needleLeft}%` }}
            />
          </div>

          {/* 四个台 */}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {visibleChannels.map((c) => {
              const active = channel === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void startChannel(c.id)}
                  data-testid={`radio-station-${c.id}`}
                  aria-pressed={active}
                  className={cn(
                    'rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.98]',
                    active
                      ? 'border-amber-300/50 bg-amber-300/10'
                      : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]',
                  )}
                  style={active ? { borderColor: `${c.accent}88` } : undefined}
                >
                  <span className="block text-[10px] tabular-nums" style={{ color: c.accent }}>
                    {c.freq}
                  </span>
                  <span className="mt-0.5 block text-[13px] font-medium text-amber-50">{c.name}</span>
                  <span className="mt-0.5 block text-[10px] text-amber-200/40">{c.subtitle}</span>
                </button>
              );
            })}
          </div>

          {channel === 'music' && !pillowUnlocked && (
            <button
              type="button"
              onClick={() => setPillowUnlocked(true)}
              data-testid="radio-unlock-pillow"
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-amber-700/40 py-1.5 text-[10px] text-amber-200/40 transition hover:text-amber-200/70"
            >
              继续向右拨一点 <Lock className="h-3 w-3" />
            </button>
          )}

          {/* 大旋钮 + 音量 */}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => (channel ? void startChannel(channel) : void startChannel('talk'))}
              aria-label={playing ? '暂停电台' : '播放电台'}
              data-testid="radio-play"
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition active:scale-95',
                playing
                  ? 'border-amber-300/60 bg-amber-300 text-[#1a120b]'
                  : 'border-amber-700/50 bg-amber-900/30 text-amber-200',
              )}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 shrink-0 text-amber-200/50" />
                <span className="w-7 shrink-0 text-[10px] text-amber-200/40">环境</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(Number(e.target.value))}
                  aria-label="环境音量"
                  data-testid="radio-ambient-volume"
                  className="w-full accent-amber-400"
                />
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-amber-200/40">
                  {Math.round(ambientVolume * 100)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Volume1 className="h-3.5 w-3.5 shrink-0 text-amber-200/50" />
                <span className="w-7 shrink-0 text-[10px] text-amber-200/40">人声</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(Number(e.target.value))}
                  aria-label="人声音量"
                  data-testid="radio-voice-volume"
                  className="w-full accent-amber-400"
                />
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-amber-200/40">
                  {Math.round(voiceVolume * 100)}%
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-amber-200/35">
                {ambient ? `环境声 · ${ambient}` : channel ? '环境声已停' : '还没开台'}
              </p>
            </div>
          </div>
        </section>

        {/* ── 纸条 ──────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-amber-200/60">
            <Send className="h-3.5 w-3.5" /> 递一张纸条
            {pendingNotes.length > 0 && (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200">
                待念 {pendingNotes.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNote();
              }}
              placeholder="想对他说的话，下一段会念出来…"
              data-testid="radio-note-input"
              className="min-w-0 flex-1 rounded-xl border border-amber-900/40 bg-black/25 px-3 py-2 text-[13px] text-amber-50 outline-none placeholder:text-amber-200/25 focus:border-amber-500/50"
            />
            <button
              type="button"
              onClick={submitNote}
              disabled={!note.trim()}
              data-testid="radio-note-send"
              className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-[12px] font-medium text-[#1a120b] transition active:scale-95 disabled:opacity-30"
            >
              递
            </button>
          </div>
          {delivered.length > 0 && (
            <ul className="mt-2 space-y-1">
              {delivered.slice(-3).map((d, i) => (
                <li key={`${d.at}-${i}`} className="truncate text-[10px] text-amber-200/35">
                  · {d.text}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 故事台：选书 ─────────────────────────── */}
        {channel === 'story' && (
          <section className="mt-6" data-testid="radio-book-picker">
            <h2 className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-200/50">
              <Radio className="h-3.5 w-3.5" /> 从书房拿一本
            </h2>
            {loading ? (
              <p className="text-[12px] text-amber-200/40">正在翻书架…</p>
            ) : books.length === 0 ? (
              <p className="text-[12px] text-amber-200/40">书房里还没有带正文的书，去「一起读」加一本吧。</p>
            ) : (
              <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                {books.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setBook(b);
                      bookRef.current = b;
                      setChapterIdx(0);
                      chapterRef.current = 0;
                      setStatus(`换到《${b.title}》`);
                    }}
                    data-testid={`radio-book-${b.id}`}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-left text-[12px] transition',
                      book?.id === b.id
                        ? 'border-amber-400/50 bg-amber-400/10 text-amber-100'
                        : 'border-white/[0.07] bg-white/[0.03] text-amber-200/60',
                    )}
                  >
                    <span className="block max-w-[9rem] truncate">{b.title}</span>
                    <span className="mt-0.5 block text-[10px] text-amber-200/35">
                      {b.author || '佚名'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── 环境声（白/粉/棕）─────────────────────── */}
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-200/50">
            <Wind className="h-3.5 w-3.5" /> 环境声
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(NOISE_META) as NoiseType[]).map((t) => {
              const on = noise === t;
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`noise-${t}`}
                  onClick={() => {
                    if (on) {
                      stopAmbient();
                      return;
                    }
                    startAmbient(t);
                    if (channel !== 'music') {
                      setChannel('music');
                      channelRef.current = 'music';
                    }
                  }}
                  className={cn(
                    'rounded-2xl border px-2 py-3 text-center transition',
                    on
                      ? 'border-amber-300/50 bg-amber-300 text-[#1a120b]'
                      : 'border-white/[0.07] bg-white/[0.03] text-amber-200/70 hover:bg-white/[0.06]',
                  )}
                >
                  <span className="block text-[12px] font-medium">{NOISE_META[t].label}</span>
                  <span className={cn('mt-0.5 block text-[9px]', on ? 'text-[#1a120b]/60' : 'text-amber-200/30')}>
                    {NOISE_META[t].hint}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 我的哄睡音频 ──────────────────────────── */}
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-200/50">
              <Music2 className="h-3.5 w-3.5" /> 我的哄睡音频
            </h2>
            <div className="flex-1" />
            <label className="flex cursor-pointer items-center gap-1 rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] text-amber-200/50 transition hover:bg-white/[0.06]">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              导入
              <input type="file" accept="audio/*" className="hidden" onChange={onPickFile} />
            </label>
          </div>

          {items.length === 0 ? (
            <p className="px-1 text-[12px] text-amber-200/30">还没有导入音频。</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const isPlaying = playingId === it.id;
                return (
                  <li
                    key={it.id}
                    data-testid="sleep-audio-item"
                    className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => togglePlay(it)}
                        aria-label={isPlaying ? '暂停' : '播放'}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 transition hover:bg-amber-400/25"
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-amber-50">{it.title}</p>
                        <p className="text-[10px] text-amber-200/35">
                          {formatTime(it.duration)}
                          {it.size ? ` · ${(it.size / 1024 / 1024).toFixed(1)} MB` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDelete(it.id)}
                        aria-label="删除"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-200/30 transition hover:bg-rose-500/15 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={isPlaying ? progress : 0}
                      onChange={(e) => {
                        const a = audioRef.current;
                        if (!a || !a.duration) return;
                        const v = Number(e.target.value);
                        a.currentTime = v * a.duration;
                        setProgress(v);
                      }}
                      disabled={!isPlaying}
                      className="mt-2 w-full accent-amber-400 disabled:opacity-30"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── 睡眠定时器 ────────────────────────────── */}
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-200/50">
            <Clock className="h-3.5 w-3.5" /> 睡眠定时器
          </h2>
          {timerMin ? (
            <div className="flex items-center justify-between rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
              <span className="text-[12px] text-amber-100">
                {timerMin} 分钟后停止 · 剩余 {formatTime(timerLeft)}
              </span>
              <button
                type="button"
                onClick={cancelTimer}
                className="rounded-full px-3 py-1 text-[11px] text-amber-200/60 transition hover:bg-white/10"
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
                  className="rounded-full border border-white/[0.07] bg-white/[0.03] px-4 py-1.5 text-[12px] text-amber-100/80 transition hover:bg-white/[0.06]"
                >
                  {m} 分钟
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-[10px] leading-relaxed text-amber-200/30">
            <Moon className="h-3 w-3" /> 到点会自动停掉电台与所有声音。
          </p>
        </section>

        {error && <p className="mt-4 text-center text-[11px] text-rose-400/80">{error}</p>}
      </div>
    </div>
  );
}

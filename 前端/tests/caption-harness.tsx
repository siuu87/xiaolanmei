/**
 * 逐字字幕的**浏览器台架**（dev only，地址 `/tests/caption-harness.html`）。
 *
 * 为什么要有它：
 * 产品里还没有真实录音（TTS 未接），`VoiceBubble` 走的是**估算时钟**，
 * 所以 `verify-voice-caption.js` 只能验「估算态不出跳播时间」这一半。
 * 而 §9 验收表里剩下那一半 —— 停顿保留、词内细分、点词跳词起点、连续点击、
 * 暂停续播、长音频定位、自然结束 vs 中断、DOM 替换 —— **只有挂着真实播放器才验得出来**。
 *
 * 这里就用一段本地合成的静音 WAV 当音源（8kHz/8bit 单声道，1 秒 8KB），
 * 时间戳由用例现场给定，走**和产品同一条后端链路**
 * （`/api/captions/alignment` → 直通适配器 → 同一套算法）回来。
 *
 * 不参与打包：`vite build` 只收 `index.html`，`tests/` 下的 html 只有 dev server 会发。
 * `window.CaptionHarness` 是全部入口，由 `verify-caption-harness.js` 驱动。
 */
import { createRoot, type Root } from 'react-dom/client';
import { useEffect } from 'react';
import { CaptionView } from '@/components/VoiceCaption';
import { useVoiceCaption, type VoiceCaptionState } from '@/lib/caption/useVoiceCaption';
import type { CaptionSource, RecognizedWord } from '@/lib/caption/core';

export interface HarnessConfig {
  /** 音频标识；换个 key 就等于换了一版音频，也用来强制 React 换新实例 */
  key: string;
  text: string;
  /** 传给 hook 的时长；与音频真实时长一致才绑得上对齐结果 */
  durationSec: number;
  /** element = 挂真实 <audio>；sim = 估算时钟（缺省 element） */
  audioFrom?: 'element' | 'sim';
  /** 音频真实时长；缺省 = durationSec */
  audioSeconds?: number;
  /** 调用方自带的对齐原始数据（走后端直通适配器） */
  words?: RecognizedWord[];
  characters?: Array<{ text: string; start: number; end: number }>;
  captionSource?: CaptionSource;
  allowPartial?: boolean;
  autoFetch?: boolean;
}

const audio = document.getElementById('harness-audio') as HTMLAudioElement;
const host = document.getElementById('root') as HTMLElement;

/** 造一段静音 WAV 的 data URL（8kHz / 8bit / 单声道 —— 1 秒 8KB，塞进 data URL 也不炸） */
function silentWavDataUrl(seconds: number, sampleRate = 8000): string {
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const bytes = new Uint8Array(44 + n);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + n, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byteRate
  view.setUint16(32, 1, true); // blockAlign
  view.setUint16(34, 8, true); // 位深
  ascii(36, 'data');
  view.setUint32(40, n, true);
  bytes.fill(128, 44); // 8bit 无符号，128 = 静音
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(raw)}`;
}

/** 换音源并等 metadata 到位（`duration` 这时才可用） */
async function loadAudio(seconds: number): Promise<number> {
  audio.pause();
  audio.src = silentWavDataUrl(seconds);
  await new Promise<void>((resolve) => {
    if (audio.readyState >= 1) return resolve();
    audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
  return audio.duration;
}

const nextFrames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (k: number) => (k <= 0 ? resolve() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });

/** 只在这里把 hook 的返回值抄一份出来给脚本读 —— 不要把 `_clock` 之类带闭包的东西丢出去 */
function snap(s: VoiceCaptionState | null) {
  if (!s) return null;
  const round = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(3)) : null);
  return {
    units: s.units.length,
    text: s.units.join(''),
    timing: s.timingStatus,
    readCount: s.readCount,
    playing: s.playing,
    time: round(s.time),
    duration: round(s.duration),
    alignmentState: s.alignmentState,
    /** 跳播时间：`null` = 没有可靠定位（**不是 0**） */
    seekTimes: s.cues.map((c) => round(c.start)),
    /** 显示细分时间 */
    revealTimes: s.revealTimes.map((t) => round(t)),
  };
}

let latest: VoiceCaptionState | null = null;

function Case({ cfg, onState }: { cfg: HarnessConfig; onState: (s: VoiceCaptionState) => void }) {
  const state = useVoiceCaption({
    text: cfg.text,
    durationSec: cfg.durationSec,
    audioIdentity: cfg.key,
    media: (cfg.audioFrom ?? 'element') === 'element' ? audio : null,
    words: cfg.words,
    characters: cfg.characters,
    source: cfg.captionSource,
    allowPartial: cfg.allowPartial,
    autoFetch: cfg.autoFetch !== false,
  });
  // 每次渲染后同步一份快照出去（写的是模块变量，不会反过来触发渲染）
  useEffect(() => {
    onState(state);
  });
  return <CaptionView state={state} />;
}

const root: Root = createRoot(host);

const api = {
  version: 1,

  /** 换一段指定时长的音频（真实时长决定播放器行为） */
  async setAudio(seconds: number) {
    return loadAudio(seconds);
  },

  /** 挂载/重挂一个用例。`key` 不同 → React 换新实例，hook 状态全新。 */
  async mount(cfg: HarnessConfig) {
    audio.pause();
    audio.currentTime = 0;
    if ((cfg.audioFrom ?? 'element') === 'element') {
      await loadAudio(cfg.audioSeconds ?? cfg.durationSec);
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
    latest = null;
    root.render(<Case key={cfg.key} cfg={cfg} onState={(s) => (latest = s)} />);
    await nextFrames(4);
    return snap(latest);
  },

  /** 卸掉（等于气泡被销毁），顺便把音频停住 */
  unmount() {
    root.render(null);
    audio.pause();
    latest = null;
  },

  snapshot: () => snap(latest),

  /** 播放 / 暂停（走 hook 的 toggle，和产品里那个 ▶ 一样） */
  toggle() {
    latest?.toggle();
  },

  /** 直接挪时钟（测试用，等于用户拖动进度条） */
  seek(seconds: number) {
    latest?._clock?.seek(seconds);
  },

  /** 只对估算时钟有效：模拟"自然播完" */
  fireEnded() {
    (latest?._clock as unknown as { fireEnded?: () => void } | null)?.fireEnded?.();
  },

  audioState() {
    return {
      paused: audio.paused,
      ended: audio.ended,
      currentTime: Number(audio.currentTime.toFixed(3)),
      duration: Number.isFinite(audio.duration) ? Number(audio.duration.toFixed(3)) : null,
      readyState: audio.readyState,
      hasSrc: !!audio.getAttribute('src'),
    };
  },

  /** 清掉后端缓存，好让"慢对慢"的用例不受上一轮影响 */
  async clearServerCache() {
    const res = await fetch('/api/captions/cache/clear', { method: 'POST' });
    return res.json();
  },
};

(window as unknown as { CaptionHarness: typeof api }).CaptionHarness = api;

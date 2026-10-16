/**
 * 播放时钟适配层（NEST 滚动字幕接入契约里的 `AudioClock`）。
 *
 * 字幕只认这个接口，不认具体是 `<audio>`、Web Audio 还是别的播放通道，
 * 所以换播放器不用动字幕逻辑；反过来，**字幕也绝不能自己造时钟** ——
 * 视觉估算一旦冒充播放进度，跳播时间就是假的（原文 §1 / §4）。
 *
 * 采样纪律（原文 §4）：
 *  - 用 `requestAnimationFrame` 采样**播放器真实时钟**，不是 `setInterval` 累加假进度；
 *  - `timeupdate` / `seeked` / `playing` / `loadedmetadata` 用来**校正**；
 *  - 暂停、结束、卸载时取消帧循环。
 */
import type { Alignment } from './core';

export interface AudioClock {
  /** 当前播放位置（秒） */
  readonly currentTime: number;
  /** 时长（秒）。优先采用**解码后的真实时长**。 */
  readonly duration: number;
  readonly paused: boolean;
  /** 这个时钟的时间是否来自真实音频。false = 估算，只能驱动显示，不能产生跳播时间。 */
  readonly measured: boolean;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
}

export interface AudioClockHandlers {
  /** 时间推进（rAF 每帧 + 校正事件） */
  onTime?: (seconds: number) => void;
  /** 自然结束。停止、打断、播放失败**不能**走这个分支（原文 §5）。 */
  onEnded?: () => void;
  /** 拿到（或校正到）解码后的真实时长 */
  onDuration?: (seconds: number) => void;
}

/** 时长兜底上限：超过 3600s 的时间戳一律视为不可信（与 core.ts 的校验一致） */
export const MAX_CLOCK_SECONDS = 3600;

/* ------------------------------------------------------------------ *
 * 真实时钟：HTMLAudioElement
 * ------------------------------------------------------------------ */

/**
 * 给一个 `<audio>` 挂上字幕用的时钟。
 *
 * 注意点（全是 WebKit / 移动端踩出来的）：
 *  - `readyState < 1` 时**不能**赋 `currentTime`，要等 `loadedmetadata`；
 *  - 跳播目标要夹到 `[0, duration - 0.01]`，否则末尾会直接触发 ended；
 *  - 用 `seekVersion` 忽略**过期的 metadata 回调**：连续快速点击时，
 *    旧的回调回来会把新的跳播目标覆盖掉；
 *  - 显式跳播打 `explicitSeek` 标记，避免"恢复播放"逻辑把进度重置回开头。
 */
export function createMediaElementClock(
  el: HTMLAudioElement,
  handlers: AudioClockHandlers = {},
): AudioClock & { dispose: () => void } {
  let raf = 0;
  let disposed = false;
  /** 每次显式 seek 自增；metadata 回调回来时对不上就丢弃 */
  let seekVersion = 0;
  /** 有没有一次还没落地的显式跳播 */
  let explicitSeek = false;

  const emitTime = () => handlers.onTime?.(el.currentTime);
  const emitDuration = () => {
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) handlers.onDuration?.(Math.min(d, MAX_CLOCK_SECONDS));
  };

  const loop = () => {
    if (disposed) return;
    emitTime();
    raf = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };
  const stopLoop = () => cancelAnimationFrame(raf);

  const onLoaded = () => {
    emitDuration();
    // 有一次待落地的跳播：等 metadata 到位后再赋值（此时才有 duration 可夹）
    if (explicitSeek) applySeek(pendingSeconds);
  };
  const onSeeked = () => emitTime();
  const onPlaying = () => startLoop();
  const onPause = () => {
    stopLoop();
    emitTime();
  };
  const onEnd = () => {
    stopLoop();
    emitTime(); // 结束这一拍要把进度推到末尾，末尾标点才会一起变深
    handlers.onEnded?.();
  };

  /** 待落地的跳播目标（等 loadedmetadata） */
  let pendingSeconds = 0;

  function applySeek(seconds: number) {
    const d = el.duration;
    const max = Number.isFinite(d) && d > 0 ? d - 0.01 : MAX_CLOCK_SECONDS;
    const target = Math.max(0, Math.min(max, seconds));
    el.currentTime = target;
    explicitSeek = false;
    emitTime();
  }

  el.addEventListener('loadedmetadata', onLoaded);
  el.addEventListener('seeked', onSeeked);
  el.addEventListener('playing', onPlaying);
  el.addEventListener('pause', onPause);
  el.addEventListener('ended', onEnd);
  el.addEventListener('timeupdate', emitTime);

  // 已经加载好的话立刻取一次时长
  if (el.readyState >= 1) emitDuration();

  return {
    get currentTime() {
      return el.currentTime;
    },
    get duration() {
      const d = el.duration;
      return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_CLOCK_SECONDS) : 0;
    },
    get paused() {
      return el.paused;
    },
    measured: true,
    async play() {
      // 注意：**不要** await 对齐结果再 play —— 音频先走（原文 §1 / §4）
      await el.play();
      startLoop();
    },
    pause() {
      el.pause();
      stopLoop();
    },
    seek(seconds: number) {
      seekVersion++;
      const myVersion = seekVersion;
      explicitSeek = true;
      pendingSeconds = seconds;
      if (el.readyState >= 1) {
        applySeek(seconds);
      } else {
        // 还没 metadata：等 loadedmetadata 那个回调；期间若又点了一次，旧回调会因版本不符被丢弃
        const onceLoaded = () => {
          el.removeEventListener('loadedmetadata', onceLoaded);
          if (myVersion !== seekVersion) return;
          applySeek(pendingSeconds);
        };
        el.addEventListener('loadedmetadata', onceLoaded);
      }
    },
    dispose() {
      disposed = true;
      stopLoop();
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('timeupdate', emitTime);
    },
  };
}

/* ------------------------------------------------------------------ *
 * 估算时钟：当前还没有真实录音时的占位
 * ------------------------------------------------------------------ */

/**
 * **估算时钟**：没有真实音频时用它驱动「逐字变深」的显示。
 *
 * 它 `measured === false`，所以：
 *  - 已读前缀按播放比例估算，**只用于显示**；
 *  - 调用方必须据此把 `data-timing-status` 标成 `estimated`；
 *  - **不能**用它生成任何可点击的跳播时间。
 *
 * 等真实录音接上（TTS / 上传的语音 / `<audio>`）就换成 `createMediaElementClock`。
 */
export function createSimulatedClock(
  durationSeconds: number,
  handlers: AudioClockHandlers = {},
): AudioClock & { dispose: () => void; fireEnded: () => void } {
  let elapsed = 0;
  let last = 0;
  let raf = 0;
  let playing = false;
  const duration = Math.max(0, Math.min(MAX_CLOCK_SECONDS, durationSeconds || 0));

  const loop = (now: number) => {
    if (!playing) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    elapsed = Math.min(duration, elapsed + dt);
    handlers.onTime?.(elapsed);
    if (elapsed >= duration - 0.02) {
      playing = false;
      handlers.onTime?.(duration); // 自然结束：把进度推到末尾
      handlers.onEnded?.();
      return;
    }
    raf = requestAnimationFrame(loop);
  };

  handlers.onDuration?.(duration);

  return {
    get currentTime() {
      return elapsed;
    },
    get duration() {
      return duration;
    },
    get paused() {
      return !playing;
    },
    measured: false,
    async play() {
      if (playing || duration <= 0) return;
      if (elapsed >= duration - 0.02) elapsed = 0; // 播完了再点 = 从头
      playing = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
      handlers.onTime?.(elapsed);
    },
    seek(seconds: number) {
      elapsed = Math.max(0, Math.min(duration - 0.01, seconds));
      handlers.onTime?.(elapsed);
    },
    /** 供「打断」用：不触发 onEnded（中断不能当成自然结束） */
    dispose() {
      playing = false;
      cancelAnimationFrame(raf);
    },
    fireEnded() {
      playing = false;
      cancelAnimationFrame(raf);
      elapsed = duration;
      handlers.onTime?.(duration);
      handlers.onEnded?.();
    },
  };
}

/* ------------------------------------------------------------------ *
 * 对齐结果绑定校验
 * ------------------------------------------------------------------ */

/**
 * 绑定对齐结果前的四项检查（原文 §2）：
 * 文本、音频标识、时长、以及**每个 grapheme 是否完全相等**。
 *
 * 音频重新合成或正文被编辑后，旧时间戳必须失效 ——
 * 只校验消息 id 是不够的，文字改一个字，整条时间轴就错位了。
 */
export function alignmentMatches(
  alignment: Alignment | null | undefined,
  expect: { text: string; audioIdentity: string; duration: number; units: string[] },
  toleranceSeconds = 0.5,
): boolean {
  if (!alignment) return false;
  if (alignment.text !== expect.text) return false;
  if (alignment.audioIdentity !== expect.audioIdentity) return false;
  if (Math.abs(alignment.duration - expect.duration) > toleranceSeconds) return false;
  if (alignment.cues.length !== expect.units.length) return false;
  return alignment.cues.every((c, i) => c.text === expect.units[i]);
}

/** 缓存键：`SHA-256(audioIdentity + "\n" + visibleText)` —— 只按消息 id 缓存是不行的 */
export async function captionCacheKey(audioIdentity: string, visibleText: string): Promise<string> {
  const data = new TextEncoder().encode(`${audioIdentity}\n${visibleText}`);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 没有 WebCrypto（老 WebView / 非安全上下文）就退回一个非加密指纹：
  // 它只用来做缓存去重，不承担任何安全职责。
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const b of data) {
    h1 = Math.imul(h1 ^ b, 16777619) >>> 0;
    h2 = Math.imul(h2 + b, 2246822519) >>> 0;
  }
  return `fnv-${h1.toString(16)}${h2.toString(16)}-${data.length}`;
}

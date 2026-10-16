/**
 * 逐字字幕的状态机（NEST 滚动字幕接入契约 §4）。
 *
 * 把「时钟 → 对齐 → 显示时间 → 已读前缀」这条链子收在一个 hook 里，
 * 视图只负责画字和转发点击。这样换播放通道（模拟时钟 / `<audio>` / Web Audio）
 * 不用动视图，换视图也不用动这里。
 *
 * 三条纪律（都来自原文，别改）：
 *  1. **音频先走，对齐异步**：`play()` 绝不 await 对齐结果。
 *  2. **seekTime 与 revealTime 分开**：`cues[i].start` 是跳播时间（词的起点），
 *     `revealTimes[i]` 只用来决定"什么时候变深"。点词内任一字都跳 `cues[i].start`。
 *  3. **没有测量时间就只估算**：`timingStatus === 'estimated'` 时不能给任何跳播时间。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  readCountAt,
  voiceRevealTimes,
  voiceTextUnits,
  type Alignment,
  type CaptionSource,
  type Cue,
} from './core';
import { alignmentMatches, createMediaElementClock, createSimulatedClock, type AudioClock } from './audioClock';
import { requestAlignment, type AlignmentInput } from './alignment';

export type TimingStatus = 'measured' | 'estimated';

export interface UseVoiceCaptionOptions {
  /** 要逐字显示的文字（**原文，不是规范化后的**） */
  text: string;
  /** 时长（秒）。没有真实录音时它就是估算时钟的总长。 */
  durationSec: number;
  /** 音频内容哈希 / 不可变版本 ID。变了 → 旧时间轴作废。 */
  audioIdentity: string;
  /** 有真实录音时传元素；不传则用估算时钟（只驱动显示，不给跳播） */
  media?: HTMLAudioElement | null;
  /** 词级/字符级原始数据。给了就随请求一起提交，服务端只做校验+缓存。 */
  words?: AlignmentInput['words'];
  characters?: AlignmentInput['characters'];
  source?: CaptionSource;
  allowPartial?: boolean;
  /** 关掉自动请求（脚本里想手动控制时用） */
  autoFetch?: boolean;
}

export interface VoiceCaptionState {
  units: string[];
  cues: Cue[];
  revealTimes: Array<number | null>;
  /** 已读的 grapheme 个数 */
  readCount: number;
  timingStatus: TimingStatus;
  /** 已读不倒退（仅流式用；普通回放不启用） */
  playing: boolean;
  time: number;
  duration: number;
  /** 对齐数据的加载状态 */
  alignmentState: 'idle' | 'loading' | 'ready' | 'none';
  /** 点字跳播。**只有 `cues[i].start` 是有限值时才调用得通**。 */
  seekToCue: (index: number) => boolean;
  toggle: () => void;
  /** 供测试注入模拟时钟时间 */
  _clock: AudioClock | null;
}

export function useVoiceCaption(options: UseVoiceCaptionOptions): VoiceCaptionState {
  const { text, durationSec, audioIdentity, media, words, characters, source, allowPartial, autoFetch = true } = options;

  const units = useMemo(() => {
    const list = voiceTextUnits(text).map((u) => u.char);
    return list.length ? list : [''];
  }, [text]);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSec);
  const [playing, setPlaying] = useState(false);
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  const [alignmentState, setAlignmentState] = useState<VoiceCaptionState['alignmentState']>('idle');
  const clockRef = useRef<AudioClock | null>(null);
  const [, forceRender] = useState(0);

  /* ---------------- 时钟：真实 <audio> 优先，否则估算 ---------------- */

  useEffect(() => {
    setTime(0);
    setAlignment(null);
    setAlignmentState('idle');
    setPlaying(false);

    const handlers = {
      onTime: (t: number) => setTime(t),
      onDuration: (d: number) => setDuration(d),
      onEnded: () => setPlaying(false),
    };
    const clock = media ? createMediaElementClock(media, handlers) : createSimulatedClock(durationSec, handlers);
    clockRef.current = clock;
    forceRender((n) => n + 1);
    return () => {
      clock.dispose();
      if (clockRef.current === clock) clockRef.current = null;
    };
  }, [media, durationSec]);

  // 时钟换了之后把它同步到 state（duration 可能来自解码后的真实值）
  const clock = clockRef.current;
  useEffect(() => {
    if (clock) setDuration(clock.duration || durationSec);
  }, [clock, durationSec]);

  /* ---------------- 对齐：异步取，失败不阻塞播放 ---------------- */

  /**
   * provider 数据按**内容**参与依赖，不按引用。
   *
   * 调用方很自然会把 `words={[...]}` 这样写成内联数组 —— 每次渲染都是新引用，
   * 直接拿它当 effect 依赖就等于每帧重发一次请求。序列化成字符串之后，
   * 内容没变引用变了也不会重跑；内容真变了一定会重跑。
   */
  const providerKey = useMemo(
    () =>
      words || characters
        ? JSON.stringify([source ?? '', allowPartial === true, words ?? null, characters ?? null])
        : '',
    [words, characters, source, allowPartial],
  );

  useEffect(() => {
    if (!autoFetch) return;
    if (!audioIdentity || !text) {
      setAlignmentState('none');
      return;
    }
    let alive = true;
    const ac = new AbortController();
    setAlignmentState('loading');
    /**
     * **旧的先摘掉，不等新结果回来。**
     *
     * 正文改了 / 换了音频（`audioIdentity` 变）时，旧的时间轴立刻就不成立了
     * （原文 §2 的四项检查、§4 的"音频标识变化即失效"）。如果留着它等响应，
     * 这段时间里 `units` 已经是新文本、`cues` 还是旧的 —— 字数对不上，
     * 界面上就会拿**上一句**的时间戳去标注这一句的字。
     * 摘干净后这段时间会自然退回估算态，读起来是"还没对齐"，而不是"对齐错了"。
     */
    setAlignment(null);
    void requestAlignment(
      { text, audioIdentity, duration: durationSec, words, characters, source, allowPartial },
      { signal: ac.signal },
    ).then((res) => {
      if (!alive) return;
      // 绑上前再校验一次：文本 / 音频标识 / 时长 / 逐字相等，任一不符就丢弃
      const ok = alignmentMatches(res.alignment, {
        text,
        audioIdentity,
        duration: durationSec,
        units,
      });
      setAlignment(ok ? res.alignment : null);
      setAlignmentState(ok ? 'ready' : 'none');
    });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [text, audioIdentity, durationSec, providerKey, autoFetch, units]);

  /* ---------------- 派生：cue / 显示时间 / 已读前缀 ---------------- */

  const cues = useMemo<Cue[]>(
    () =>
      alignment?.cues ??
      units.map((char) => ({ text: char, start: null, end: null })),
    [alignment, units],
  );

  // 来源缺省按词级处理：这样同一词里的多个字在**显示**上会摊开，而跳播时间不变
  const revealSource: CaptionSource = alignment?.source ?? source ?? 'deepgram-word-timestamps';
  const revealTimes = useMemo(() => voiceRevealTimes(cues, revealSource), [cues, revealSource]);

  const hasMeasured = useMemo(() => cues.some((c) => Number.isFinite(c.start)), [cues]);
  const timingStatus: TimingStatus = hasMeasured ? 'measured' : 'estimated';

  const readCount = useMemo(
    () => readCountAt(time, duration, cues, revealTimes, units.length),
    [time, duration, cues, revealTimes, units.length],
  );

  /* ---------------- 操作 ---------------- */

  const toggle = useCallback(() => {
    const c = clockRef.current;
    if (!c) return;
    if (c.paused) {
      setPlaying(true);
      void c.play().catch(() => setPlaying(false));
    } else {
      c.pause();
      setPlaying(false);
    }
    // 不 await 对齐 —— 音频先走
  }, []);

  const seekToCue = useCallback(
    (index: number) => {
      const cue = cues[index];
      // start 为 null 就是没有可靠时间戳：**不能**当成 0
      if (!cue || !Number.isFinite(cue.start)) return false;
      clockRef.current?.seek(cue.start as number);
      setTime(cue.start as number);
      return true;
    },
    [cues],
  );

  // 播放中由时钟驱动 time；暂停时也要把最终位置同步回来
  useEffect(() => {
    const c = clockRef.current;
    if (!c) return;
    setTime(c.currentTime);
  }, [playing]);

  return {
    units,
    cues,
    revealTimes,
    readCount,
    timingStatus,
    playing,
    time,
    duration,
    alignmentState,
    seekToCue,
    toggle,
    _clock: clock,
  };
}

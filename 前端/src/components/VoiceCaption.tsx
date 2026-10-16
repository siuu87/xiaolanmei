/**
 * 逐字字幕视图（NEST 滚动字幕接入契约 §1 / §8）。
 *
 * 只负责画字和转发交互；时钟、对齐、已读前缀全在 `useVoiceCaption` 里。
 * 分两层，因为**同一处只能有一个时钟**：
 *  - `CaptionView` —— 纯渲染，状态由外面喂（气泡里播放键和字幕要共用同一个实例）；
 *  - `VoiceCaption` —— 自给自足，自己 `useVoiceCaption()`（独立使用时最省事）。
 * 如果让两边各调一次 hook，就会出现两个时钟：播放键走一个、字变深走另一个，进度对不上。
 *
 * 视觉：**用宿主自己的主题** —— 未读 = `opacity-45`，已读 = 全不透明，
 * 颜色一律 `currentColor`，所以放在我方气泡、对方气泡、深色/浅色下都自动成立。
 * （上游的 NEST 气泡样式不在开源范围内，也不该被复刻 —— 原文 §8 / §10 明确要求。）
 *
 * 可访问性：逐字按钮会让长文产生几十上百个 Tab 停靠点，所以**不是**每个字一个 button，
 * 而是整个字幕区一个停靠点 + 方向键移动光标 + Enter 定位（roving cursor）。
 * 没有可靠时间戳时（`estimated`）连这一个停靠点也不给 —— 免得留个按了没反应的 Tab 站。
 */
import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useVoiceCaption, type UseVoiceCaptionOptions, type VoiceCaptionState } from '@/lib/caption/useVoiceCaption';

/* ------------------------------------------------------------------ *
 * 渲染层：状态从外面来
 * ------------------------------------------------------------------ */

export interface CaptionViewProps {
  /** `useVoiceCaption()` 的返回值 */
  state: VoiceCaptionState;
  className?: string;
  /** 估算态下是否显示「字幕未对齐」小字（默认不显示，避免干扰气泡原有版式） */
  showEstimateHint?: boolean;
  /** 播放/暂停由外部控制时（比如气泡自己有播放键），按 P 转发过去 */
  onToggle?: () => void;
}

/**
 * 把逐字字幕渲染出来。
 *
 * 每个字上带：
 *  - `data-seek-time`：**只有拿到可靠时间戳才写**。没写 = 不可点。绝不写 0 来冒充。
 *  - `data-reveal-time`：显示用的细分时间（可能和 seek 时间不同，这是有意的）。
 *  - `data-read="1"`：已读。
 * 容器上带 `data-timing-status="measured|estimated"`。
 */
export function CaptionView({ state: cap, className, showEstimateHint = false, onToggle }: CaptionViewProps) {
  const [cursor, setCursor] = useState(-1);

  /** 能跳的字（有可靠 start）的下标，供方向键在它们之间走 */
  const seekable = useMemo(
    () => cap.cues.map((c, i) => (Number.isFinite(c.start) ? i : -1)).filter((i) => i >= 0),
    [cap.cues],
  );

  const move = useCallback(
    (dir: 1 | -1) => {
      if (!seekable.length) return;
      const at = seekable.indexOf(cursor);
      const next =
        at < 0
          ? dir === 1
            ? seekable[0]
            : seekable[seekable.length - 1]
          : seekable[Math.min(seekable.length - 1, Math.max(0, at + dir))];
      setCursor(next);
    },
    [cursor, seekable],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        move(-1);
      } else if ((e.key === 'Enter' || e.key === ' ') && cursor >= 0) {
        e.preventDefault();
        cap.seekToCue(cursor);
      } else if (onToggle && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onToggle();
      }
    },
    [cursor, move, cap, onToggle],
  );

  const jumpable = seekable.length > 0;

  return (
    <span
      data-testid="voice-caption"
      data-timing-status={cap.timingStatus}
      data-read-count={cap.readCount}
      data-total={cap.units.length}
      data-alignment={cap.alignmentState}
      role={jumpable ? 'group' : undefined}
      aria-label={jumpable ? '逐字字幕，用左右方向键选字、回车跳到那一句' : undefined}
      tabIndex={jumpable ? 0 : -1}
      onKeyDown={onKeyDown}
      className={cn(
        'inline leading-relaxed',
        // 有可靠时间戳时才提示"可点"；估算态不给这个暗示
        jumpable && 'cursor-pointer rounded outline-none focus-visible:ring-1 focus-visible:ring-current/40',
        className,
      )}
    >
      {cap.units.map((char, i) => {
        const read = i < cap.readCount;
        const cue = cap.cues[i];
        const seekTime = Number.isFinite(cue?.start) ? (cue.start as number) : null;
        const reveal = cap.revealTimes[i];
        return (
          <span
            key={i}
            data-idx={i}
            data-read={read ? '1' : '0'}
            // 只有可靠时间戳才写 seek-time；没有就不写属性，**不写 0**
            {...(seekTime !== null ? { 'data-seek-time': seekTime } : {})}
            {...(Number.isFinite(reveal) ? { 'data-reveal-time': reveal } : {})}
            {...(i === cursor ? { 'data-cursor': '1' } : {})}
            onClick={
              seekTime !== null
                ? (e: React.MouseEvent) => {
                    e.stopPropagation();
                    setCursor(i);
                    cap.seekToCue(i);
                  }
                : undefined
            }
            className={cn(
              'transition-opacity duration-150',
              read ? 'opacity-100' : 'opacity-45',
              seekTime !== null && 'hover:opacity-80',
              i === cursor && 'rounded bg-current/20',
            )}
          >
            {char}
          </span>
        );
      })}
      {showEstimateHint && cap.timingStatus === 'estimated' && (
        <span data-testid="caption-estimate-hint" className="ml-1 text-[10px] opacity-45">
          （字幕未对齐，仅供显示）
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * 自给自足层：自己建时钟
 * ------------------------------------------------------------------ */

export interface VoiceCaptionProps extends Omit<UseVoiceCaptionOptions, 'text' | 'durationSec' | 'audioIdentity'> {
  text: string;
  durationSec: number;
  audioIdentity: string;
  className?: string;
  /** 估算态下是否显示「字幕未对齐」小字 */
  showEstimateHint?: boolean;
  /** 播放/暂停由外部控制时（比如气泡自己有播放键）就不要这里的按钮 */
  onToggle?: () => void;
}

/** 独立使用：内部 `useVoiceCaption()` 自建时钟。要和别的控件联动就用 `<CaptionView>`。 */
export function VoiceCaption({
  text,
  durationSec,
  audioIdentity,
  className,
  showEstimateHint,
  onToggle,
  ...rest
}: VoiceCaptionProps) {
  const state = useVoiceCaption({ text, durationSec, audioIdentity, ...rest });
  return <CaptionView state={state} className={className} showEstimateHint={showEstimateHint} onToggle={onToggle} />;
}

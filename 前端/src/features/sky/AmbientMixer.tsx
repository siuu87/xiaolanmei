/**
 * 环境声混音台（2026-10-21）
 *
 * 用户：『电台加几个可以波动的上下拨钮…然后去掉白噪音棕噪音什么的，
 * 然后变成雨声壁炉还有风声，波动就播放可以叠加』
 *
 * 所以这里不是「点一下切一个」的按钮，而是**三个竖向推子**：
 * - 往上推 = 出声，推多高就多响；推回底 = 静音（不是「关掉」，是这条轨淡出）
 * - 三条互不干扰，**可以同时出声叠加**（雨 + 壁炉 + 风 = 深夜小屋）
 * - 静音是 0，所以「有没有在播」= 值是否大于 0，不需要额外开关
 *
 * 为什么自己画轨道而不用 `<input type="range">`：
 * 垂直 range 在各家浏览器上的写法和外观都不一致（`writing-mode` / `appearance:slider-vertical`），
 * 而且没法做「推钮是一根横杠」的调音台质感。这里用 pointer 事件自己算位置，
 * 手指按在轨道任意位置就直接跳过去，按住拖动连续跟手。
 */
import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

export type LayerId = 'rain' | 'fire' | 'wind';

export interface LayerMeta {
  id: LayerId;
  label: string;
  hint: string;
  /** 推子填充色 */
  accent: string;
  /** 推钮高光 */
  glow: string;
}

export const AMBIENT_LAYERS: LayerMeta[] = [
  { id: 'rain', label: '雨声', hint: '窗外在下雨', accent: '#6fa8c8', glow: 'rgba(111,168,200,.45)' },
  { id: 'fire', label: '壁炉', hint: '柴火在响', accent: '#d9854f', glow: 'rgba(217,133,79,.45)' },
  { id: 'wind', label: '风声', hint: '夜里的风', accent: '#8fae9a', glow: 'rgba(143,174,154,.45)' },
];

export const LAYER_LABEL: Record<LayerId, string> = {
  rain: '雨声',
  fire: '壁炉',
  wind: '风声',
};

/** 轨道可视高度（px）——推子越高越好拖 */
const TRACK_H = 108;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

function Fader({
  meta,
  value,
  onChange,
}: {
  meta: LayerMeta;
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  /** 按在轨道上的位置直接换算成音量：顶端 = 1，底端 = 0 */
  const setFromPointer = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const v = 1 - (clientY - r.top) / r.height;
      onChange(round2(clamp01(v)));
    },
    [onChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromPointer(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromPointer(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 已经释放过了 */
    }
  };

  const pct = Math.round(value * 100);
  const on = pct > 0;

  return (
    <div className="flex flex-col items-center gap-1.5" data-testid={`fader-box-${meta.id}`}>
      <span
        className={cn(
          'text-[10px] tabular-nums transition-colors',
          on ? 'text-foreground' : 'text-muted-foreground/40',
        )}
      >
        {pct}
      </span>

      {/* 轨道：整块都是热区，点哪跳哪 */}
      <div
        ref={trackRef}
        data-testid={`fader-${meta.id}`}
        data-level={pct}
        data-on={on ? '1' : '0'}
        role="slider"
        tabIndex={0}
        aria-label={`${meta.label}音量`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(round2(clamp01(value + 0.05)));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(round2(clamp01(value - 0.05)));
          } else if (e.key === 'Home') {
            e.preventDefault();
            onChange(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            onChange(1);
          }
        }}
        className={cn(
          'relative w-8 cursor-ns-resize touch-none select-none rounded-full',
          'bg-surface-sunken ring-1 ring-inset transition-shadow',
          on ? 'ring-gold/40' : 'ring-border',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
        )}
        style={{
          height: TRACK_H,
          boxShadow: on ? `inset 0 0 22px ${meta.glow}` : undefined,
        }}
      >
        {/* 已推起的部分 */}
        <span
          className="pointer-events-none absolute inset-x-1 bottom-1 rounded-full transition-[height] duration-75"
          style={{
            height: `calc(${pct}% - ${pct > 0 ? 4 : 0}px)`,
            background: `linear-gradient(to top, ${meta.accent}22, ${meta.accent}cc)`,
          }}
        />
        {/* 推钮：一根横杠，像调音台 */}
        <span
          className="pointer-events-none absolute left-1/2 h-2.5 w-7 -translate-x-1/2 rounded-[3px] transition-[bottom] duration-75"
          style={{
            bottom: `calc(${pct}% - 5px)`,
            background: on
              ? 'linear-gradient(to bottom, hsl(var(--gold)), hsl(var(--gold) / 0.72))'
              : 'linear-gradient(to bottom, hsl(var(--muted-foreground) / 0.75), hsl(var(--muted-foreground) / 0.45))',
            boxShadow: on
              ? `0 1px 4px rgba(0,0,0,.55), 0 0 10px ${meta.glow}`
              : '0 1px 3px rgba(0,0,0,.5)',
          }}
        />
        {/* 中线刻度 */}
        <span className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-border" />
      </div>

      <span
        className={cn(
          'text-[11px] font-medium transition-colors',
          on ? 'text-foreground' : 'text-muted-foreground/50',
        )}
      >
        {meta.label}
      </span>
      <span className="text-[9px] text-muted-foreground/50">{meta.hint}</span>
    </div>
  );
}

export function AmbientMixer({
  levels,
  onChange,
}: {
  levels: Record<LayerId, number>;
  onChange: (id: LayerId, v: number) => void;
}) {
  const active = AMBIENT_LAYERS.filter((l) => levels[l.id] > 0);
  return (
    <div data-testid="ambient-mixer">
      <div className="flex items-start justify-around gap-2 rounded-2xl border border-border bg-surface-2 px-2 py-3">
        {AMBIENT_LAYERS.map((m) => (
          <Fader key={m.id} meta={m} value={levels[m.id]} onChange={(v) => onChange(m.id, v)} />
        ))}
      </div>
      <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
        {active.length === 0
          ? '往上推就出声，几条一起推会叠在一起'
          : `正在播 · ${active.map((l) => l.label).join(' + ')}`}
      </p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PAPER_GRAIN, inkCircle, inkLine, inkRect, inkRules } from './ink';

/**
 * 手绘墨线组件（2026-11-13）
 *
 * 每个组件都是「一层绝对定位的 SVG 垫在真实 DOM 下面/上面」：
 * 文字、按钮、输入框全是普通的 HTML，只是一眼看上去像用笔画出来的。
 * 描边颜色统一 currentColor，所以深浅主题只要换 class 就行。
 */

interface InkRectProps {
  w: number;
  h: number;
  r?: number;
  seed?: string;
  amp?: number;
  strokeWidth?: number;
  /** 描边的颜色（用 currentColor，这里给的是文字色 class） */
  className?: string;
  style?: CSSProperties;
  /** 叠几遍：手画的框很少一笔到位，两遍最像 */
  laps?: number;
  /** 虚线（例如「新建一本」的虚线框） */
  dash?: string;
}

const LAP_OPACITY = [0.85, 0.45, 0.3];

export function InkRect({
  w,
  h,
  r = 7,
  seed = 'ink',
  amp = 1.1,
  strokeWidth = 1.3,
  className = '',
  style,
  laps = 2,
  dash,
}: InkRectProps) {
  const paths = useMemo(() => {
    if (w < 2 || h < 2) return [];
    return Array.from({ length: Math.max(1, laps) }, (_, i) =>
      inkRect(w, h, r, { seed: `${seed}-${i}`, amp: i === 0 ? amp : amp * 1.3 }),
    );
  }, [w, h, r, seed, amp, laps]);

  if (!paths.length) return null;

  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={style}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} strokeWidth={strokeWidth} strokeDasharray={dash} opacity={LAP_OPACITY[i] ?? 0.3} />
      ))}
    </svg>
  );
}

/** 手画的圈：给页码、图标按钮用 */
export function InkRing({
  size,
  seed = 'ring',
  amp = 1,
  strokeWidth = 1.3,
  className = '',
  laps = 2,
}: {
  size: number;
  seed?: string;
  amp?: number;
  strokeWidth?: number;
  className?: string;
  laps?: number;
}) {
  const paths = useMemo(() => {
    if (size < 4) return [];
    const c = size / 2;
    return Array.from({ length: Math.max(1, laps) }, (_, i) =>
      inkCircle(c, c, c - 1.2, { seed: `${seed}-${i}`, amp }),
    );
  }, [size, seed, amp, laps]);

  if (!paths.length) return null;

  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} strokeWidth={strokeWidth} opacity={LAP_OPACITY[i] ?? 0.3} />
      ))}
    </svg>
  );
}

/**
 * 一张纸的质感：纸纹 + （可选）横格与左侧红线 + 手画的外框。
 * 铺在最底层，不接事件，不影响任何排版。
 */
export function PaperTexture({
  w,
  h,
  r = 7,
  seed = 'paper',
  rules = false,
  ruleTop = 64,
  ruleGap = 30,
  margin,
  outline = true,
}: {
  w: number;
  h: number;
  r?: number;
  seed?: string;
  rules?: boolean;
  ruleTop?: number;
  ruleGap?: number;
  /** 竖着的这道红线画在哪个 x（不传就不画） */
  margin?: number;
  outline?: boolean;
}) {
  const rulePaths = useMemo(
    () => (rules ? inkRules(w, h, ruleTop, ruleGap, { seed: `${seed}-rule` }) : []),
    [rules, w, h, ruleTop, ruleGap, seed],
  );
  const marginPath = useMemo(
    () => (margin === undefined ? null : inkLine(margin, ruleTop - 18, margin, h - 10, { seed: `${seed}-margin`, amp: 0.7 })),
    [margin, ruleTop, h, seed],
  );

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.055] mix-blend-multiply dark:opacity-[0.08] dark:mix-blend-soft-light"
        style={{ backgroundImage: PAPER_GRAIN, backgroundSize: '140px 140px' }}
      />
      {rulePaths.length > 0 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 text-[#8fa3b8] opacity-[0.13] dark:text-[#a8bccd] dark:opacity-[0.11]"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
        >
          {rulePaths.map((d, i) => (
            <path key={i} d={d} strokeWidth={0.9} />
          ))}
          {marginPath && <path d={marginPath} strokeWidth={1} stroke="#cf8f8f" strokeOpacity={0.6} />}
        </svg>
      )}
      {outline && (
        <InkRect
          w={w}
          h={h}
          r={r}
          seed={`${seed}-edge`}
          className="text-[#8b8172]/45 dark:text-[#c9c1b4]/25"
          strokeWidth={1.1}
        />
      )}
    </>
  );
}

/** 一小条胶带（斜着贴在照片 / 便签上） */
export function InkTape({
  w = 34,
  h = 12,
  className = '',
  seed = 'tape',
}: {
  w?: number;
  h?: number;
  className?: string;
  seed?: string;
}) {
  const pts = useMemo(() => {
    const path = inkRect(w, h, 1, { seed, amp: 1.6, inset: 0.5 });
    return path;
  }, [w, h, seed]);

  return (
    <svg
      aria-hidden
      className={`pointer-events-none ${className}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
    >
      <path d={pts} fill="currentColor" opacity="0.55" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * 给任意大小的元素套一圈手画的边（按钮、标签这种宽度不固定的地方用）。
 * 自己量尺寸，量到才画，所以不会出现一条错位的框。
 */
export function InkBorder({
  children,
  className = '',
  r = 999,
  seed = 'border',
  amp = 1.15,
  strokeWidth = 1.3,
  laps = 2,
  dash,
  style,
}: {
  children?: ReactNode;
  className?: string;
  r?: number;
  seed?: string;
  amp?: number;
  strokeWidth?: number;
  laps?: number;
  dash?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      // 用 offsetWidth/Height：整数、且不吃 transform（斜着的标签也能对上）
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setBox((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={{ position: 'relative', ...style }}>
      {children}
      {box.w > 2 && (
        <InkRect
          w={box.w}
          h={box.h}
          r={Math.min(r, box.h / 2)}
          seed={seed}
          amp={amp}
          strokeWidth={strokeWidth}
          laps={laps}
          dash={dash}
        />
      )}
    </div>
  );
}

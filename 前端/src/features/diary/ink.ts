/**
 * 手绘墨线引擎（2026-11-13，参考 kevintngo/looseleaf 的做法）
 *
 * 思路：所有「纸上的线」都不是 CSS 边框，而是一条用种子抖动出来的 SVG 路径。
 * 同一个种子画出来的线永远一样（不会每次渲染都抖），颜色走 currentColor
 * 所以深浅色主题能直接跟着变。
 *
 * 这里只做日记本需要的最小集合：圆角框、圆、直线、横格。
 */

export type Pt = [number, number];

/** 字符串 → 稳定种子（FNV-1a） */
export function hashSeed(key: string | number): number {
  if (typeof key === 'number') return (Math.abs(Math.trunc(key)) % 4294967291 || 1) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 可复现随机流（mulberry32） */
export function rngOf(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n2 = (v: number) => Math.round(v * 100) / 100;

/** 低频平滑噪声：手抖是缓慢起伏的，不是逐点乱跳 */
function smoothNoise(rnd: () => number, n: number, knots: number): number[] {
  const k = Math.max(3, Math.min(knots, n));
  const vals: number[] = [];
  for (let i = 0; i < k; i++) vals.push(rnd() * 2 - 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * k;
    const i0 = Math.floor(t);
    const f = t - i0;
    const s = 0.5 - 0.5 * Math.cos(Math.PI * f);
    const a = vals[i0 % k];
    const b = vals[(i0 + 1) % k];
    out.push(a + (b - a) * s);
  }
  return out;
}

/** 点列 → 平滑路径（Catmull-Rom 转三次贝塞尔） */
function smoothPath(pts: Pt[], closed: boolean): string {
  const n = pts.length;
  if (n < 2) return '';
  const at = (i: number): Pt => pts[closed ? (i + n) % n : Math.min(n - 1, Math.max(0, i))];
  let d = `M${n2(at(0)[0])} ${n2(at(0)[1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${n2(c1x)} ${n2(c1y)} ${n2(c2x)} ${n2(c2y)} ${n2(p2[0])} ${n2(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** 沿法线方向叠加低频抖动 */
function wobble(pts: Pt[], rnd: () => number, amp: number, closed: boolean): Pt[] {
  const n = pts.length;
  if (n < 3 || amp <= 0) return pts;
  const nx = smoothNoise(rnd, n, Math.max(3, Math.round(n / 7)));
  const ny = smoothNoise(rnd, n, Math.max(3, Math.round(n / 7)));
  return pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const nX = -ty / len;
    const nY = tx / len;
    return [p[0] + nX * nx[i] * amp + ny[i] * amp * 0.45, p[1] + nY * nx[i] * amp + ny[i] * amp * 0.45] as Pt;
  });
}

/** 圆角矩形的轮廓采样点（按周长均匀取点，角上加密） */
export function roundedRectPoints(w: number, h: number, r: number, step = 8): Pt[] {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts: Pt[] = [];
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  };
  const arc = (cx: number, cy: number, a0: number) => {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  edge(rr, 0, w - rr, 0);
  arc(w - rr, rr, -Math.PI / 2);
  edge(w, rr, w, h - rr);
  arc(w - rr, h - rr, 0);
  edge(w - rr, h, rr, h);
  arc(rr, h - rr, Math.PI / 2);
  edge(0, h - rr, 0, rr);
  arc(rr, rr, Math.PI);
  return pts;
}

export interface InkOpts {
  seed?: string | number;
  /** 抖动幅度（px）。1~2 之间最像钢笔，太大像颤抖病 */
  amp?: number;
  /** 往里缩多少，避免描边被父容器裁掉 */
  inset?: number;
  /** 线从起点再多画一点（手画的圈/框常常收不住口） */
  overshoot?: number;
}

/** 手绘圆角框 */
export function inkRect(w: number, h: number, r: number, o: InkOpts = {}): string {
  const inset = o.inset ?? 0.9;
  const iw = Math.max(2, w - inset * 2);
  const ih = Math.max(2, h - inset * 2);
  const rnd = rngOf(hashSeed(o.seed ?? `r${Math.round(w)}x${Math.round(h)}`));
  const base = roundedRectPoints(iw, ih, Math.max(0, r - inset)).map(
    ([x, y]) => [x + inset, y + inset] as Pt,
  );
  return smoothPath(wobble(base, rnd, o.amp ?? 1.1, true), true);
}

/** 手绘圆（不闭合，收口稍微压过去一点，像真的转了一圈） */
export function inkCircle(cx: number, cy: number, r: number, o: InkOpts = {}): string {
  const rnd = rngOf(hashSeed(o.seed ?? `c${Math.round(cx)}-${Math.round(cy)}-${Math.round(r)}`));
  const amp = (o.amp ?? 1) / Math.max(r, 1);
  const over = o.overshoot ?? 0.22;
  const n = Math.max(18, Math.round(r * 1.6));
  const radius = smoothNoise(rnd, n + 4, 5);
  const pts: Pt[] = [];
  for (let i = 0; i <= n + 2; i++) {
    const t = i / n;
    const a = -Math.PI / 2 + t * Math.PI * 2 * (1 + over);
    const rr = r * (1 + radius[i % radius.length] * amp);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return smoothPath(pts, false);
}

/** 手绘直线（微微弓一下） */
export function inkLine(x1: number, y1: number, x2: number, y2: number, o: InkOpts = {}): string {
  const rnd = rngOf(hashSeed(o.seed ?? `l${Math.round(x1)}-${Math.round(y1)}-${Math.round(x2)}`));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bow = (rnd() * 2 - 1) * (o.amp ?? 1) * 1.6;
  const mx = (x1 + x2) / 2 - (dy / len) * bow;
  const my = (y1 + y2) / 2 + (dx / len) * bow;
  return `M${n2(x1)} ${n2(y1)}Q${n2(mx)} ${n2(my)} ${n2(x2)} ${n2(y2)}`;
}

/** 手绘横格：返回一组 path，直接塞进一个 svg */
export function inkRules(w: number, h: number, top: number, gap: number, o: InkOpts = {}): string[] {
  const out: string[] = [];
  let i = 0;
  for (let y = top; y < h - 6; y += gap, i++) {
    out.push(inkLine(-1, y, w + 1, y, { ...o, seed: `${o.seed ?? 'rule'}-${i}`, amp: o.amp ?? 0.5 }));
  }
  return out;
}

/** 纸纹：一层很淡的碎点，铺在纸上看得出是纸不是塑料 */
export const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

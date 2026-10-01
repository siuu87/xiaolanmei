import { useMemo } from 'react';

/** 确定性 hash：seed → 色相（0-360），同一 seed 恒得同一渐变背景。 */
function seedHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export interface MemoAvatarProps {
  seed?: string | null;
  emoji?: string | null;
  nickname?: string | null;
  /** 指定徽章主色（十六进制），优先于 seed；用于档案颜色实时预览 */
  color?: string | null;
  /** 直径（px），默认 24 */
  size?: number;
}

/** 把十六进制颜色往暗调 amt（-255…255），用于渐变深色端。 */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 专属头像徽章：优先用 color，回退 seed 生成确定性渐变背景，显示 emoji（回退昵称首字）。纯展示、点击无操作。 */
export function MemoAvatar({ seed, emoji, nickname, color, size = 24 }: MemoAvatarProps) {
  const hue = useMemo(() => seedHue(seed ?? nickname ?? '?'), [seed, nickname]);
  const background = color
    ? `linear-gradient(135deg, ${color}, ${shade(color, -28)})`
    : `linear-gradient(135deg, hsl(${hue} 72% 64%), hsl(${(hue + 42) % 360} 72% 52%))`;
  const face = emoji?.trim() || (nickname?.trim() ? nickname.trim().slice(0, 1) : '?');
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium leading-none text-white shadow-sm"
      style={{ width: size, height: size, background, fontSize: Math.round(size * 0.56) }}
    >
      {face}
    </span>
  );
}

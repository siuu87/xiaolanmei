import type { ReactElement } from 'react';
import { Flower2, Smile, Sparkles, Gift as GiftIcon, type LucideIcon } from 'lucide-react';
import type { GiftType } from './giftStore';

/**
 * 经典礼物盒（2026-11-18 二十七改，用户：「礼物盒变成方的，变成最经典的礼物盒样子」）：
 * 方盒身 + 全宽盖沿 + 缎带十字 + 盖顶居中一枚 Twemoji 🎀 蝴蝶结。
 * 三处共用：/gifts 封着礼盒、聊天里的礼物卡、拆箱动画（盖/身分体）。
 */

/** Twemoji 🎀（U+1F380，CC-BY）三块路径，换色贴 */
export const BOW_MAIN =
  'M19.281 6.392c0 .405-2.37.405-2.37 0 0-.9-14.911-9.899-14.911-2.7v13.499c0 2.487 3.476 1.947 7.193.361-1.429 3.525-4.498 9.68-7.05 13.934-.229.382-.178.868.124 1.194.303.325.783.415 1.181.215l5.258-2.629c.441.726.931 1.868 1.376 2.906.333.778.678 1.582 1.024 2.275.144.287.417.488.734.54.053.009.107.013.16.013.263 0 .518-.104.707-.293 1.42-1.419 3.429-8.395 4.793-14.093 1.364 5.698 3.373 12.674 4.793 14.093.188.189.444.293.707.293.053 0 .106-.004.16-.013.317-.052.591-.253.734-.54.347-.693.691-1.497 1.024-2.275.445-1.038.935-2.181 1.376-2.906l5.258 2.629c.398.198.879.111 1.181-.215.303-.326.352-.812.124-1.194-2.735-4.558-6.061-11.296-7.328-14.643C29.652 18.933 34 20.02 34 17.19V3.691c0-7.198-14.719 1.801-14.719 2.701z';
export const BOW_DARK =
  'M2.114 17.869c1.177 3.199 11.468-1.787 14.86-5.179.31-.31.549-.602.758-.885-10.446.252-14.542 3.857-15.618 6.064zm16.482-6.068c.212.285.453.578.765.89 3.6 3.6 14.639 8.999 14.639 4.5v-.209c-1.671-2.199-6.037-5.022-15.404-5.181z';
export const BOW_KNOT =
  'M22 11.4c0 1.988-1.611 3.6-3.599 3.6h-1.802C14.611 15 13 13.388 13 11.4V7.6C13 5.612 14.611 4 16.599 4h1.802C20.389 4 22 5.612 22 7.6v3.8z';

export interface BoxColors {
  boxBody: string;
  boxLid: string;
  ribbon: string;
  bowDark: string;
}

/** 每类礼物一套礼盒配色 + 名字 + 小图标（礼盒页 / 聊天礼物卡共用） */
export const TINT: Record<
  GiftType,
  { label: string; icon: LucideIcon; boxBody: string; boxLid: string; ribbon: string; bowDark: string }
> = {
  flower: { label: '花束', icon: Flower2, boxBody: '#F3DFC4', boxLid: '#FAEEDA', ribbon: '#B4736E', bowDark: '#96544F' },
  object: { label: '小摆件', icon: GiftIcon, boxBody: '#E6DFD3', boxLid: '#F1EBE1', ribbon: '#8A7B66', bowDark: '#6E6252' },
  sticker: { label: '表情', icon: Smile, boxBody: '#F3E3B4', boxLid: '#FAF0CF', ribbon: '#C08A4A', bowDark: '#9C6B33' },
  easter: { label: '彩蛋', icon: Sparkles, boxBody: '#DCE5CE', boxLid: '#EAF0DF', ribbon: '#7D9270', bowDark: '#61755A' },
};

/** 🎀 结：cx/cy 是结心落点，s 是缩放（36×36 里结心在 17.5,9.5） */
export function Bow({ cx, cy, s, colors }: { cx: number; cy: number; s: number; colors: BoxColors }): ReactElement {
  return (
    <g transform={`translate(${cx - 17.5 * s} ${cy - 9.5 * s}) scale(${s})`}>
      <path d={BOW_MAIN} fill={colors.ribbon} />
      <path d={BOW_DARK} fill={colors.bowDark} />
      <path d={BOW_KNOT} fill="#FFFFFF" opacity="0.85" />
    </g>
  );
}

/**
 * 经典礼盒：盒身 + 盖沿 + 盖缝线 + 缎带十字 + 盖顶蝴蝶结。
 * viewBox 120×86；方方正正，盖沿全宽压着盒身。
 */
export function ClassicBoxArt({ colors, className }: { colors: BoxColors; className?: string }) {
  return (
    <svg viewBox="0 0 120 86" className={className} aria-hidden>
      {/* 盒身 */}
      <rect x="26" y="32" width="68" height="52" rx="4" fill={colors.boxBody} />
      {/* 盖沿（全宽，压着盒身顶） */}
      <rect x="20" y="16" width="80" height="18" rx="4" fill={colors.boxLid} />
      <rect x="20" y="32" width="80" height="2" fill="rgba(107,74,50,.18)" />
      {/* 缎带十字：竖条贯穿盖与身，横条压在盖上 */}
      <rect x="55.5" y="16" width="9" height="68" fill={colors.ribbon} />
      <rect x="20" y="20.5" width="80" height="9" fill={colors.ribbon} opacity="0.92" />
      {/* 盖顶蝴蝶结（结心压在十字交点上） */}
      <Bow cx={60} cy={13} s={0.9} colors={colors} />
    </svg>
  );
}

/** 盒身分体（拆箱动画用）：前壁 + 竖缎带下半段。viewBox 16 28 88 58 */
export function ClassicBoxBody({ colors, className }: { colors: BoxColors; className?: string }) {
  return (
    <svg viewBox="16 28 88 58" className={className} aria-hidden>
      <rect x="26" y="32" width="68" height="52" rx="4" fill={colors.boxBody} />
      <rect x="55.5" y="32" width="9" height="52" fill={colors.ribbon} opacity="0.9" />
      <rect x="26" y="32" width="68" height="3" fill="rgba(107,74,50,.14)" />
    </svg>
  );
}

/** 盖子分体（拆箱动画用）：盖沿 + 横缎带 + 盖顶蝴蝶结。viewBox 16 0 88 36 */
export function ClassicBoxLid({ colors, className }: { colors: BoxColors; className?: string }) {
  return (
    <svg viewBox="16 0 88 36" className={className} aria-hidden>
      <rect x="20" y="16" width="80" height="18" rx="4" fill={colors.boxLid} />
      <rect x="20" y="32" width="80" height="2" fill="rgba(107,74,50,.18)" />
      <rect x="55.5" y="16" width="9" height="18" fill={colors.ribbon} />
      <rect x="20" y="20.5" width="80" height="9" fill={colors.ribbon} opacity="0.92" />
      <Bow cx={60} cy={13} s={0.9} colors={colors} />
    </svg>
  );
}

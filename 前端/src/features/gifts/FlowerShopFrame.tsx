import { useMemo } from 'react';
import { flowerShopSrc } from './flowerCode';

/**
 * 花店 iframe（2026-11-18 二十八改）：
 * 花束礼物用自托管的赛博花店（public/flowershop/，CyberFlowerShop frycarrot · MIT）
 * 渲染——花束码放 hash 里，点开就能旋转欣赏 3D 花束、读贺卡、存纪念图。
 * 拆封层和纪念架阅读层共用这一个组件。
 */
export function FlowerShopFrame({ code, className = '' }: { code: string; className?: string }) {
  const src = useMemo(() => flowerShopSrc(code), [code]);
  return (
    <iframe
      src={src}
      title="一束花"
      data-testid="flower-shop-frame"
      className={`${className} rounded-[18px] border border-[#E9DAC4] bg-[#FBF7F0]`}
    />
  );
}

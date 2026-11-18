import { useMemo, useRef } from 'react';
import { flowerShopSrc } from './flowerCode';

/**
 * 花店 iframe（2026-11-18 二十八改）：
 * 花束礼物用自托管的赛博花店（public/flowershop/，CyberFlowerShop frycarrot · MIT）
 * 渲染——花束码放 hash 里，点开就能旋转欣赏 3D 花束、读贺卡、存纪念图。
 * 拆封层和纪念架阅读层共用这一个组件。
 *
 * chromeless（2026-11-18 三十一改，纪念架实物陈列用）：同源 iframe 注入一段 CSS，
 * 把花店的顶栏 / 提示文字 / 品牌字 / 贺卡贴码截图弹层全藏掉，只留 3D 花束本体。
 */
export function FlowerShopFrame({
  code,
  className = '',
  chromeless = false,
}: {
  code: string;
  className?: string;
  chromeless?: boolean;
}) {
  const src = useMemo(() => flowerShopSrc(code), [code]);
  const ref = useRef<HTMLIFrameElement>(null);
  /** 同源才拿得到 contentDocument；load 后注入样式，把花店 UI 藏干净 */
  const stripChrome = () => {
    if (!chromeless) return;
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    const style = doc.createElement('style');
    style.textContent =
      '.hint,.toolbar,.brand,#letter,#paste,#shot,#toast,#fatal{display:none!important}';
    doc.head.appendChild(style);
  };
  return (
    <iframe
      ref={ref}
      src={src}
      title="一束花"
      data-testid="flower-shop-frame"
      onLoad={stripChrome}
      className={`${className} rounded-[18px] border border-[#E9DAC4] bg-[#FBF7F0]`}
    />
  );
}

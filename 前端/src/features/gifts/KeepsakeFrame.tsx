import { useMemo, useRef } from 'react';
import { keepsakeSrc } from './keepsakeCode';

/**
 * 纪念品工坊 iframe（2026-11-18 二十九改）：
 * keepsake 礼物用自托管的 Companion Keepsakes（public/keepsakes/，Elisekaiu · MIT）
 * 渲染——纪念品 AI 码放 hash 里：第一次打开是「按住拆开」的礼物页，
 * 拆完是 3D 成品（小小星球 / 记忆雪花球 / 护身符，拖得动、摇得响）。
 * 同一 iframe localStorage 记着这件，再打开直接是成品（resume）。
 * 拆封层和纪念架阅读层共用这一个组件。
 *
 * chromeless（2026-11-18 三十一改，纪念架实物陈列用，用户「就要实物不要背景」）：
 * 同源注入 CSS 藏掉工坊的天空纸底（.stage-back / .stage-ornament）、把页面底色透掉——
 * 架子上就是那件 3D 成品本身。
 */
export function KeepsakeFrame({
  code,
  className = '',
  chromeless = false,
}: {
  code: string;
  className?: string;
  chromeless?: boolean;
}) {
  const src = useMemo(() => keepsakeSrc(code), [code]);
  const ref = useRef<HTMLIFrameElement>(null);
  /** 同源才拿得到 contentDocument；load 后注入样式，把工坊纸底藏干净 */
  const stripChrome = () => {
    if (!chromeless) return;
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    const style = doc.createElement('style');
    style.textContent =
      '.stage-back,.stage-ornament,#app{display:none!important}' +
      'html,body,#stage{background:transparent!important}';
    doc.head.appendChild(style);
  };
  return (
    <iframe
      ref={ref}
      src={src}
      title="一件纪念品"
      data-testid="keepsake-frame"
      onLoad={stripChrome}
      className={
        chromeless
          ? className
          : `${className} rounded-[18px] border border-[#E9DAC4] bg-[#FBF7F0]`
      }
    />
  );
}

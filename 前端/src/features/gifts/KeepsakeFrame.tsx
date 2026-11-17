import { useMemo } from 'react';
import { keepsakeSrc } from './keepsakeCode';

/**
 * 纪念品工坊 iframe（2026-11-18 二十九改）：
 * keepsake 礼物用自托管的 Companion Keepsakes（public/keepsakes/，Elisekaiu · MIT）
 * 渲染——纪念品 AI 码放 hash 里：第一次打开是「按住拆开」的礼物页，
 * 拆完是 3D 成品（小小星球 / 记忆雪花球 / 护身符，拖得动、摇得响）。
 * 同一 iframe localStorage 记着这件，再打开直接是成品（resume）。
 * 拆封层和纪念架阅读层共用这一个组件。
 */
export function KeepsakeFrame({ code, className = '' }: { code: string; className?: string }) {
  const src = useMemo(() => keepsakeSrc(code), [code]);
  return (
    <iframe
      src={src}
      title="一件纪念品"
      data-testid="keepsake-frame"
      className={`${className} rounded-[18px] border border-[#E9DAC4] bg-[#FBF7F0]`}
    />
  );
}

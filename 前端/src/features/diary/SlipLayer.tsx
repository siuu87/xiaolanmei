import { useRef, useState } from 'react';
import type { DiarySlip } from './diaryData';
import { HAND_FONT, slipSpot } from './diaryData';

interface Props {
  slips: DiarySlip[];
  /** 纸页宽高（纸条宽度按纸宽算，坐标按纸页比例） */
  w: number;
  h: number;
  onMove: (id: string, pos: { x: number; y: number }) => void;
  /** 点一下（没拖动）：我的条去改，他的条去读 */
  onOpen: (slip: DiarySlip) => void;
}

/**
 * 纸条层（2026-11-16）：小纸条也跟贴纸一样，能随手贴到纸上任何位置。
 *
 * 之前纸条是排在正文流末尾的一块，永远压在最后一行下面 —— 不像「夹」的，像「附」的。
 * 现在改成和贴纸同一套做法：
 *
 * - 位置是相对纸页的 0~1 比例（换屏幕、换纸页大小都不跑位），拖动松手才写库；
 * - 压住正文（真的纸条也盖字），层级在正文之上、贴纸之下；
 * - 点一下（不是拖）打开编辑器看全文 / 改内容 / 撕掉 —— 纸条有长度上限，
 *   贴在纸上只露几行，全文得点开看；
 * - **TA 塞的条也能挪**（版式是可以整理的），但进去是只读：不给改字、不给撕。
 *
 * 触摸事件在这里 stopPropagation，否则外层书壳会当成横划翻页，一拖纸条就翻页。
 */
export function SlipLayer({ slips, w, h, onMove, onOpen }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** 拖动中的临时坐标：不动 store，松手才提交 */
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const liveRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const drag = useRef<{ id: string; moved: boolean; sx: number; sy: number } | null>(null);

  /**
   * 便签尺寸：**方方的一小块**（2026-11-16）。
   *
   * 原来是纸张六成宽的长条，压在纸上像「又一段正文」；改成正方形小纸片之后
   * 才像真的一张便利贴 —— 一页贴两三张也不至于把字全挡住。
   * 用纸宽的 34% 定边长，窄屏也不会小到看不清。
   */
  const size = Math.max(100, Math.min(132, Math.round(w * 0.3)));
  /** 方纸在纸页上的半宽 / 半高（比例）：拖到哪儿都别让纸片跑出纸外 */
  const halfW = (size / 2 + 4) / w;
  const halfH = (size / 2 + 4) / h;
  /** 纸页比便签还小时（极端窄屏）half 会超过 0.5，夹在正中就行 */
  const clamp = (v: number, half: number) =>
    half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, v));
  const clampX = (v: number) => clamp(v, halfW);
  const clampY = (v: number) => clamp(v, halfH);

  const startDrag = (e: React.PointerEvent, s: DiarySlip) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: s.id, moved: false, sx: e.clientX, sy: e.clientY };
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    const next = {
      id: d.id,
      x: clampX((e.clientX - host.left) / host.width),
      y: clampY((e.clientY - host.top) / host.height),
    };
    liveRef.current = next;
    setLive(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    e.stopPropagation();
    const lv = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (d.moved && lv && lv.id === d.id) {
      onMove(d.id, { x: lv.x, y: lv.y });
      return;
    }
    // 没动过 = 点了一下：点开看全文 / 改内容
    if (!d.moved) {
      const s = slips.find((x) => x.id === d.id);
      if (s) onOpen(s);
    }
  };

  /** 指针被系统抢走（滚动手势等）：只收尾，别当成点击 */
  const cancelDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = null;
    liveRef.current = null;
    setLive(null);
  };

  if (slips.length === 0) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-[15]" data-testid="diary-slips">
      {slips.map((s, i) => {
        const spot = slipSpot(i);
        const cur = live && live.id === s.id ? { ...s, ...live } : s;
        const byTa = s.author === 'ta';
        const x = clampX(cur.x ?? spot.x);
        const y = clampY(cur.y ?? spot.y);
        return (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            aria-label={byTa ? '他留的纸条' : '拖动或点开这张纸条'}
            data-testid={`diary-slip-${s.id}`}
            data-slip-id={s.id}
            data-slip-author={byTa ? 'ta' : 'me'}
            data-x={Math.round(x * 1000) / 1000}
            data-y={Math.round(y * 1000) / 1000}
            onPointerDown={(e) => startDrag(e, s)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute cursor-grab active:cursor-grabbing"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) rotate(${byTa ? 1.6 : -2.2}deg)`,
              touchAction: 'none',
              zIndex: 12 + i,
            }}
          >
            {/* 胶带：压在便签上沿，一眼看出是「贴」上去的 */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 -top-1.5 h-3 w-8 -translate-x-1/2 -rotate-2 bg-white/55 shadow-[0_1px_3px_rgba(0,0,0,0.16)]"
            />
            <div
              className="flex h-full flex-col px-2 py-1.5 shadow-[0_7px_14px_-9px_rgba(0,0,0,0.55)]"
              style={{ background: s.color }}
            >
              {byTa && (
                <span className="mb-0.5 block shrink-0 text-[7px] leading-none tracking-[0.12em] text-[#3b3830]/45">
                  他留的
                </span>
              )}
              <p
                className="overflow-hidden whitespace-pre-wrap text-[10px] text-[#3b3830]"
                style={{
                  fontFamily: HAND_FONT,
                  lineHeight: '15px',
                  // 方纸就那么大：写满了在纸上裁掉，点开才看全文
                  display: '-webkit-box',
                  WebkitLineClamp: byTa ? 5 : 6,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {s.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

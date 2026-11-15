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
   * 纸条宽度：纸张的六成。比贴纸大得多，太宽就没地方「贴」了 ——
   * 横向最多只能挪到两边留出一半纸宽的位置，再窄一点反而更自由。
   */
  const width = Math.max(140, Math.min(240, Math.round(w * 0.6)));
  /** 露出来的高度：大约六行手写字，再多就点开看 */
  const CLIP_H = Math.max(96, Math.round(h * 0.22));

  /**
   * 拖动范围：横向**一定**夹在纸内 —— 纸条比贴纸大，出了纸边字就被裁掉一半，
   * 那是坏体验，不是「贴出边」的感觉。纵向放宽一点（12%~90%），
   * 压在页眉日期上、贴到页脚边上都随它。
   */
  const halfW = (width / 2 + 4) / w;
  const clampX = (v: number) => Math.min(1 - halfW, Math.max(halfW, v));
  const clampY = (v: number) => Math.min(0.9, Math.max(0.12, v));

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
              width,
              transform: `translate(-50%, -50%) rotate(${byTa ? 0.9 : -1.2}deg)`,
              touchAction: 'none',
              zIndex: 12 + i,
            }}
          >
            {/* 胶带：压在纸条上沿，一眼看出是「贴」上去的 */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 -top-2 h-3.5 w-10 -translate-x-1/2 -rotate-2 bg-white/55 shadow-[0_1px_3px_rgba(0,0,0,0.16)]"
            />
            <div
              className="px-2.5 py-2 shadow-[0_8px_16px_-10px_rgba(0,0,0,0.55)]"
              style={{ background: s.color }}
            >
              {byTa && (
                <span className="mb-0.5 block text-[8px] leading-none tracking-[0.1em] text-[#3b3830]/45">
                  他留的
                </span>
              )}
              <p
                className="overflow-hidden whitespace-pre-wrap text-[11px] text-[#3b3830]"
                style={{ fontFamily: HAND_FONT, lineHeight: '17px', maxHeight: CLIP_H }}
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

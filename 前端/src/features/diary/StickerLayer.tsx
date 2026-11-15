import { useRef, useState } from 'react';
import { Minus, Plus, RotateCw, X } from 'lucide-react';
import { resolveDiarySticker } from './diaryStickerSet';
import type { DiarySticker } from './diaryData';

interface Props {
  stickers: DiarySticker[];
  /** 纸页宽高（贴纸基础大小按宽算，工具条按高夹位置） */
  w: number;
  h: number;
  /** 能不能动它们：TA 的本只让看 */
  canEdit: boolean;
  onMove: (id: string, pos: { x: number; y: number }) => void;
  onChange: (id: string, patch: { scale?: number; rot?: number }) => void;
  onRemove: (id: string) => void;
}

/** 纸页宽度里贴纸占多少（约 58px），上下限夹一下 */
const sizeOf = (w: number) => Math.max(42, Math.min(68, Math.round(w * 0.155)));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 手账贴纸层（2026-11-15）：
 *
 * 贴在**纸上**的一层，压住正文（真实的贴纸也盖字）。位置是相对纸页的 0~1 比例，
 * 换屏幕、换纸页大小都不跑位。
 *
 * - 拖动：pointer 事件 + `touchAction: none`；触摸事件在这里 stopPropagation，
 *   否则外层书壳会把手指动作当成「横划翻页」，一拖贴纸就翻页。
 * - 松手才写库（拖动过程只更新本地），一次拖动一个请求。
 * - 选中一个 → 浮出小工具条：缩小 / 放大 / 转 15° / 撕掉。
 *   工具条**挂在这一层**而不是贴纸里，坐标按纸页夹紧 —— 贴纸拖到纸边时
 *   工具条跟着往回缩，不会被纸页的 overflow 裁掉半个。
 */
export function StickerLayer({ stickers, w, h, canEdit, onMove, onChange, onRemove }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** 拖动中的临时坐标：不动 store，松手才提交 */
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ id: string; moved: boolean; sx: number; sy: number } | null>(null);

  const base = sizeOf(w);

  const startDrag = (e: React.PointerEvent, s: DiarySticker) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: s.id, moved: false, sx: e.clientX, sy: e.clientY };
    setSelected(s.id);
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    setLive({
      id: d.id,
      x: clamp01((e.clientX - host.left) / host.width),
      y: clamp01((e.clientY - host.top) / host.height),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    e.stopPropagation();
    const lv = live;
    if (d.moved && lv && lv.id === d.id) onMove(d.id, { x: lv.x, y: lv.y });
    setLive(null);
  };

  if (stickers.length === 0) return null;

  /** 选中的那个（工具条跟着它） */
  const sel = canEdit ? stickers.find((s) => s.id === selected) : undefined;
  const selPx = sel ? Math.round(base * sel.scale) : 0;
  const BAR_W = 88;
  const BAR_H = 21;
  const barLeft = sel ? Math.max(3, Math.min(w - BAR_W - 3, sel.x * w - BAR_W / 2)) : 0;
  const below = sel ? sel.y * h + selPx / 2 + 5 : 0;
  const barTop = sel ? (below + BAR_H > h - 3 ? sel.y * h - selPx / 2 - BAR_H - 5 : below) : 0;

  const barBtn = (
    key: string,
    label: string,
    icon: React.ReactNode,
    run: () => void,
    tone: 'dark' | 'red' = 'dark',
  ) => (
    <button
      key={key}
      type="button"
      aria-label={label}
      data-testid={`diary-sticker-${key}`}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      className={`flex h-[19px] w-[19px] items-center justify-center rounded-full text-white shadow-sm ${
        tone === 'red' ? 'bg-rose-500' : 'bg-[#3d3a35]'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-20" data-testid="diary-stickers">
      {stickers.map((s) => {
        const cur = live && live.id === s.id ? { ...s, ...live } : s;
        const img = resolveDiarySticker(s.src);
        const px = Math.round(base * s.scale);
        const isSel = selected === s.id && canEdit;
        return (
          <div
            key={s.id}
            role={canEdit ? 'button' : undefined}
            tabIndex={canEdit ? 0 : -1}
            aria-label={canEdit ? '拖动这张贴纸' : '贴纸'}
            data-testid={`diary-sticker-${s.id}`}
            data-src={s.src}
            onPointerDown={(e) => startDrag(e, s)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className={`absolute ${
              canEdit ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-none'
            }`}
            style={{
              left: `${cur.x * 100}%`,
              top: `${cur.y * 100}%`,
              width: px,
              transform: `translate(-50%, -50%) rotate(${s.rot}deg)`,
              touchAction: 'none',
              zIndex: isSel ? 60 : 30,
              // 落纸的投影：贴纸是压在纸上的，不是浮在空中的
              filter: 'drop-shadow(0 3px 4px rgba(38,32,24,0.32))',
            }}
          >
            {img ? (
              <img
                src={img}
                alt=""
                draggable={false}
                className="block h-auto w-full select-none"
                style={{ WebkitUserSelect: 'none' }}
              />
            ) : (
              <span className="block select-none text-center leading-none" style={{ fontSize: px * 0.92 }}>
                {s.src}
              </span>
            )}
            {isSel && (
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-[3px] border border-dashed border-[#3d3a35]/45"
              />
            )}
          </div>
        );
      })}

      {/* 工具条：钉在纸页坐标系里，贴纸贴到纸边也不会被裁掉 */}
      {sel && (
        <div
          className="pointer-events-auto absolute flex items-center gap-0.5"
          data-testid="diary-sticker-tools"
          style={{ left: barLeft, top: barTop, width: BAR_W, zIndex: 70 }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {barBtn('smaller', '缩小', <Minus className="h-3 w-3" />, () =>
            onChange(sel.id, { scale: Math.max(0.4, round2(sel.scale - 0.2)) }),
          )}
          {barBtn('bigger', '放大', <Plus className="h-3 w-3" />, () =>
            onChange(sel.id, { scale: Math.min(3, round2(sel.scale + 0.2)) }),
          )}
          {barBtn('rot', '转一下', <RotateCw className="h-3 w-3" />, () =>
            onChange(sel.id, { rot: ((sel.rot + 15 + 180) % 360) - 180 }),
          )}
          {barBtn(
            'remove',
            '撕掉这张贴纸',
            <X className="h-3 w-3" />,
            () => {
              onRemove(sel.id);
              setSelected(null);
            },
            'red',
          )}
        </div>
      )}
    </div>
  );
}

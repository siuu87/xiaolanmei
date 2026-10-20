/**
 * PaiVoice 通话悬浮窗（2026-10-20，替代原来的全屏 CallOverlay）。
 *
 * - 可拖动：标题栏按住拖，位置夹在视口内；
 * - 可收起：收成一条 48px 的小条，**iframe 不卸载**，通话/麦克风不断；
 * - 结束：页面自己的挂断键会 postMessage `paivoice:end`，右上角也有兜底；
 * - 视频通话仍走旧 CallOverlay（PaiVoice 的画面是给回复端看，不是双向视频流）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Maximize2, PhoneOff } from 'lucide-react';

const WIN_W = 320;
const HEAD_H = 48;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PaiVoiceOverlay({
  wsUrl,
  name,
  onEnd,
}: {
  wsUrl: string;
  name: string;
  onEnd: (seconds: number) => void;
}) {
  const started = useRef(Date.now());
  const reported = useRef(false);
  const [seconds, setSeconds] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 12, y: 12 };
    const w = Math.min(WIN_W, window.innerWidth - 24);
    return {
      x: Math.max(12, window.innerWidth - w - 12),
      y: Math.max(12, window.innerHeight - 470),
    };
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const finish = useCallback(
    (sec?: number) => {
      if (reported.current) return;
      reported.current = true;
      onEnd(sec ?? Math.round((Date.now() - started.current) / 1000));
    },
    [onEnd],
  );

  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string } | null;
      if (data?.type === 'paivoice:end') finish();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [finish]);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: Math.min(p.x, Math.max(8, window.innerWidth - WIN_W - 8)),
        y: Math.min(p.y, Math.max(8, window.innerHeight - HEAD_H - 8)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const w = Math.min(WIN_W, window.innerWidth - 16);
    setPos({
      x: clamp(e.clientX - d.dx, 8, Math.max(8, window.innerWidth - w - 8)),
      y: clamp(e.clientY - d.dy, 8, Math.max(8, window.innerHeight - HEAD_H - 8)),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const width = typeof window === 'undefined' ? WIN_W : Math.min(WIN_W, window.innerWidth - 16);
  const height =
    typeof window === 'undefined' ? 440 : Math.min(440, Math.max(320, window.innerHeight - 110));

  const src = `/paivoice/index.html?ws=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent(name)}&compact=1`;

  return (
    <div
      data-testid="paivoice-overlay"
      data-collapsed={collapsed ? '1' : '0'}
      style={{ left: pos.x, top: pos.y, width, height: collapsed ? HEAD_H : height }}
      className="fixed z-[1400] overflow-hidden rounded-2xl border border-amber-900/50 bg-[#0a0705] shadow-[0_20px_60px_rgba(0,0,0,.6)]"
    >
      <div
        data-testid="paivoice-drag"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex h-12 cursor-grab touch-none select-none items-center gap-2 border-b border-amber-200/10 bg-[#1a120b] px-3 active:cursor-grabbing"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-amber-50">{name}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-amber-200/50">{mmss(seconds)}</span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? '展开通话' : '收起通话'}
          data-testid="paivoice-collapse"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-amber-200/60 transition hover:bg-white/10 hover:text-amber-100"
        >
          {collapsed ? <Maximize2 size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          onClick={() => finish(seconds)}
          aria-label="结束通话"
          data-testid="paivoice-end"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-rose-300/80 transition hover:bg-rose-500/15 hover:text-rose-200"
        >
          <PhoneOff size={14} />
        </button>
      </div>

      <div className={collapsed ? 'hidden' : 'block'} style={{ height: `calc(100% - ${HEAD_H}px)` }}>
        <iframe
          title="PaiVoice"
          src={src}
          data-testid="paivoice-iframe"
          allow="microphone; camera; autoplay"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}

/**
 * PaiVoice 通话界面（2026-10-20 重做）
 *
 * 两种形态，随时切换：
 * - **完整通话页**（默认）：整页铺满，能完整看到实时对话字幕与大按钮；
 * - **悬浮窗**：右侧浮窗，标题栏可拖、可收起成标题条，收起时 iframe 不卸载（通话/麦克风不断）。
 *
 * 2026-10-20 的优化点（用户：『也要可退出按键，通话界面进行优化』）：
 * 1. **退出键独立且始终可见**：以前「结束通话」和另外两个图标挤在 48px 标题栏里，小、难找；
 *    现在「退出」单独一颗带文字的键（粉红药丸）钉在最右，hover 前后都清楚；
 * 2. **标题栏分层**：左＝状态点+名字+计时（一个整体，不再被按钮挤压截断），
 *    右＝形态切换 / 收起 / 退出，三颗按钮等宽等高，触控目标 ≥28px；
 * 3. **悬浮窗尺寸跟着视口**：高度取 `min(视口高 - 96, 480)` 且下限 300，
 *    以前写死 440 在矮屏（手机横屏 / 小窗）会把下半截控件顶出屏幕；
 * 4. **收起后是一条完整标题条**：显示计时 + 「通话中」，点条上任意位置展开，
 *    以前收起只剩 48px，用户不知道还在通话；
 * 5. **Esc 结束通话**（整页时），悬浮窗时 Esc 只收起不挂断，避免误伤。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const WIN_W = 340;
const HEAD_H = 52;

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
  const [mode, setMode] = useState<'full' | 'float'>('full');
  const [collapsed, setCollapsed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [callState, setCallState] = useState<'idle' | 'live' | 'closed'>('idle');
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight,
  }));
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 12, y: 96 };
    const w = Math.min(WIN_W, window.innerWidth - 24);
    return {
      x: Math.max(12, window.innerWidth - w - 12),
      y: Math.max(12, Math.min(window.innerHeight - 500, 96)),
    };
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const winW = Math.min(WIN_W, Math.max(260, viewport.w - 24));
  const winH = Math.min(
    Math.max(300, viewport.h - 96),
    Math.max(300, viewport.h - 24),
  );

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

  // iframe 里报「已挂断」时收尾（挂断按钮在子页面也有，两边都要能结束）
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; mode?: string } | null;
      if (data?.type === 'paivoice:end') finish();
      if (data?.type === 'paivoice:state' && typeof data.mode === 'string') {
        setCallState(data.mode === 'closed' ? 'closed' : data.mode === 'idle' ? 'idle' : 'live');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [finish]);

  // 视口变化：重算尺寸 + 把窗口夹回可视范围
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });
      setPos((p) => ({
        x: clamp(p.x, 8, Math.max(8, w - Math.min(WIN_W, w - 24) - 8)),
        y: clamp(p.y, 8, Math.max(8, h - HEAD_H - 8)),
      }));
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  // Esc：整页时结束通话（=用户明确点退出）；悬浮窗时只收起，别误挂断
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mode === 'full') {
        e.stopPropagation();
        finish(seconds);
      } else {
        setCollapsed(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, finish, seconds]);

  const floating = mode === 'float';
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!floating) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: clamp(e.clientX - d.dx, 8, Math.max(8, viewport.w - winW - 8)),
      y: clamp(e.clientY - d.dy, 8, Math.max(8, viewport.h - HEAD_H - 8)),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const src = `/paivoice/index.html?ws=${encodeURIComponent(wsUrl)}&name=${encodeURIComponent(name)}&compact=1`;

  const collapsedHint = callState === 'closed' ? '已结束' : '通话中';

  return (
    <div
      data-testid="paivoice-overlay"
      data-mode={mode}
      data-collapsed={floating && collapsed ? '1' : '0'}
      style={
        floating
          ? {
              left: pos.x,
              top: pos.y,
              width: winW,
              height: collapsed ? HEAD_H : winH,
              transition: 'height 160ms ease',
            }
          : undefined
      }
      className={cn(
        'fixed z-[1400] bg-page-bg',
        floating
          ? 'overflow-hidden rounded-2xl border border-border shadow-lift'
          : 'inset-0',
      )}
    >
      <div
        data-testid="paivoice-drag"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          if (floating) setCollapsed((v) => !v);
        }}
        className={cn(
          'flex select-none items-center gap-2 border-b border-border bg-surface px-3',
          floating ? 'cursor-grab touch-none active:cursor-grabbing' : '',
        )}
        style={{ height: HEAD_H }}
      >
        {/* 左：状态 + 名字 + 计时，作为一个整体不被截断 */}
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            callState === 'live'
              ? 'bg-emerald-500 shadow-[0_0_6px_hsl(160_65%_45%/0.6)] dark:bg-emerald-400'
              : 'bg-gold/60',
          )}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {mmss(seconds)}
          </span>
          {floating && collapsed && (
            <span className="shrink-0 text-[10px] text-muted-foreground/70">{collapsedHint}</span>
          )}
        </div>

        {/* 右：形态 / 收起 / 退出，三颗等大 */}
        <button
          type="button"
          onClick={() => {
            setMode(floating ? 'full' : 'float');
            setCollapsed(false);
          }}
          aria-label={floating ? '全屏通话' : '悬浮窗通话'}
          title={floating ? '全屏通话' : '悬浮窗通话'}
          data-testid="paivoice-mode"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground active:scale-95"
        >
          {floating ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>

        {floating && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? '展开通话' : '收起通话'}
            title={collapsed ? '展开通话' : '收起通话'}
            data-testid="paivoice-collapse"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground active:scale-95"
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {/* 退出：带文字的粉红键，永远在最右，不被别的图标淹没 */}
        <button
          type="button"
          onClick={() => finish(seconds)}
          aria-label="退出通话"
          title="退出通话"
          data-testid="paivoice-end"
          className="ml-0.5 flex h-7 shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2.5 text-[11px] font-medium text-destructive transition hover:bg-destructive/20 active:scale-95"
        >
          <PhoneOff size={12} />
          退出
        </button>
      </div>

      <div
        className={floating && collapsed ? 'hidden' : 'block'}
        style={{ height: `calc(100% - ${HEAD_H}px)` }}
      >
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

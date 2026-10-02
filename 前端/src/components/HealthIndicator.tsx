import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'probing' | 'ok' | 'unreachable' | 'offline';

/** 健康时轮询间隔 */
const POLL_MS = 30_000;
/** 失败后的重连退避：1s / 2s / 4s / 10s（封顶） */
const BACKOFF_MS = [1_000, 2_000, 4_000, 10_000];
/** 连续失败多少次后停止自动重连，转手动 */
const MAX_RETRIES = 4;

const LABEL: Record<Status, string> = {
  probing: '检测中…',
  ok: '模型通道正常',
  unreachable: '模型通道不可达 · 点我重连',
  offline: '已断开 · 点我重连',
};

/**
 * 链路健康小灯：轮询 GET /api/chat/health。
 * 绿 = 上游模型通道正常；黄 = 检测/重连中；红 = 不可达或已断开。
 * 失败后按 1s/2s/4s/10s 退避自动重连，连续失败 N 次后转手动（点小灯立即重连）。
 */
export function HealthIndicator() {
  const [status, setStatus] = useState<Status>('probing');
  const [retrying, setRetrying] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);

  const probe = useCallback(async () => {
    const fail = (next: Status) => {
      if (!aliveRef.current) return;
      setStatus(next);
      if (attemptRef.current < MAX_RETRIES) {
        setRetrying(true);
        const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
        attemptRef.current += 1;
        timerRef.current = window.setTimeout(() => void probe(), delay);
      } else {
        setRetrying(false);
      }
    };

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch('/api/chat/health', { signal: controller.signal });
      if (res.ok) {
        attemptRef.current = 0;
        const data = (await res.json().catch(() => ({}))) as { model?: string | null };
        if (!aliveRef.current) return;
        setStatus('ok');
        setModel(data.model ?? null);
        setRetrying(false);
        timerRef.current = window.setTimeout(() => void probe(), POLL_MS);
        return;
      }
      fail('unreachable');
    } catch {
      fail('offline');
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void probe();
    return () => {
      aliveRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [probe]);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    setRetrying(false);
    setStatus('probing');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    void probe();
  }, [probe]);

  const label =
    retrying ? '重连中…' : status === 'ok' && model ? `模型通道正常 · ${model}` : LABEL[status];
  const dot =
    retrying || status === 'probing'
      ? 'bg-amber-400 animate-pulse'
      : status === 'ok'
        ? 'bg-emerald-500'
        : 'bg-rose-500';

  return (
    <button
      type="button"
      onClick={reconnect}
      title="点击立即重连"
      className="flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

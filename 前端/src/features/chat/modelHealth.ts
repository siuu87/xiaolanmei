/**
 * 模型通道健康状态（「模型通道是否可达」）。
 *
 * 为什么抽出来：聊天顶栏的小红点（`ConnDot`）与「白起的内心」面板里的重探按钮
 * 都要读同一个状态。各写一份探测 = 两个 30 秒轮询各打一次 `/api/chat/health`，
 * 而且两处颜色可能对不上。这里用模块级单例 + `useSyncExternalStore` 共享，
 * **只有第一个订阅者出现时才开轮询，最后一个订阅者走了就停**。
 */
import { useSyncExternalStore } from 'react';

export type ModelHealth = 'probing' | 'ok' | 'bad';

const HEALTH_URL = '/api/chat/health';
const POLL_MS = 30_000;
const TIMEOUT_MS = 6000;

let health: ModelHealth = 'probing';
const listeners = new Set<() => void>();
let timer: number | null = null;

function emit(): void {
  for (const fn of listeners) fn();
}

/**
 * 立刻探测一次。
 * `showPending: false` 用于 30 秒的例行轮询 —— 不要每次都把小灯闪成黄色。
 */
export async function probeModelHealth(opts?: { showPending?: boolean }): Promise<ModelHealth> {
  if (opts?.showPending !== false) {
    health = 'probing';
    emit();
  }
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal });
    window.clearTimeout(t);
    health = res.ok ? 'ok' : 'bad';
  } catch {
    health = 'bad';
  }
  emit();
  return health;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) {
    void probeModelHealth();
    timer = window.setInterval(() => void probeModelHealth({ showPending: false }), POLL_MS);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): ModelHealth => health;

export function useModelHealth(): ModelHealth {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const HEALTH_TEXT: Record<ModelHealth, string> = {
  probing: '检测中…',
  ok: '模型通道正常',
  bad: '通道不可达',
};

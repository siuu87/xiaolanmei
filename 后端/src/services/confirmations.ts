import { newId } from '../utils/id.js';

/**
 * 工具权限确认队列（阶段 10）：Agent 执行写/命令类工具前，挂起等待用户批准。
 * 内存态即可——确认是一次性的、短暂的（超时自动拒绝）。
 */

interface PendingConfirm {
  id: string;
  toolName: string;
  summary: string;
  resolve: (decision: 'allow' | 'deny') => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingConfirm>();

export interface ConfirmRequest {
  id: string;
  toolName: string;
  summary: string;
  promise: Promise<'allow' | 'deny'>;
}

export function requestConfirmation(toolName: string, summary: string, timeoutMs = 180000): ConfirmRequest {
  const id = newId();
  let resolveFn!: (d: 'allow' | 'deny') => void;
  const promise = new Promise<'allow' | 'deny'>((resolve) => {
    resolveFn = resolve;
  });
  const timer = setTimeout(() => resolveConfirmation(id, 'deny'), timeoutMs);
  pending.set(id, { id, toolName, summary, resolve: resolveFn, timer });
  return { id, toolName, summary, promise };
}

export function resolveConfirmation(id: string, decision: 'allow' | 'deny'): boolean {
  const p = pending.get(id);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(decision);
  return true;
}

export function listPendingConfirmations(): { id: string; toolName: string; summary: string }[] {
  return [...pending.values()].map((p) => ({ id: p.id, toolName: p.toolName, summary: p.summary }));
}

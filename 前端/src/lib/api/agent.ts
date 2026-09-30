import { request } from './conversations';

export interface AgentTaskDTO {
  id: string;
  title: string;
  status: 'running' | 'done' | 'error' | 'stopped';
  prompt: string;
  workspacePath: string | null;
  plan: string | null;
  conversationId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

export const listAgentTasks = () => request<{ tasks: AgentTaskDTO[] }>('/api/agent/tasks');

export const listWorkspaceTree = (path: string) =>
  request<{ root: string; entries: WorkspaceEntry[] }>(
    `/api/agent/workspace/tree?path=${encodeURIComponent(path)}`,
  );

export const readWorkspaceFile = (path: string) =>
  request<{ path: string; content: string }>(
    `/api/agent/workspace/file?path=${encodeURIComponent(path)}`,
  );

export const saveWorkspaceFile = (path: string, content: string) =>
  request<{ ok: true }>('/api/agent/workspace/save', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  });

export const confirmAgent = (confirmId: string, decision: 'allow' | 'deny') =>
  request<{ ok: true; decision: string }>('/api/agent/confirm', {
    method: 'POST',
    body: JSON.stringify({ confirmId, decision }),
  });

export interface RunAgentOptions {
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onNeedsConfirm?: (confirmId: string, toolName: string, summary: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/** 流式运行编码任务（POST /api/agent/run，SSE） */
export async function runAgent(
  prompt: string,
  { signal, onDelta, onToolCall, onNeedsConfirm, onDone, onError }: RunAgentOptions = {},
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    onError?.(`网络错误：${(err as Error).message}`);
    return;
  }

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    onError?.(message);
    return;
  }

  if (!res.body) {
    onError?.('未收到响应流');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let ev: { type?: string; content?: string; message?: string; name?: string; arguments?: Record<string, unknown>; confirmId?: string; toolName?: string; summary?: string };
        try {
          ev = JSON.parse(payload);
        } catch {
          continue;
        }
        switch (ev.type) {
          case 'delta':
            if (typeof ev.content === 'string') onDelta?.(ev.content);
            break;
          case 'tool_call':
            if (typeof ev.name === 'string') onToolCall?.(ev.name, ev.arguments ?? {});
            break;
          case 'needs_confirm':
            if (ev.confirmId) onNeedsConfirm?.(ev.confirmId, ev.toolName ?? '', ev.summary ?? '');
            break;
          case 'done':
            onDone?.();
            break;
          case 'error':
            onError?.(ev.message ?? '任务出错');
            break;
          default:
            break;
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    onError?.(`网络错误：${(err as Error).message}`);
  }
}

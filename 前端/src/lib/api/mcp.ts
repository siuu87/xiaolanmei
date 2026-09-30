import { request } from './conversations';

export interface McpServerDTO {
  id: string;
  name: string;
  type: 'stdio' | 'sse' | 'http';
  config: Record<string, unknown>;
  enabled: boolean;
  permissions: unknown;
  status: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface McpServerInput {
  name?: string;
  type?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  permissions?: unknown;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolInfoDTO {
  kind: 'builtin' | 'mcp';
  name: string;
  description: string;
  requiresConfirm: boolean;
  allowed: boolean;
  serverId: string | null;
  serverName?: string;
}

export interface ToolCallDTO {
  id: string;
  kind: string;
  serverId: string | null;
  toolName: string;
  arguments: string | null;
  result: string | null;
  status: string;
  latencyMs: number | null;
  conversationId: string | null;
  agentTaskId: string | null;
  createdAt: number;
}

export type RunToolResult =
  | { ok: true; result: string; latencyMs: number }
  | { needsConfirm: true; message: string };

export const listMcpServers = () => request<{ servers: McpServerDTO[] }>('/api/mcp/servers');

export const createMcpServer = (input: McpServerInput) =>
  request<McpServerDTO>('/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const patchMcpServer = (id: string, patch: McpServerInput & { status?: string | null }) =>
  request<McpServerDTO>(`/api/mcp/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export const deleteMcpServer = (id: string) =>
  request<{ ok: true }>(`/api/mcp/servers/${id}`, { method: 'DELETE' });

export const listServerTools = (id: string) =>
  request<{ tools: McpToolInfo[] }>(`/api/mcp/servers/${id}/tools`);

export const listTools = () => request<{ tools: ToolInfoDTO[] }>('/api/tools');

export const listToolCalls = () => request<{ calls: ToolCallDTO[] }>('/api/tool-calls');

export const getAllowList = () => request<{ allowList: string[] }>('/api/tool-permissions');

export const setAllow = (key: string, remove = false) =>
  request<{ allowList: string[] }>('/api/tool-permissions', {
    method: 'POST',
    body: JSON.stringify({ key, remove }),
  });

/** 执行工具；409（需确认）不抛异常，返回 needsConfirm 交由调用方处理 */
export async function runTool(input: {
  name: string;
  arguments?: Record<string, unknown>;
  serverId?: string;
  confirm?: boolean;
}): Promise<RunToolResult> {
  const res = await fetch('/api/tools/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    const data = (await res.json()) as { message?: string };
    return { needsConfirm: true, message: data.message ?? '需要确认' };
  }
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data?.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as { ok: true; result: string; latencyMs: number };
}

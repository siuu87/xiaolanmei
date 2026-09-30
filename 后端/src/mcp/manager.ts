import { db } from '../db/client.js';
import { mcpServers } from '../db/schema.js';
import type { McpServerConfig, McpToolInfo } from './client.js';
import { listTools, callTool } from './client.js';

/** MCP 服务器（DB 行） */
export interface McpServerRow {
  id: string;
  name: string;
  type: string;
  config: string | null;
  enabled: boolean;
  permissions: string | null;
  status: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

function parseConfig(row: McpServerRow): McpServerConfig {
  let raw: Record<string, unknown> = {};
  try {
    raw = row.config ? (JSON.parse(row.config) as Record<string, unknown>) : {};
  } catch {
    raw = {};
  }
  const type = (row.type === 'stdio' || row.type === 'sse' ? row.type : 'http') as
    | 'stdio'
    | 'sse'
    | 'http';
  return {
    type,
    url: typeof raw.url === 'string' ? raw.url : undefined,
    headers: raw.headers && typeof raw.headers === 'object' ? (raw.headers as Record<string, string>) : undefined,
    command: typeof raw.command === 'string' ? raw.command : undefined,
    args: Array.isArray(raw.args) ? (raw.args as string[]) : undefined,
    env: raw.env && typeof raw.env === 'object' ? (raw.env as Record<string, string>) : undefined,
  };
}

export function listServerRows(): McpServerRow[] {
  return db.select().from(mcpServers).all().filter((s) => s.deletedAt == null);
}

export function getServerRow(id: string): McpServerRow | undefined {
  return db.select().from(mcpServers).all().find((s) => s.deletedAt == null && s.id === id);
}

/** 列出某服务器上的工具（实时探测，失败时返回空并可由调用方更新状态） */
export async function listServerTools(id: string): Promise<McpToolInfo[]> {
  const row = getServerRow(id);
  if (!row) return [];
  return listTools(parseConfig(row));
}

/** 调用某服务器上的工具 */
export async function runServerTool(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const row = getServerRow(id);
  if (!row) throw new Error('MCP 服务器不存在');
  return callTool(parseConfig(row), toolName, args);
}

/** 所有「启用」服务器上的全部工具（实时探测，供模型 tools 列表） */
export async function listAllMcpTools(): Promise<
  { serverId: string; serverName: string; tool: McpToolInfo }[]
> {
  const rows = listServerRows().filter((r) => r.enabled);
  const out: { serverId: string; serverName: string; tool: McpToolInfo }[] = [];
  await Promise.all(
    rows.map(async (r) => {
      try {
        const tools = await listServerTools(r.id);
        for (const t of tools) out.push({ serverId: r.id, serverName: r.name, tool: t });
      } catch {
        /* 探测失败的服务器跳过 */
      }
    }),
  );
  return out;
}

import { db } from '../db/client.js';
import { toolCalls } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { getSettingValue, setSetting } from '../routes/settings.js';
import { getBuiltinTool, listBuiltinTools, builtinToolDef } from '../tools/registry.js';
import { runServerTool, listAllMcpTools } from '../mcp/manager.js';
import type { ToolDef } from '../adapters/types.js';

/**
 * 统一工具执行 + 权限确认层（阶段 9，MCP 与智能编程共用）。
 * - 内置只读工具（联网读网页/搜索）：默认免确认。
 * - MCP 工具：默认需确认，除非在允许列表，或调用方显式 confirm=true。
 * - 每次执行都落 tool_calls 记录（含延迟与状态）。
 */

const ALLOW_KEY = 'tool.allowList';

/** 允许列表（免确认），存 settings，形如 ["builtin:web_fetch", "mcp:<id>:*"] */
export function getAllowList(): string[] {
  return getSettingValue<string[]>(ALLOW_KEY, []);
}

export function addAllow(key: string): void {
  const list = new Set(getAllowList());
  list.add(key);
  setSetting(ALLOW_KEY, [...list]);
}

export function removeAllow(key: string): void {
  setSetting(ALLOW_KEY, getAllowList().filter((k) => k !== key));
}

export interface RunToolInput {
  kind: 'builtin' | 'mcp';
  name: string;
  serverId?: string;
  arguments: Record<string, unknown>;
  conversationId?: string | null;
  agentTaskId?: string | null;
  confirm?: boolean; // 用户已点确认
}

export type RunToolResult =
  | { status: 'ok'; result: string; latencyMs: number; toolCallId: string }
  | { status: 'needs_confirm'; reason: string }
  | { status: 'error'; message: string; latencyMs: number };

/** 判断某工具是否需要确认（内置只读工具不需要） */
export function toolRequiresConfirm(kind: string, name: string, serverId?: string): boolean {
  if (kind === 'builtin') {
    const t = getBuiltinTool(name);
    return t ? t.requiresConfirm : false;
  }
  return true; // MCP 默认需确认
}

/** 是否已被允许免确认 */
export function isAllowed(kind: string, name: string, serverId?: string): boolean {
  const list = getAllowList();
  if (kind === 'builtin') {
    const t = getBuiltinTool(name);
    if (t && !t.requiresConfirm) return true;
    return list.includes(`builtin:${name}`);
  }
  if (kind === 'code') {
    return list.includes(`code:${name}`);
  }
  return (
    list.includes(`mcp:${serverId ?? ''}:${name}`) ||
    list.includes(`mcp:${serverId ?? ''}:*`)
  );
}

async function execBuiltin(name: string, args: Record<string, unknown>): Promise<string> {
  const t = getBuiltinTool(name);
  if (!t) throw new Error(`未知内置工具：${name}`);
  return t.execute(args);
}

export function logToolCall(rec: {
  kind: string;
  serverId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
  result: string | null;
  status: string;
  latencyMs: number;
  conversationId?: string | null;
  agentTaskId?: string | null;
}): void {
  try {
    db.insert(toolCalls)
      .values({
        id: newId(),
        kind: rec.kind,
        serverId: rec.serverId ?? null,
        toolName: rec.toolName,
        arguments: JSON.stringify(rec.args),
        result: rec.result ? rec.result.slice(0, 8000) : null,
        status: rec.status,
        latencyMs: rec.latencyMs,
        conversationId: rec.conversationId ?? null,
        agentTaskId: rec.agentTaskId ?? null,
        createdAt: now(),
        updatedAt: now(),
      })
      .run();
  } catch {
    /* 记录失败不阻断执行 */
  }
}

/** 执行一个工具（权限 → 执行 → 落库）。返回结果或 needs_confirm。 */
export async function runTool(input: RunToolInput): Promise<RunToolResult> {
  const { kind, name, serverId, arguments: args } = input;

  if (toolRequiresConfirm(kind, name, serverId) && !isAllowed(kind, name, serverId)) {
    if (!input.confirm) {
      return {
        status: 'needs_confirm',
        reason: `工具「${name}」需要确认才能执行`,
      };
    }
  }

  const started = now();
  try {
    let result: string;
    if (kind === 'builtin') {
      result = await execBuiltin(name, args);
    } else {
      if (!serverId) throw new Error('MCP 工具缺少 serverId');
      const r = await runServerTool(serverId, name, args);
      result = r.isError ? `错误：${r.content}` : r.content;
    }
    const latencyMs = now() - started;
    const toolCallId = newId();
    logToolCall({
      kind,
      serverId,
      toolName: name,
      args,
      result,
      status: 'success',
      latencyMs,
      conversationId: input.conversationId,
      agentTaskId: input.agentTaskId,
    });
    return { status: 'ok', result, latencyMs, toolCallId };
  } catch (err) {
    const latencyMs = now() - started;
    logToolCall({
      kind,
      serverId,
      toolName: name,
      args,
      result: (err as Error).message,
      status: 'error',
      latencyMs,
      conversationId: input.conversationId,
      agentTaskId: input.agentTaskId,
    });
    return { status: 'error', message: (err as Error).message, latencyMs };
  }
}

/** 把某次工具的文本结果转成给模型的 tool 角色消息内容 */
export function toolResultContent(name: string, output: string): string {
  return `[工具 ${name} 结果]\n${output}`;
}

/**
 * 组装给模型的 tools 定义：内置工具 + 所有启用 MCP 的工具。
 * 返回 { defs, resolve }，其中 resolve(name) 能把模型请求的工具名解析成 RunToolInput。
 */
export async function buildToolContext(): Promise<{
  defs: ToolDef[];
  resolve: (name: string) => RunToolInput | null;
}> {
  const builtin = listBuiltinTools();
  const mcp = await listAllMcpTools();

  const defs: ToolDef[] = builtin.map(builtinToolDef);
  for (const { tool } of mcp) {
    defs.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || `MCP 工具 ${tool.name}`,
        parameters: tool.inputSchema ?? { type: 'object', properties: {} },
      },
    });
  }

  const resolve = (name: string): RunToolInput | null => {
    if (builtin.some((b) => b.name === name)) return { kind: 'builtin', name, arguments: {} };
    const hit = mcp.find((m) => m.tool.name === name);
    if (hit) return { kind: 'mcp', name, serverId: hit.serverId, arguments: {} };
    return null;
  };

  return { defs, resolve };
}

import type { FastifyInstance } from 'fastify';
import { desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { toolCalls } from '../db/schema.js';
import { listBuiltinTools } from '../tools/registry.js';
import { listAllMcpTools } from '../mcp/manager.js';
import { runTool, getAllowList, addAllow, removeAllow, isAllowed } from '../services/toolRunner.js';

/**
 * 工具路由（阶段 9）：工具清单 / 执行 / 调用记录 / 允许列表。
 * 执行统一走 toolRunner（权限 + 记录）；MCP 工具默认需确认，内置只读工具免确认。
 */
export async function toolRoutes(app: FastifyInstance): Promise<void> {
  // 可用工具清单：内置 + 已启用 MCP（MCP 实时探测）
  app.get('/tools', async () => {
    const builtin = listBuiltinTools().map((t) => ({
      kind: 'builtin' as const,
      name: t.name,
      description: t.description,
      requiresConfirm: t.requiresConfirm,
      allowed: isAllowed('builtin', t.name),
      serverId: null,
    }));

    let mcp: {
      kind: 'mcp';
      name: string;
      description: string;
      requiresConfirm: boolean;
      allowed: boolean;
      serverId: string;
      serverName: string;
    }[] = [];
    try {
      mcp = (await listAllMcpTools()).map(({ serverId, serverName, tool }) => ({
        kind: 'mcp' as const,
        name: tool.name,
        description: tool.description,
        requiresConfirm: true,
        allowed: isAllowed('mcp', tool.name, serverId),
        serverId,
        serverName,
      }));
    } catch {
      /* MCP 探测失败时忽略 */
    }

    return { tools: [...builtin, ...mcp] };
  });

  // 执行一个工具（body 可带 serverId 表示 MCP 工具；confirm=true 表示用户已确认）
  app.post('/tools/run', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
      serverId?: string;
      conversationId?: string;
      agentTaskId?: string;
      confirm?: boolean;
    };
    const name = (body.name ?? '').trim();
    if (!name) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少工具名' });
      return;
    }
    const kind = body.serverId ? 'mcp' : 'builtin';
    const res = await runTool({
      kind,
      name,
      serverId: body.serverId,
      arguments: body.arguments ?? {},
      conversationId: body.conversationId ?? null,
      agentTaskId: body.agentTaskId ?? null,
      confirm: body.confirm === true,
    });
    if (res.status === 'needs_confirm') {
      reply.code(409).send({ code: 'needs_confirm', message: res.reason });
      return;
    }
    if (res.status === 'error') {
      reply.code(500).send({ code: 'tool_error', message: res.message });
      return;
    }
    return { ok: true, result: res.result, latencyMs: res.latencyMs };
  });

  // 调用记录（最近 50 条）
  app.get('/tool-calls', async () => {
    const rows = db
      .select()
      .from(toolCalls)
      .orderBy(desc(toolCalls.createdAt))
      .limit(50)
      .all()
      .filter((r) => r.deletedAt == null);
    return { calls: rows };
  });

  // 允许列表（免确认清单）
  app.get('/tool-permissions', async () => ({ allowList: getAllowList() }));

  app.post('/tool-permissions', async (req, reply) => {
    const body = (req.body ?? {}) as { key?: string; remove?: boolean };
    const key = (body.key ?? '').trim();
    if (!key) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少 key' });
      return;
    }
    if (body.remove) removeAllow(key);
    else addAllow(key);
    return { allowList: getAllowList() };
  });
}

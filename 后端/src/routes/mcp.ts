import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mcpServers } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { listServerTools, getServerRow, type McpServerRow } from '../mcp/manager.js';

/**
 * MCP 服务器管理（阶段 9）：CRUD + 状态探测 + 工具清单。
 * 配置中的密钥（如 headers.authorization）只存后端，不下发前端（GET 返回时脱敏）。
 */

function toDTO(row: McpServerRow) {
  let config: Record<string, unknown> = {};
  try {
    config = row.config ? (JSON.parse(row.config) as Record<string, unknown>) : {};
  } catch {
    config = {};
  }
  // 脱敏：不透出 headers 里的 Authorization 等密钥
  const safeConfig: Record<string, unknown> = { ...config };
  if (safeConfig.headers && typeof safeConfig.headers === 'object') {
    const h = { ...(safeConfig.headers as Record<string, string>) };
    for (const k of Object.keys(h)) {
      if (/auth|token|key|secret/i.test(k)) h[k] = '••••••';
    }
    safeConfig.headers = h;
  }
  if (safeConfig.env && typeof safeConfig.env === 'object') {
    const e = { ...(safeConfig.env as Record<string, string>) };
    for (const k of Object.keys(e)) {
      if (/token|key|secret|password/i.test(k)) e[k] = '••••••';
    }
    safeConfig.env = e;
  }

  let permissions: unknown = null;
  try {
    permissions = row.permissions ? JSON.parse(row.permissions) : null;
  } catch {
    permissions = null;
  }

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: safeConfig,
    enabled: row.enabled,
    permissions,
    status: row.status,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/mcp/servers', async () => {
    const rows = db.select().from(mcpServers).all().filter((r) => r.deletedAt == null);
    return { servers: rows.map(toDTO) };
  });

  app.post('/mcp/servers', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
      permissions?: unknown;
    };
    const name = (body.name ?? '').trim();
    const type = body.type === 'stdio' || body.type === 'sse' ? body.type : 'http';
    if (!name) {
      reply.code(400).send({ code: 'invalid_request', message: '缺少服务器名称' });
      return;
    }
    const ts = now();
    const id = newId();
    db.insert(mcpServers)
      .values({
        id,
        name,
        type,
        config: JSON.stringify(body.config ?? {}),
        enabled: body.enabled !== false,
        permissions: body.permissions != null ? JSON.stringify(body.permissions) : null,
        status: 'unknown',
        lastError: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const row = getServerRow(id)!;
    return toDTO(row);
  });

  app.patch('/mcp/servers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string;
      type?: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
      permissions?: unknown;
      status?: string | null;
      lastError?: string | null;
    };
    const existing = getServerRow(id);
    if (!existing) {
      reply.code(404).send({ code: 'not_found', message: '服务器不存在' });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.type !== undefined) {
      patch.type = body.type === 'stdio' || body.type === 'sse' ? body.type : 'http';
    }
    if (body.config !== undefined) patch.config = JSON.stringify(body.config);
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.permissions !== undefined) patch.permissions = JSON.stringify(body.permissions);
    if (body.status !== undefined) patch.status = body.status;
    if (body.lastError !== undefined) patch.lastError = body.lastError;
    db.update(mcpServers).set(patch).where(eq(mcpServers.id, id)).run();
    return toDTO(getServerRow(id)!);
  });

  app.delete('/mcp/servers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = getServerRow(id);
    if (!existing) {
      reply.code(404).send({ code: 'not_found', message: '服务器不存在' });
      return;
    }
    db.update(mcpServers).set({ deletedAt: now(), updatedAt: now() }).where(eq(mcpServers.id, id)).run();
    return { ok: true };
  });

  // 探测某服务器工具（并回写状态）
  app.get('/mcp/servers/:id/tools', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getServerRow(id);
    if (!row) {
      reply.code(404).send({ code: 'not_found', message: '服务器不存在' });
      return;
    }
    try {
      const tools = await listServerTools(id);
      db.update(mcpServers)
        .set({ status: 'ok', lastError: null, updatedAt: now() })
        .where(eq(mcpServers.id, id))
        .run();
      return { tools };
    } catch (err) {
      db.update(mcpServers)
        .set({ status: 'error', lastError: (err as Error).message, updatedAt: now() })
        .where(eq(mcpServers.id, id))
        .run();
      reply.code(502).send({ code: 'mcp_error', message: (err as Error).message });
    }
  });
}

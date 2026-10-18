import type { FastifyInstance } from 'fastify';
import { newId } from '../utils/id.js';
import { phoneHub, type PhoneCommandResult } from '../phoneControl/hub.js';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 手机控制路由（原生 Android 桥 ↔ 后端）。
 *
 * 通道：
 * - `GET  /api/phone-control/stream`  —— 原生端连这个（SSE），后端把指令作为 `command` 事件推下去。
 * - `POST /api/phone-control/result`  —— 原生端执行完，把结果按 reqId 回报。
 * - `GET  /api/phone-control/status`  —— 当前是否有原生端在线。
 * - `POST /api/phone-control/command` —— 直发一条指令（手动/脚本用；内置工具走 hub 内部调用，不经 HTTP）。
 *
 * 安全：若设置了环境变量 `PHONE_CONTROL_TOKEN`，则所有端点都要求 `?token=` 或 body.token 匹配；
 * 没设置则开放（仅限本地/内网使用，见 docs/phone-control.md）。
 */

const TOKEN = process.env.PHONE_CONTROL_TOKEN;

function checkToken(token?: string): boolean {
  if (!TOKEN) return true;
  return token === TOKEN;
}

export async function phoneControlRoutes(app: FastifyInstance): Promise<void> {
  app.get('/phone-control/status', async (req, reply) => {
    const q = req.query as { token?: string };
    if (!checkToken(q.token)) {
      reply.code(401).send({ message: 'unauthorized' });
      return;
    }
    return { connected: phoneHub.isConnected(), clients: phoneHub.listClients() };
  });

  // SSE：原生端长连接，后端单向推指令
  app.get('/phone-control/stream', async (req, reply) => {
    const q = req.query as { clientId?: string; token?: string };
    if (!checkToken(q.token)) {
      reply.code(401).send({ message: 'unauthorized' });
      return;
    }
    const clientId = (q.clientId ?? '').trim() || newId();
    // hijack：完全接管底层响应，自己写 SSE 流
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: { reqId: string; tool: string; args: Record<string, unknown> }) => {
      raw.write(`event: command\ndata: ${JSON.stringify(event)}\n\n`);
    };
    phoneHub.register(clientId, send);
    raw.write(`event: ready\ndata: ${JSON.stringify({ clientId, ok: true })}\n\n`);

    const hb = setInterval(() => raw.write(': keep-alive\n\n'), 15_000);
    const cleanup = () => {
      clearInterval(hb);
      phoneHub.unregister(clientId);
      try {
        raw.end();
      } catch {
        /* 已关闭 */
      }
    };
    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
  });

  // 原生端回报结果
  app.post('/phone-control/result', async (req, reply) => {
    const body = (req.body ?? {}) as {
      reqId?: string;
      ok?: boolean;
      data?: unknown;
      error?: string;
      token?: string;
    };
    if (!checkToken(body.token)) {
      reply.code(401).send({ message: 'unauthorized' });
      return;
    }
    const reqId = (body.reqId ?? '').trim();
    if (!reqId) {
      reply.code(400).send({ message: '缺少 reqId' });
      return;
    }
    const accepted = phoneHub.reportResult(reqId, {
      ok: body.ok === true,
      data: body.data,
      error: body.error,
    } as PhoneCommandResult);
    return { ok: true, accepted };
  });

  // 直发指令（手动/脚本/外部触发）
  app.post('/phone-control/command', async (req, reply) => {
    const body = (req.body ?? {}) as {
      tool?: string;
      args?: Record<string, unknown>;
      clientId?: string;
      timeoutMs?: number;
      token?: string;
    };
    if (!checkToken(body.token)) {
      reply.code(401).send({ message: 'unauthorized' });
      return;
    }
    const tool = (body.tool ?? '').trim();
    if (!tool) {
      reply.code(400).send({ message: '缺少 tool' });
      return;
    }
    const res = await phoneHub.sendCommand(tool, body.args ?? {}, {
      clientId: body.clientId,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
    });
    if (!res.ok) {
      reply.code(503).send({ message: res.error ?? 'PHONE_OFFLINE' });
      return;
    }
    return { ok: true, data: res.data };
  });

  // 原生端把截图（base64 PNG）传上来，后端落盘并返回可访问 URL（仅本地/内网）
  const SHOT_DIR = join(process.cwd(), 'data', 'phone-shots');
  const ensureShotDir = () => {
    try {
      mkdirSync(SHOT_DIR, { recursive: true });
    } catch {
      /* 忽略 */
    }
  };

  app.post('/phone-control/screenshot', async (req, reply) => {
    const body = (req.body ?? {}) as { image?: string; token?: string };
    if (!checkToken(body.token)) {
      reply.code(401).send({ message: 'unauthorized' });
      return;
    }
    const b64 = (body.image ?? '').trim();
    if (!b64) {
      reply.code(400).send({ message: '缺少 image' });
      return;
    }
    ensureShotDir();
    const id = newId();
    const file = join(SHOT_DIR, `${id}.png`);
    try {
      writeFileSync(file, Buffer.from(b64, 'base64'));
    } catch {
      reply.code(500).send({ message: '写入截图失败' });
      return;
    }
    return { ok: true, url: `/api/phone-control/screenshot/${id}` };
  });

  app.get('/phone-control/screenshot/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const safe = /^[A-Za-z0-9_-]+$/.test(id) ? id : '';
    const file = join(SHOT_DIR, `${safe}.png`);
    if (!safe || !existsSync(file)) {
      reply.code(404).send({ message: 'not found' });
      return;
    }
    reply.header('Content-Type', 'image/png');
    reply.send(readFileSync(file));
  });
}

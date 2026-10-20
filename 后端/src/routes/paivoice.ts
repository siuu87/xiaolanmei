import type { FastifyInstance } from 'fastify';
import net from 'node:net';
import { env } from '../config/env.js';

/**
 * PaiVoice 实时语音层状态（2026-10-20）。
 *
 * PaiVoice 核心只开 WebSocket，没有 HTTP 健康端点，所以这里用 TCP 探活：
 * 连得上 8780 就认为「可接通」，前端据此把通话切到 `/paivoice/` 独立页。
 * 探不通也不影响原来的通话浮层（回退）。
 */

function parseWs(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    const port = Number(u.port) || (u.protocol === 'wss:' ? 443 : 80);
    return { host: u.hostname || '127.0.0.1', port };
  } catch {
    return { host: '127.0.0.1', port: 8780 };
  }
}

function probe(host: string, port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function paivoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/paivoice/status', async () => {
    const { host, port } = parseWs(env.paivoiceWsUrl);
    const up = await probe(host, port);
    return {
      configured: true,
      up,
      wsUrl: env.paivoiceWsUrl,
      host,
      port,
      page: '/paivoice/index.html',
    };
  });
}

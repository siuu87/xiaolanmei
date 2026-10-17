import type { FastifyInstance } from 'fastify';
import {
  clearLinkConfig,
  getSnapshot,
  maskUrl,
  normalizeMcpUrl,
  probeLink,
  readLinkConfig,
  resolveParts,
  saveLinkConfig,
} from '../device/loverconnect.js';

/**
 * 手机感知（LoverConnect 接入）。
 *
 * 安全约定：`url` 里带着每次安装独有的随机路径令牌，**只在后端留存**。
 * 所有出站响应一律用 `maskUrl()` 脱敏，也不写日志 —— 这条和 MCP 服务器的
 * headers 脱敏是同一个理由，别为了调试方便把原串回给前端。
 */

interface LinkDTO {
  configured: boolean;
  enabled: boolean;
  urlMasked: string;
  /** 令牌位数：够用户比对「是不是同一次安装」，又不可逆 */
  tokenLength: number;
}

function tokenLengthOf(url: string): number {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/mcp\//, '').length;
  } catch {
    return 0;
  }
}

function toLinkDTO(): LinkDTO {
  const cfg = readLinkConfig();
  if (!cfg) return { configured: false, enabled: false, urlMasked: '', tokenLength: 0 };
  return {
    configured: true,
    enabled: cfg.enabled,
    urlMasked: maskUrl(cfg.url),
    tokenLength: tokenLengthOf(cfg.url),
  };
}

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/device/link', async () => toLinkDTO());

  // 探测：不传 url 就用已保存的那条，用于「再测一次」
  app.post('/device/link/probe', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string };
    const target = (body.url ?? '').trim() || readLinkConfig()?.url || '';
    if (!target) {
      reply.code(400).send({ code: 'invalid_request', message: '还没有配置地址' });
      return;
    }
    const probe = await probeLink(target);
    return { probe };
  });

  app.put('/device/link', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string; enabled?: boolean; force?: boolean };

    // 只改开关：没带 url 时直接翻转已有的
    if (!body.url && body.enabled !== undefined) {
      const cfg = readLinkConfig();
      if (!cfg) {
        reply.code(400).send({ code: 'invalid_request', message: '还没有配置地址' });
        return;
      }
      saveLinkConfig(cfg.url, body.enabled);
      return { link: toLinkDTO(), probe: null };
    }

    let normalized: string;
    try {
      normalized = normalizeMcpUrl(body.url ?? '');
    } catch (err) {
      reply.code(400).send({ code: 'invalid_request', message: (err as Error).message });
      return;
    }

    const probe = await probeLink(normalized);
    if (!probe.ok && body.force !== true) {
      // 探测失败时不落库，除非用户显式要求「仍然保存」（比如手机现在不在手边）
      reply.code(400).send({
        code: 'probe_failed',
        message: probe.error ?? '连不上手机',
        probe,
      });
      return;
    }

    saveLinkConfig(normalized, body.enabled !== false);
    return { link: toLinkDTO(), probe };
  });

  app.delete('/device/link', async () => {
    clearLinkConfig();
    return toLinkDTO();
  });

  app.get('/device/snapshot', async (req) => {
    const q = (req.query ?? {}) as { full?: string; refresh?: string };
    const snapshot = await getSnapshot({
      full: q.full === '1' || q.full === 'true',
      refresh: q.refresh === '1' || q.refresh === 'true',
    });
    return { snapshot, parts: resolveParts(q.full === '1' || q.full === 'true') };
  });
}

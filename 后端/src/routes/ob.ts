import type { FastifyInstance } from 'fastify';
import { obQuery, obStatus } from '../services/ombreBrain.js';

/**
 * Ombre Brain 专线自检路由（2026-10-19）。
 *
 * - `GET  /ob/status` 只回「有没有配 / token 有没有 / 超时多少」，不吐 token、不吐完整地址；
 * - `POST /ob/query`  拿一句话直接去 OB 检索，排查连通性用（面板不依赖它）。
 *
 * 注意：真正的对话检索在 `/chat/stream` 里与情绪分析并行发生，不走这两个接口。
 */
export async function obRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ob/status', async () => obStatus());

  app.post('/ob/query', async (req) => {
    const body = (req.body ?? {}) as { query?: string; limit?: number; threshold?: number };
    const hits = await obQuery(String(body.query ?? ''), {
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      threshold: typeof body.threshold === 'number' ? body.threshold : undefined,
    });
    return { hits };
  });
}

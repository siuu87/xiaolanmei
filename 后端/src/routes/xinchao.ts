import type { FastifyInstance } from 'fastify';
import {
  getXinchaoHealth,
  getXinchaoNow,
  getXinchaoState,
  postXinchaoEvent,
} from '../services/xinchao.js';

/**
 * 心潮·念（Xinchao·Nian）专线路由（2026-10-20，取代 /api/ob/*）。
 *
 * - `GET  /xinchao/status` 心潮在不在、版本、模式（front-end 用来决定面板显示哪套）
 * - `GET  /xinchao/now`    「此刻」压缩块（情绪 + 身体天气）
 * - `GET  /xinchao/state`  11 股驱力 + 情绪（已裁剪，不暴露黑匣子/念头原文）
 * - `POST /xinchao/event`  一轮对话写回心潮（fire-and-forget）
 *
 * 令牌只在后端；前端永远拿不到 `SERVICE_TOKEN`。
 */
export async function xinchaoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/xinchao/status', async () => getXinchaoHealth());

  app.get('/xinchao/now', async (_req, reply) => {
    const now = await getXinchaoNow();
    if (!now) {
      reply.code(503).send({ message: '心潮未启动或不可达' });
      return;
    }
    return now;
  });

  app.get('/xinchao/state', async (_req, reply) => {
    const state = await getXinchaoState();
    if (!state) {
      reply.code(503).send({ message: '心潮未启动或不可达' });
      return;
    }
    return state;
  });

  app.post('/xinchao/event', async (req) => {
    const body = (req.body ?? {}) as {
      exchange?: string;
      recent?: string;
      sessionId?: string | null;
      eventId?: string | null;
    };
    if (typeof body.exchange === 'string' && body.exchange.trim()) {
      await postXinchaoEvent({
        exchange: body.exchange,
        recent: body.recent,
        sessionId: body.sessionId,
        eventId: body.eventId,
      });
    }
    return { ok: true };
  });
}

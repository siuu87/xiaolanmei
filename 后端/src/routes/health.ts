import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * 健康检查路由：验证前后端联通用。
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'blueberry-backend',
      port: env.port,
      time: Date.now(),
    };
  });
}

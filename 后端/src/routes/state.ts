import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * 状态监视器代理（心潮 xinchao-nian）。
 * 前端只认 GET /api/state，这里转发到本地心潮的 GET /v1/state，
 * 带 Authorization: Bearer <SERVICE_TOKEN>、4s 超时；
 * 上游不可用时降级返回最后一次成功缓存（或空骨架），保证前端不崩。
 * 心潮 /v1/state 的返回字段尚未固定，这里原样透传为 data，等确认后前端再映射。
 */

interface StateSnapshot {
  ts: number;
  degraded: boolean;
  data: unknown;
}

// 进程内缓存：上游短暂失联时回退最后一次成功数据（重启清空）
let cached: StateSnapshot | null = null;

export async function stateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/state', async (req) => {
    const base = env.xinchaoBaseUrl.replace(/\/+$/, '');
    const url = `${base}/v1/state`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const upstream = await fetch(url, {
        headers: env.xinchaoToken ? { Authorization: `Bearer ${env.xinchaoToken}` } : undefined,
        signal: controller.signal,
      });
      if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
      const data = await upstream.json();
      const snapshot: StateSnapshot = { ts: Date.now(), degraded: false, data };
      cached = snapshot;
      return snapshot;
    } catch (err) {
      req.log.warn({ err }, 'xinchao upstream unavailable, returning fallback');
      return { ts: Date.now(), degraded: true, data: cached?.data ?? null };
    } finally {
      clearTimeout(timer);
    }
  });
}

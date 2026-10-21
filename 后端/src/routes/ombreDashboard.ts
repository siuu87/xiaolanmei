import type { FastifyInstance } from 'fastify';
import {
  getBuckets,
  getBucket,
  getOmbreStatus,
  ombrdConfigured,
  ombrdProbe,
  searchBuckets,
  type BucketQuery,
} from '../services/ombreDashboard.js';

/**
 * Ombre Brain Dashboard（OB 记忆中枢）代理路由（2026-10-21）。
 *
 * 小蓝莓后端代持 Dashboard 的密码会话，前端只调这里：
 * - `GET  /ombre-dashboard/status`   在线状态 + 记忆总数
 * - `GET  /ombre-dashboard/buckets`  列表（?type=&state=&sort=）
 * - `GET  /ombre-dashboard/search?q=` 关键词检索
 * - `GET  /ombre-dashboard/buckets/:id` 单条记忆详情
 *
 * 未配置时所有接口都返回「空但成功」的响应，前端据此隐藏「记忆」页签。
 */
export async function ombreDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ombre-dashboard/status', async () => getOmbreStatus());

  app.get('/ombre-dashboard/buckets', async (req) => {
    const q = (req.query ?? {}) as Record<string, string>;
    const query: BucketQuery = {
      type: q.type === 'dynamic' || q.type === 'permanent' ? q.type : undefined,
      state: (['all', 'dynamic', 'permanent', 'pinned', 'archived'] as const).includes(q.state as never)
        ? (q.state as BucketQuery['state'])
        : 'all',
      sort: (['score', 'created_desc', 'created_asc'] as const).includes(q.sort as never)
        ? (q.sort as BucketQuery['sort'])
        : 'score',
    };
    const buckets = await getBuckets(query);
    return { buckets, count: buckets.length };
  });

  app.get('/ombre-dashboard/search', async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string>;
    const keyword = (q.q ?? '').trim();
    if (!keyword) {
      reply.code(400).send({ message: '缺少 q 参数' });
      return;
    }
    const buckets = await searchBuckets(keyword);
    return { buckets, count: buckets.length };
  });

  app.get('/ombre-dashboard/buckets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const bucket = await getBucket(id);
    if (!bucket) {
      reply.code(404).send({ message: '记忆不存在或不可达', configured: ombrdConfigured() });
      return;
    }
    return bucket;
  });

  app.get('/ombre-dashboard/probe', async () => ombrdProbe());
}

import type { FastifyInstance } from 'fastify';
import {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  countSubscriptions,
  type PushSubscriptionInfo,
} from '../services/pushService.js';

/** 手机系统通知：公钥下发 + 订阅上报 / 退订 + 状态查询 */
export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/push/vapid', async () => ({ publicKey: getVapidPublicKey() }));

  app.get('/push/status', async () => ({ supported: true, subscriptions: countSubscriptions() }));

  app.post('/push/subscribe', async (request) => {
    const body = request.body as { deviceId?: string; subscription?: PushSubscriptionInfo } | undefined;
    if (!body?.deviceId || !body.subscription?.endpoint) {
      return { ok: false, error: '参数不完整' };
    }
    saveSubscription(body.deviceId, body.subscription);
    return { ok: true, subscriptions: countSubscriptions() };
  });

  app.delete('/push/subscribe', async (request) => {
    const query = request.query as { deviceId?: string } | undefined;
    if (query?.deviceId) removeSubscription(query.deviceId);
    return { ok: true, subscriptions: countSubscriptions() };
  });
}

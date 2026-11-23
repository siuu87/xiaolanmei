/**
 * Web Push 系统通知（2026-11-23）。
 *
 * VAPID 密钥和订阅都存后端 settings 表（随数据库一起备份），
 * 不发任何第三方服务：订阅 endpoint 由浏览器给（Chrome/Safari 的推送网关），
 * 我们只负责把通知负载签好名投递过去。
 */
import { createRequire } from 'node:module';
import { getSettingValue, setSetting } from '../routes/settings.js';

// web-push 是 CJS 包，ESM 运行时没有 default 导出；用 createRequire 稳拿它
const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof import('web-push');

const VAPID_KEY = 'push.vapid';
const SUBS_KEY = 'push.subscriptions';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushSubscriptionInfo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let configured = false;

function ensureVapid(): VapidKeys {
  let keys = getSettingValue<VapidKeys | null>(VAPID_KEY, null);
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys() as VapidKeys;
    setSetting(VAPID_KEY, keys);
  }
  if (!configured) {
    webpush.setVapidDetails('mailto:blueberry@local', keys.publicKey, keys.privateKey);
    configured = true;
  }
  return keys;
}

export function getVapidPublicKey(): string {
  return ensureVapid().publicKey;
}

export function saveSubscription(deviceId: string, subscription: PushSubscriptionInfo): void {
  if (!deviceId || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) return;
  const all = getSettingValue<Record<string, PushSubscriptionInfo>>(SUBS_KEY, {});
  setSetting(SUBS_KEY, { ...all, [deviceId]: subscription });
}

export function removeSubscription(deviceId: string): void {
  const all = getSettingValue<Record<string, PushSubscriptionInfo>>(SUBS_KEY, {});
  if (!all[deviceId]) return;
  const next = { ...all };
  delete next[deviceId];
  setSetting(SUBS_KEY, next);
}

export function countSubscriptions(): number {
  const all = getSettingValue<Record<string, PushSubscriptionInfo>>(SUBS_KEY, {});
  return Object.keys(all ?? {}).length;
}

/**
 * 给所有已订阅设备推一条通知。单个设备失败（换机 / 退订）只清掉那条订阅，
 * 不影响其他设备，也绝不让通知故障挡住聊天主流程。
 */
export async function sendPush(payload: PushPayload): Promise<void> {
  try {
    ensureVapid();
    const all = getSettingValue<Record<string, PushSubscriptionInfo>>(SUBS_KEY, {});
    const entries = Object.entries(all ?? {});
    if (!entries.length) return;

    const stale: string[] = [];
    await Promise.all(
      entries.map(async ([id, sub]) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({ ...payload, tag: payload.tag || 'blueberry' }),
            { TTL: 60 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) stale.push(id);
        }
      }),
    );
    if (stale.length) {
      const next = { ...all };
      for (const id of stale) delete next[id];
      setSetting(SUBS_KEY, next);
    }
  } catch {
    /* 通知是增强功能，任何异常都静默降级 */
  }
}

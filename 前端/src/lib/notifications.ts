/**
 * 手机系统通知（PWA Web Push）。
 *
 * 职责：注册 Service Worker → 申请通知权限 → 拿后端 VAPID 公钥订阅推送 →
 * 把订阅交给后端保存。这样他来消息 / 来电 / 送礼 / 布置任务时，
 * 即使小蓝莓切到后台、手机锁屏，也能收到系统通知；点通知回到对话。
 *
 * 不支持通知的环境（旧浏览器 / 未装成 PWA 的 iOS）会静默降级，
 * 不影响聊天本身。
 */

export type NotifyState = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  standalone: boolean;
};

const DEVICE_KEY = 'blueberry.push.device';
const DISMISS_KEY = 'blueberry.notify.tip.dismissed';

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev-anon';
  }
}

export function isStandalone(): boolean {
  return (
    (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) ||
    // iOS Safari 老版本没有 display-mode，用这个标记
    (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function getNotifyState(): NotifyState {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window;
  return {
    supported,
    permission: supported ? Notification.permission : 'unsupported',
    subscribed: false, // 真实订阅状态异步查，见 checkNotifyState
    standalone: isStandalone(),
  };
}

/** 注册 Service Worker（幂等），失败不影响使用 */
export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function checkNotifyState(): Promise<NotifyState> {
  const base = getNotifyState();
  if (!base.supported) return base;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return { ...base, subscribed: Boolean(sub) };
  } catch {
    return base;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** 开启系统通知：申请权限 + 订阅 + 上报后端。返回给用户看的提示语。 */
export async function enableNotifications(): Promise<{ ok: boolean; message: string }> {
  const state = getNotifyState();
  if (!state.supported) {
    return { ok: false, message: '这个浏览器不支持系统通知，建议用手机 Chrome / Safari 添加到主屏幕后打开。' };
  }
  try {
    const permission =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== 'granted') {
      return { ok: false, message: '没拿到通知权限，去浏览器设置里允许「小蓝莓」通知再来开。' };
    }

    const reg = (await registerSw()) ?? (await navigator.serviceWorker.ready);
    if (!reg) return { ok: false, message: '后台服务没准备好，稍后再试。' };

    const res = await fetch('/api/push/vapid');
    if (!res.ok) throw new Error('拿不到推送公钥');
    const { publicKey } = (await res.json()) as { publicKey?: string };
    if (!publicKey) throw new Error('推送公钥为空');

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const report = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId(), subscription: sub.toJSON() }),
    });
    if (!report.ok) throw new Error('订阅上报失败');

    return { ok: true, message: '系统通知已开启，他来消息会直接弹在手机上。' };
  } catch (err) {
    return { ok: false, message: `开启失败：${(err as Error).message}` };
  }
}

/** 关闭系统通知：退订 + 告诉后端删掉订阅 */
export async function disableNotifications(): Promise<{ ok: boolean; message: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await fetch(`/api/push/subscribe?deviceId=${encodeURIComponent(deviceId())}`, { method: 'DELETE' });
    return { ok: true, message: '已关闭系统通知。' };
  } catch (err) {
    return { ok: false, message: `关闭失败：${(err as Error).message}` };
  }
}

/** 前台时也弹一条系统通知（比如正在聊天时收到来电，兼顾后台与前台） */
export async function showLocalNotification(title: string, body: string, url = '/chat'): Promise<void> {
  try {
    if (!getNotifyState().supported || Notification.permission !== 'granted') return;
    const reg = (await registerSw()) ?? (await navigator.serviceWorker.ready);
    await reg?.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `blueberry-${Date.now()}`,
      data: { url },
    });
  } catch {
    /* 前台通知失败不影响应用内弹窗 */
  }
}

/** 安装引导是否已被用户划掉 */
export function isInstallTipDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallTip(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** iOS 判断：需要手动「分享 → 添加到主屏幕」 */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

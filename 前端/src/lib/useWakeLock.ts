import { useEffect } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * 播放声音时**别让屏幕睡着**（2026-10-18，晚安页后台保活）。
 *
 * 为什么需要：Android 上息屏后浏览器会被系统降频，Web Audio 生成的噪声和白噪音、
 * 以及 `<audio>` 的播放都可能被直接掐掉——用户听到一半突然安静，比没有还难受。
 * Screen Wake Lock 是最省事的一层保险：播放期间保持亮屏，声音就不会被后台策略回收
 * （同时配合 `MediaSession` 让锁屏上有播放控制，见 `GoodnightPage`）。
 *
 * 三个必须处理的现实问题：
 * 1. **不支持就静默跳过**：iOS Safari 至今没有 Wake Lock API，写死会崩；这里只判断能力。
 * 2. **切后台/切回前台会自动释放**：sentinel 会被浏览器 revoke，所以监听 `visibilitychange`
 *    回到前台时**重新申请**，不能只申请一次。
 * 3. **用户拒绝或省电模式拦截**：`request()` 会 reject，吞掉即可，功能降级但不报错。
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const request = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        const s = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
        // 浏览器主动释放（切后台）时把引用清掉，回来才能重新申请
        s.addEventListener?.('release', () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* 不支持 / 省电模式 / 用户拒绝：降级，不打扰用户 */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    };
  }, [active]);
}

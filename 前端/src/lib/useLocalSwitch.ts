import { useCallback, useEffect, useState } from 'react';

/**
 * localStorage 布尔开关（纯前端偏好），全局共享同一个实现。
 *
 * 为什么抽出来：2026-10-18 之前「睡前提醒 / 待提醒」两个开关只把值写进 localStorage，
 * **全项目没有任何地方读** —— 打开也不会发生任何事。现在有三处要读同一个键
 * （设置页开关、夜间提醒卡、备忘录首页的待提醒条），所以写入时要广播一个事件，
 * 让同一页面里的其他组件立刻同步；跨标签页另有 `storage` 事件兜底。
 */
const EVENT = 'blueberry:local-switch';

export function readLocalSwitch(key: string, def = false): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}

export function writeLocalSwitch(key: string, next: boolean) {
  try {
    localStorage.setItem(key, next ? '1' : '0');
  } catch {
    /* 隐私模式下写不进去，当次会话仍然按内存里的值走 */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function useLocalSwitch(key: string, def = false) {
  const [v, setV] = useState<boolean>(() => readLocalSwitch(key, def));

  useEffect(() => {
    const sync = (e: Event) => {
      // 只响应本键（custom event 带 detail，storage 事件带 key）
      if (e instanceof CustomEvent && e.detail && e.detail !== key) return;
      if (e instanceof StorageEvent && e.key && e.key !== key) return;
      setV(readLocalSwitch(key, def));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key, def]);

  const set = useCallback(
    (next: boolean) => {
      setV(next);
      writeLocalSwitch(key, next);
    },
    [key],
  );

  return [v, set] as const;
}

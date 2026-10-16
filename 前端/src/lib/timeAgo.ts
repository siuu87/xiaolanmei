/**
 * 相对时长格式化。
 *
 * 与后端 `后端/src/emotion/rules.ts` 的 `formatTimeInterval` / `formatDurationCN`
 * **入参与行为完全等价**（那边把中文时长拼进 delta 的理由里，这边显示卡片「多久以前」）。
 * 改任意一边都要同步另一边 —— 两边都有断言锁边界值。
 */

/** 紧凑形式，**入参是时长（ms）**：`刚刚` / `45m` / `2h 15m` / `3d` / `2mo` / `1y` */
export function formatTimeInterval(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 1) return '刚刚';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo` : `${Math.floor(d / 365)}y`;
}

/** 中文口语形式，**入参是时长（ms）**：`刚刚` / `20 分钟` / `5 小时` / `2 天` */
export function formatDurationCN(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 1) return '刚刚';
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) return `${h} 小时`;
  return `${Math.floor(h / 24)} 天`;
}

/** 便利包装：给一个时间戳，算出「距今多久」的紧凑形式（时钟漂移时不显示负数） */
export const formatSince = (ts: number, now: number = Date.now()): string =>
  formatTimeInterval(Math.max(0, now - ts));

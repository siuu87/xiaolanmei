/** 生成全局唯一 id（优先 crypto.randomUUID，兜底时间戳+随机） */
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

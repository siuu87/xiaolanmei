/**
 * 饮食与健康避坑（需求 §3）的**纯函数层**：级别、文案、命中检测。
 *
 * 硬规则：**这里不出现任何具体食物名**。条目一律来自动态档案
 * （人设变量 + 备忘录，见后端 `src/diet/profile.ts`），没配就是空。
 */

export type DietLevel = 'dislike' | 'allergy';

export interface DietProfile {
  /** 忌口（不想吃 / 要避开）→ 暖橙胶囊 */
  dislikes: string[];
  /** 过敏源（硬拦截）→ 红色胶囊 */
  allergies: string[];
}

export interface DietHit {
  name: string;
  level: DietLevel;
}

export const EMPTY_PROFILE: DietProfile = { dislikes: [], allergies: [] };

/** 胶囊配色：忌口暖橙 / 过敏红 —— 颜色与文案都由级别决定，跟具体食物无关 */
export function dietBadgeClass(level: DietLevel): string {
  return level === 'allergy'
    ? 'bg-red-500/25 text-red-400 border border-red-500/40'
    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
}

/** 胶囊文案：「[食物名称] · 忌口」/「[食物名称] · 严重过敏」 */
export function dietBadgeText(hit: DietHit): string {
  return `${hit.name} · ${hit.level === 'allergy' ? '严重过敏' : '忌口'}`;
}

/**
 * 文本命中检测：过敏排前面，大小写不敏感，同一名字只报一次。
 * 与后端 `matchDietHits` 同语义 —— 前端即时反馈（打字时就提示），
 * 真正的档案以 `GET /api/diet/profile` 为准。
 */
export function matchDietHits(text: string, profile: DietProfile): DietHit[] {
  const lower = (text ?? '').toLowerCase();
  if (!lower.trim()) return [];
  const hits: DietHit[] = [];
  const seen = new Set<string>();
  const add = (name: string, level: DietLevel) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key) || !lower.includes(key)) return;
    seen.add(key);
    hits.push({ name, level });
  };
  for (const n of profile.allergies) add(n, 'allergy');
  for (const n of profile.dislikes) add(n, 'dislike');
  return hits;
}

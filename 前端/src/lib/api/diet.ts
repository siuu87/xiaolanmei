import { request } from './conversations';
import type { DietHit, DietProfile } from '@/features/diet/dietHits';

/**
 * 饮食与健康档案（需求 §3）。
 * 数据源是**人设变量 + 备忘录**，前端不内置任何食物名。
 */

export const getDietProfile = () => request<DietProfile>('/api/diet/profile');

export const checkDiet = (text: string) =>
  request<{ hits: DietHit[]; hasAllergy: boolean }>('/api/diet/check', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

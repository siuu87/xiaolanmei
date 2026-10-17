import type { FastifyInstance } from 'fastify';
import { loadDietProfile } from '../diet/source.js';
import { matchDietHits, type DietHit, type DietProfile } from '../diet/profile.js';

/**
 * 饮食与健康档案路由（需求 §3）。
 *
 * 只提供**读**与**命中检测**：条目本身来自人设变量与备忘录，
 * 改条目请改人设（「他的资料 → 角色设定」）或往备忘录里记一笔，
 * 这样才符合「系统框架与人设数据解耦、禁止硬编码食物名」。
 */

export function toDietDTO(p: DietProfile) {
  return { dislikes: p.dislikes, allergies: p.allergies };
}

export async function dietRoutes(app: FastifyInstance): Promise<void> {
  /** 当前生效的忌口 / 过敏源 */
  app.get('/diet/profile', async () => toDietDTO(loadDietProfile()));

  /**
   * 一段文本命中了哪些忌口 / 过敏。
   * 聊天发消息、备忘录录入都调它 —— 命中就在界面上弹对应级别的胶囊徽章。
   */
  app.post('/diet/check', async (req) => {
    const body = (req.body ?? {}) as { text?: string };
    const hits: DietHit[] = matchDietHits(body.text ?? '', loadDietProfile());
    return { hits, hasAllergy: hits.some((h) => h.level === 'allergy') };
  });
}

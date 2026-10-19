import type { FastifyInstance } from 'fastify';
import { getState, patchState } from '../emotion/service.js';
import { PANEL_FIELDS } from '../emotion/machine.js';
import { EMOTION_DEFAULT } from '../emotion/rules.js';

/**
 * 情绪状态路由（「白起的内心」）。
 *
 * - `GET  /character/state` 读六项数值（四维核心 + 爱意/思念）+ 当前心绪 + 小剧场 + 上一次演进记录
 * - `GET  /character/meta`  面板画条用的字段表（顺序：占有欲与醋意 → 紧绷与情欲 → 克制与自控 →
 *   示弱与委屈 → 爱意 → 思念），前端不用再硬编码一份对不上的
 * - `PATCH /character/state` 手动改（面板上的滑杆；只收 0-100 的整数）
 *
 * **主路径的情绪演进不在这里** —— 它在 `/chat/stream` 开流前的前置分析里
 * （见 `emotion/service.ts` 的 `applyPreAnalysis()`）；
 * 兜底的关键词演进挂在消息写入的两处（见 `routes/messages.ts` 的 `maybeEvolve()`）。
 */
export async function characterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/character/state', async () => getState());

  app.get('/character/meta', async () => ({
    fields: PANEL_FIELDS.map((f) => ({ key: f.key, label: f.label, default: f.default })),
    defaultMood: EMOTION_DEFAULT.currentMood,
  }));

  app.patch('/character/state', async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return patchState(body);
  });
}

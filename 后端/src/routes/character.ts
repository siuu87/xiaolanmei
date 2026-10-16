import type { FastifyInstance } from 'fastify';
import { getState, patchState } from '../emotion/service.js';
import { EMOTION_DEFAULT, EMOTION_FIELDS, EMOTION_LABELS } from '../emotion/rules.js';

/**
 * 情绪状态路由（「白起的内心」）。
 *
 * - `GET  /character/state` 读四项数值 + 当前心情 + 上一次演进的可解释记录
 * - `GET  /character/meta`  四项的中文名与默认值（面板画条用，免得前端硬编码一份对不上）
 * - `PATCH /character/state` 手动改（面板上的滑杆；只收 0-100 的整数）
 *
 * **自动演进不在这里** —— 它挂在消息写入的两处（见 `routes/messages.ts` 的
 * `maybeEvolve()`），因为「一轮结束」这件事只有那边知道。
 */
export async function characterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/character/state', async () => getState());

  app.get('/character/meta', async () => ({
    fields: EMOTION_FIELDS.map((key) => ({
      key,
      label: EMOTION_LABELS[key],
      default: EMOTION_DEFAULT[key],
    })),
    defaultMood: EMOTION_DEFAULT.currentMood,
  }));

  app.patch('/character/state', async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return patchState(body);
  });
}

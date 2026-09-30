import type { FastifyInstance } from 'fastify';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import { getAdapterConfig } from './stations.js';
import { getSettingValue } from './settings.js';

/**
 * 识图（阶段 7 收尾，仿 Operit AI）：主模型（如 DeepSeek）不会看图时，
 * 用一个独立的视觉模型（vision.stationId / vision.model）把图片转成文字描述，
 * 再把文字喂给主模型。
 */

const VISION_PROMPT =
  '请详细描述这张图片的内容，包括画面里的人物、表情、动作、文字、场景，以及它想传达的情绪或含义。用中文回答，简洁但完整，直接说图片内容，不要加多余的开场白。';

/** 识图模型配置（可空，未配置则主模型需自带视觉能力） */
export function getVisionConfig(): { stationId: string | null; model: string | null } {
  return {
    stationId: getSettingValue<string | null>('vision.stationId', null),
    model: getSettingValue<string | null>('vision.model', null),
  };
}

/** POST /api/vision/describe —— 用视觉模型把一张图转成文字描述 */
export async function visionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/vision/describe', async (req, reply) => {
    const body = (req.body ?? {}) as { image?: string; stationId?: string; model?: string };
    const image = body.image?.trim();
    if (!image) {
      reply.code(400).send({ message: 'image 必填' });
      return;
    }

    const cfg = getVisionConfig();
    const stationId = body.stationId?.trim() || cfg.stationId;
    const model = body.model?.trim() || cfg.model;
    if (!model) {
      reply.code(400).send({ message: '未配置识图模型，请到设置里选一个视觉模型' });
      return;
    }

    try {
      const adapter = openaiCompatibleAdapter(getAdapterConfig(stationId));
      const result = await adapter.complete({
        model,
        messages: [{ role: 'user', content: VISION_PROMPT, images: [image] }],
      });
      reply.send({ text: result.content ?? '' });
    } catch (err) {
      reply.code(502).send({ message: `识图失败：${(err as Error).message}` });
    }
  });
}

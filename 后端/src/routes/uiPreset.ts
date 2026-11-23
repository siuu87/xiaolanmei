import type { FastifyInstance } from 'fastify';
import { readUiPreset } from '../services/uiPreset.js';

/** AI 外观预设：前端启动时比对 version，只在 AI 真改过时应用一次。 */
export async function uiPresetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ui/preset', async () => readUiPreset());
}

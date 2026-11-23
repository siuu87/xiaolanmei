import type { FastifyInstance } from 'fastify';
import { getAiGameHtml, listAiGames } from '../services/gameStore.js';

/** AI 小游戏托管：列表 + 带 CSP 的 HTML（前端只把它塞进 sandbox iframe）。 */
export async function gameRoutes(app: FastifyInstance): Promise<void> {
  app.get('/games', async () => ({ games: await listAiGames() }));

  app.get('/games/:id/file', async (req, reply) => {
    const { id } = req.params as { id: string };
    const html = await getAiGameHtml(id);
    if (html === null) {
      reply.code(404).send({ message: '游戏不存在' });
      return;
    }
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('X-Content-Type-Options', 'nosniff');
    // 游戏可以跑脚本和内联样式，但不许联网、不许读父页、不许弹窗/导航。
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
    );
    reply.send(html);
  });
}

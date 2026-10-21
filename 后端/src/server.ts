import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env } from './config/env.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db/client.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { searchRoutes } from './routes/search.js';
import { promptRoutes } from './routes/prompts.js';
import { styleRuleRoutes } from './routes/styleRules.js';
import { memoryRoutes } from './routes/memories.js';
import { summaryRoutes } from './routes/summaries.js';
import { settingsRoutes } from './routes/settings.js';
import { stationsRoutes } from './routes/stations.js';
import { toolRoutes } from './routes/tools.js';
import { mcpRoutes } from './routes/mcp.js';
import { agentRoutes } from './routes/agent.js';
import { syncRoutes } from './routes/sync.js';
import { uploadRoutes } from './routes/upload.js';
import { tokenStatsRoutes } from './routes/tokenStats.js';
import { billingRoutes } from './routes/billing.js';
import { diaryRoutes } from './routes/diaries.js';
import { todoRoutes } from './routes/todos.js';
import { pluginWishlistRoutes } from './routes/pluginWishlist.js';
import { memorialRoutes } from './routes/memorials.js';
import { noteRoutes } from './routes/notes.js';
import { periodRoutes } from './routes/period.js';
import { moodRoutes } from './routes/moods.js';
import { watchlistRoutes } from './routes/watchlist.js';
import { courseRoutes } from './routes/courses.js';
import { timetableConfigRoutes } from './routes/timetableConfig.js';
import { stickerRoutes } from './routes/stickers.js';
import { visionRoutes } from './routes/vision.js';
import { ragRoutes } from './routes/rag.js';
import { skillRoutes } from './routes/skills.js';
import { memoRoutes } from './routes/memo.js';
import { profileRoutes } from './routes/profiles.js';
import { readingRoutes } from './routes/reading.js';
import { radioRoutes } from './routes/radio.js';
import { dishRoutes } from './routes/dishes.js';
import { dietRoutes } from './routes/diet.js';
import { tavernRoutes } from './routes/tavern.js';
import { phoneRoutes } from './routes/phone.js';
import { phoneControlRoutes } from './routes/phoneControl.js';
import { callRoutes } from './routes/calls.js';
import { captionRoutes } from './routes/captions.js';
import { galleryRoutes } from './routes/gallery.js';
import { openSourceRoutes } from './routes/openSource.js';
import { sleepAudioRoutes } from './routes/sleepAudio.js';
import { characterRoutes } from './routes/character.js';
import { thoughtRoutes } from './routes/thoughts.js';
import { obRoutes } from './routes/ob.js';
import { xinchaoRoutes } from './routes/xinchao.js';
import { ombreDashboardRoutes } from './routes/ombreDashboard.js';
import { paivoiceRoutes } from './routes/paivoice.js';
import { deviceRoutes } from './routes/device.js';
import { seedBuiltinSkills } from './services/skillEngine.js';
import { seedPersonaModules } from './persona/seed.js';
import { startMailScheduler } from './services/mailScheduler.js';

async function main(): Promise<void> {
  // 初始化数据库（建表，幂等）
  initDatabase();
  // 幂等初始化内置技能（阶段 11）
  await seedBuiltinSkills();
  // 幂等播种五模块人设（只补缺失，不覆盖面板里的编辑）
  seedPersonaModules();

  const app = Fastify({ logger: true });

  // 开发阶段放开 CORS；后续上 VPS 由 nginx 反代同源后按需收紧
  await app.register(cors, { origin: true });

  // 路由统一挂在 /api 前缀下
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(chatRoutes, { prefix: '/api' });
  await app.register(conversationRoutes, { prefix: '/api' });
  await app.register(messageRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(promptRoutes, { prefix: '/api' });
  await app.register(styleRuleRoutes, { prefix: '/api' });
  await app.register(memoryRoutes, { prefix: '/api' });
  await app.register(summaryRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(stationsRoutes, { prefix: '/api' });
  await app.register(toolRoutes, { prefix: '/api' });
  await app.register(mcpRoutes, { prefix: '/api' });
  await app.register(agentRoutes, { prefix: '/api' });
  await app.register(syncRoutes, { prefix: '/api' });
  await app.register(uploadRoutes, { prefix: '/api' });

  // 深夜来信：AI 不定时抓取（启动后自己跑，失败静默重试）
  startMailScheduler();
  await app.register(tokenStatsRoutes, { prefix: '/api' });
  await app.register(billingRoutes, { prefix: '/api' });
  await app.register(diaryRoutes, { prefix: '/api' });
  await app.register(todoRoutes, { prefix: '/api' });
  await app.register(pluginWishlistRoutes, { prefix: '/api' });
  await app.register(memorialRoutes, { prefix: '/api' });
  await app.register(noteRoutes, { prefix: '/api' });
  await app.register(periodRoutes, { prefix: '/api' });
  await app.register(moodRoutes, { prefix: '/api' });
  await app.register(watchlistRoutes, { prefix: '/api' });
  await app.register(courseRoutes, { prefix: '/api' });
  await app.register(timetableConfigRoutes, { prefix: '/api' });
  await app.register(stickerRoutes, { prefix: '/api' });
  await app.register(visionRoutes, { prefix: '/api' });
  await app.register(ragRoutes, { prefix: '/api' });
  await app.register(skillRoutes, { prefix: '/api' });
  await app.register(memoRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(readingRoutes, { prefix: '/api' });
  await app.register(radioRoutes, { prefix: '/api' });
  await app.register(dishRoutes, { prefix: '/api' });
  await app.register(dietRoutes, { prefix: '/api' });
  await app.register(tavernRoutes, { prefix: '/api' });
  await app.register(phoneRoutes, { prefix: '/api' });
  await app.register(phoneControlRoutes, { prefix: '/api' });
  await app.register(callRoutes, { prefix: '/api' });
  await app.register(captionRoutes, { prefix: '/api' });
  await app.register(galleryRoutes, { prefix: '/api' });
  await app.register(openSourceRoutes, { prefix: '/api' });
  await app.register(sleepAudioRoutes, { prefix: '/api' });
  await app.register(characterRoutes, { prefix: '/api' });
  await app.register(thoughtRoutes, { prefix: '/api' });
  await app.register(obRoutes, { prefix: '/api' });
  await app.register(xinchaoRoutes, { prefix: '/api' });
  await app.register(ombreDashboardRoutes, { prefix: '/api' });
  await app.register(paivoiceRoutes, { prefix: '/api' });
  await app.register(deviceRoutes, { prefix: '/api' });

  /*
   * Host 化（阶段 1）：前端产物就托管在这里，一个进程=完整应用。
   *
   * - 生产：`前端/` 先 `npm run build`，本服务直接把 dist 当静态根目录，
   *   访问 http://localhost:3001/ 就是完整 App，不再需要 Vite dev server 或 nginx。
   * - 开发：dist 不存在（或没 build 过）时静默跳过，dev 仍走 5173 + /api 代理，行为不变。
   * - SPA fallback：任何非 /api 的 GET 都回 index.html，前端路由（/sky、/tavern…）刷新不 404。
   */
  // server.ts 在 后端/src/ 下，退两级才是仓库根；Docker 部署时用 WEB_ROOT 显式指定
  const webRoot =
    process.env.WEB_ROOT ?? fileURLToPath(new URL('../../前端/dist', import.meta.url));
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ message: 'Not Found' });
    });
    console.log(`📦 前端产物已托管: ${webRoot}（单端口 Host 模式）`);
  } else {
    console.log(`ℹ️  未找到前端产物（${webRoot}），仅提供 /api（dev 模式）`);
  }

  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`✅ 小蓝莓后端已启动: http://localhost:${env.port}/api/health`);
  if (existsSync(webRoot)) {
    console.log(`🌐 完整应用入口: http://localhost:${env.port}/`);
  }
}

main().catch((err) => {
  console.error('后端启动失败：', err);
  process.exit(1);
});

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { initDatabase } from './db/client.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { searchRoutes } from './routes/search.js';
import { promptRoutes } from './routes/prompts.js';
import { worldbookRoutes } from './routes/worldbook.js';
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
import { memorialRoutes } from './routes/memorials.js';
import { noteRoutes } from './routes/notes.js';
import { periodRoutes } from './routes/period.js';
import { courseRoutes } from './routes/courses.js';
import { timetableConfigRoutes } from './routes/timetableConfig.js';
import { stickerRoutes } from './routes/stickers.js';
import { visionRoutes } from './routes/vision.js';
import { ragRoutes } from './routes/rag.js';
import { skillRoutes } from './routes/skills.js';
import { memoRoutes } from './routes/memo.js';
import { profileRoutes } from './routes/profiles.js';
import { stateRoutes } from './routes/state.js';
import { archiveRoutes } from './routes/archive.js';
import { seedBuiltinSkills } from './services/skillEngine.js';

async function main(): Promise<void> {
  // 初始化数据库（建表，幂等）
  initDatabase();
  // 幂等初始化内置技能（阶段 11）
  await seedBuiltinSkills();

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
  await app.register(worldbookRoutes, { prefix: '/api' });
  await app.register(memoryRoutes, { prefix: '/api' });
  await app.register(summaryRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(stationsRoutes, { prefix: '/api' });
  await app.register(toolRoutes, { prefix: '/api' });
  await app.register(mcpRoutes, { prefix: '/api' });
  await app.register(agentRoutes, { prefix: '/api' });
  await app.register(syncRoutes, { prefix: '/api' });
  await app.register(uploadRoutes, { prefix: '/api' });
  await app.register(tokenStatsRoutes, { prefix: '/api' });
  await app.register(billingRoutes, { prefix: '/api' });
  await app.register(diaryRoutes, { prefix: '/api' });
  await app.register(todoRoutes, { prefix: '/api' });
  await app.register(memorialRoutes, { prefix: '/api' });
  await app.register(noteRoutes, { prefix: '/api' });
  await app.register(periodRoutes, { prefix: '/api' });
  await app.register(courseRoutes, { prefix: '/api' });
  await app.register(timetableConfigRoutes, { prefix: '/api' });
  await app.register(stickerRoutes, { prefix: '/api' });
  await app.register(visionRoutes, { prefix: '/api' });
  await app.register(ragRoutes, { prefix: '/api' });
  await app.register(skillRoutes, { prefix: '/api' });
  await app.register(memoRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(stateRoutes, { prefix: '/api' });
  await app.register(archiveRoutes, { prefix: '/api' });

  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`✅ 小蓝莓后端已启动: http://localhost:${env.port}/api/health`);
}

main().catch((err) => {
  console.error('后端启动失败：', err);
  process.exit(1);
});

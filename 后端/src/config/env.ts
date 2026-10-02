import 'dotenv/config';
import path from 'node:path';

/**
 * 环境配置：从 .env 读取，带默认值。
 * API Key 只存在后端，绝不下发到前端。
 */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  databasePath: process.env.DATABASE_PATH ?? './data/blueberry.db',

  // 模型服务（OpenAI 兼容格式），阶段 1 适配层使用
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  defaultModel: process.env.DEFAULT_MODEL ?? 'qwen2.5:7b',

  // 智能编程工作区（阶段 10）：默认后端上一级 = 项目根 d:\小蓝莓
  workspacePath: process.env.WORKSPACE_PATH ?? path.resolve(process.cwd(), '..'),

  // 心潮（xinchao-nian）本地状态服务：状态监视器的上游代理。XINCHAO_TOKEN 填心潮的 SERVICE_TOKEN
  xinchaoBaseUrl: process.env.XINCHAO_API_BASE ?? 'http://127.0.0.1:18110',
  xinchaoToken: process.env.XINCHAO_TOKEN ?? '',
} as const;

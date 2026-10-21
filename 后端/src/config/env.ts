import 'dotenv/config';
import path from 'node:path';

/**
 * 环境配置：从 .env 读取，带默认值。
 * API Key 只存在后端，绝不下发到前端。
 */
const envNum = (raw: string | undefined, fallback: number, min: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
};

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databasePath: process.env.DATABASE_PATH ?? './data/blueberry.db',

  // 模型服务（OpenAI 兼容格式），阶段 1 适配层使用
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'http://localhost:11434/v1',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  defaultModel: process.env.DEFAULT_MODEL ?? 'qwen2.5:7b',

  /**
   * 轻量情绪分析管道（2026-10-19）。
   * - `EMOTION_MODEL`：专门跑情绪分析的小模型；空 = 复用主模型。
   * - `EMOTION_MAX_TOKENS`：默认 100（需求硬要求）。
   * - `EMOTION_TIMEOUT_MS`：小模型超时就回退关键词，绝不拖住主对话。
   * - `EMOTION_ANALYZER=off`：显式关闭，排查 / 省 token 用。
   */
  emotionModel: process.env.EMOTION_MODEL ?? '',
  emotionMaxTokens: envNum(process.env.EMOTION_MAX_TOKENS, 100, 16),
  emotionTimeoutMs: envNum(process.env.EMOTION_TIMEOUT_MS, 5000, 500),
  emotionAnalyzer: (process.env.EMOTION_ANALYZER ?? 'on').toLowerCase() !== 'off',

  /**
   * Ombre Brain（OB）记忆专线（2026-10-19）：阿里云 VPS 上的独立服务。
   * 没有配置就整条链路静默跳过，聊天行为与以前完全一致。
   */
  obBaseUrl: (process.env.OB_BASE_URL ?? '').trim(),
  obApiToken: (process.env.OB_API_TOKEN ?? '').trim(),
  obTimeoutMs: envNum(process.env.OB_TIMEOUT_MS, 3500, 500),

  /**
   * 消息时间戳（2026-10-19）：送模型前给每条消息动态加 `[Tue … CST · +9h 44m]`。
   * `MESSAGE_TIMESTAMPS=off` 关闭，回到原生行为。存档永远不写时间戳。
   */
  messageTimestamps: (process.env.MESSAGE_TIMESTAMPS ?? 'on').toLowerCase() !== 'off',

  /**
   * 心潮·念（2026-10-20）：取代 Ombre Brain 的「此刻 + 记忆 + 驱力」引擎。
   * 地址/令牌留空则整条链路静默跳过，内心面板回退到旧的本地情绪面板。
   */
  xinchaoUrl: (process.env.XINCHAO_URL ?? '').trim().replace(/\/+$/, ''),
  xinchaoToken: (process.env.XINCHAO_TOKEN ?? '').trim(),
  xinchaoTimeoutMs: envNum(process.env.XINCHAO_TIMEOUT_MS, 3000, 500),

  /**
   * Ombre Brain Dashboard（OB 记忆中枢）代理（2026-10-21）。
   * 心潮·念接管了 OB 的「此刻 + 驱力」，但 OB 的**长期记忆桶（buckets）**另有一套
   * 基于密码 cookie 会话的 Dashboard。这里只做反向代理：小蓝莓后端代持会话，
   * 前端永远拿不到 Dashboard 密码。没配置就整条链路静默跳过。
   */
  ombreDashboardUrl: (process.env.OMBRE_DASHBOARD_URL ?? '').trim().replace(/\/+$/, ''),
  ombreDashboardPassword: (process.env.OMBRE_DASHBOARD_PASSWORD ?? '').trim(),
  ombreDashboardTimeoutMs: envNum(process.env.OMBRE_DASHBOARD_TIMEOUT_MS, 4000, 500),

  /** PaiVoice 实时语音层（2026-10-20）：前端 iframe 的 WebSocket 地址 */
  paivoiceWsUrl: (process.env.PAIVOICE_WS_URL ?? 'ws://127.0.0.1:8780').trim(),

  // 智能编程工作区（阶段 10）：默认后端上一级 = 项目根 d:\小蓝莓
  workspacePath: process.env.WORKSPACE_PATH ?? path.resolve(process.cwd(), '..'),
} as const;

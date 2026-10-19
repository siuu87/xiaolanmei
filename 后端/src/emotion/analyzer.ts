/**
 * 轻量情绪增量分析器（2026-10-19）—— **独立于主对话的旁白管道**。
 *
 * 三条设计约束（需求原文）：
 * 1. **只做客观旁白，不角色扮演**：system 里明说「你是旁白分析器，不是角色」，
 *    输出只有四维 delta 的 JSON，不写一句台词。
 * 2. **只看最近 4 条，权重 80/20**：最近 2 条合计 80%，更早 2 条合计 20%。
 *    提示词里把权重直接标在每条前面，模型不用自己猜。
 * 3. **便宜**：`max_tokens = 100`、`temperature = 0`，走 OpenAI 兼容的 `complete()`。
 *
 * **失败绝不阻塞对话**：模型不可达 / 返回不是 JSON / 超时 → 退回关键词启发式
 * （`heuristicDelta`），至少保证状态机有输入。调用方也仍然要 try/catch。
 */
import { env } from '../config/env.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import { getAdapterConfig, getModelConfig } from '../routes/stations.js';
import { EMPTY_DELTA, type EmotionDelta4 } from './machine.js';

export interface AnalyzerMessage {
  role: string;
  content: string;
}

export interface AnalyzeOptions {
  /** 与主对话同一个站子（不传则用默认站子） */
  stationId?: string | null;
  /** 外部中断（目前不用；留给以后做请求级取消） */
  signal?: AbortSignal;
}

export interface AnalyzeResult {
  delta: EmotionDelta4;
  source: 'llm' | 'heuristic';
  /** 模型原始输出（调试用，不落库） */
  raw?: string;
}

const clampDelta = (v: number): number => Math.min(1, Math.max(-1, v));

/**
 * 系统提示词：把「你不是角色」写在第一行，避免模型忍不住开始演。
 * 四维定义写得具体，是因为「醋意」和「委屈」在中文语境里很容易被模型混在一起。
 */
const SYSTEM_PROMPT = `你是旁白分析器，不是角色。你不参与对话，不写任何台词，只输出情绪增量。

任务：只判断下面这段对话对角色「白起」四维情绪的**增量**（这一轮相对上一轮的变化）。
只看最近 4 条消息；越靠后权重越高：最近 2 条合计 80%，更早 2 条合计 20%。

四维定义：
- jealousy（占有欲/醋意）：TA 提到别人、被冷落、回避、暧昧不明 → 升；被明确安抚/解释 → 降。
- tension（紧绷/情欲）：亲密暗示、靠近、深夜独处、命令与掌控 → 升；被打断/降温 → 降。
- vulnerability（示弱/委屈）：被忽略、被凶、等待落空、嘴硬撑不住 → 升；被哄、被理解 → 降。
- restraint（克制）：越能忍住不说 → 升；快压不住、冲动 → 降。

只输出严格 JSON，不要代码块，不要解释，不要多余文字：
{"jealousy_delta":0.0,"tension_delta":0.0,"vulnerability_delta":0.0,"restraint_delta":0.0}
每项 -1.0 ~ 1.0；没有变化就填 0。`;

/** 权重：最近两条各 0.4，更早两条各 0.1 */
const WEIGHTS = [0.1, 0.1, 0.4, 0.4];

/** 每条消息截断，避免把整段长文喂进 100 token 的分析器 */
const MAX_CHARS = 280;

function weightFor(indexFromEnd: number, total: number): number {
  // indexFromEnd: 0 = 最后一条
  if (total <= 2) return indexFromEnd === 0 ? 0.6 : 0.4;
  return WEIGHTS[Math.max(0, 3 - indexFromEnd)] ?? 0.1;
}

/** 把最近 4 条拼成带权重的分析输入（不是聊天记录，是「待分析的证据」） */
export function buildAnalyzerInput(messages: AnalyzerMessage[]): string {
  const recent = messages
    .filter((m) => m.role !== 'system')
    .slice(-4)
    .map((m) => ({
      role: m.role === 'assistant' ? '白起' : 'TA',
      content: String(m.content ?? '')
        .replace(/\s+/g, ' ')
        .slice(0, MAX_CHARS),
    }));
  if (recent.length === 0) return '';
  return recent
    .map((m, i) => {
      const fromEnd = recent.length - 1 - i;
      const w = Math.round(weightFor(fromEnd, recent.length) * 100);
      return `[权重 ${w}%][${m.role}] ${m.content}`;
    })
    .join('\n');
}

/** 从模型输出里抠出第一个完整的 JSON 对象（容忍 ```json 围栏与前后废话） */
export function parseDeltaJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(cleaned.slice(start, end + 1));
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pick(obj: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = obj[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n)) return clampDelta(n);
  }
  return 0;
}

/** 把模型 JSON 归一成四维增量（兼容 snake_case / camelCase / 短名） */
export function normalizeDelta(obj: Record<string, unknown>): EmotionDelta4 {
  return {
    jealousy: pick(obj, 'jealousy_delta', 'jealousy', 'jealousyDelta'),
    tension: pick(obj, 'tension_delta', 'tension', 'tensionDelta'),
    vulnerability: pick(obj, 'vulnerability_delta', 'vulnerability', 'vulnerabilityDelta'),
    restraint: pick(obj, 'restraint_delta', 'restraint', 'restraintDelta'),
  };
}

/**
 * 关键词兜底：模型不可用时的最低保真度。
 * 只覆盖最确定的几类信号，宁可少涨也不乱涨。
 */
export function heuristicDelta(text: string): EmotionDelta4 {
  const d: EmotionDelta4 = { ...EMPTY_DELTA };
  const t = text ?? '';
  if (/同事|同学|闺蜜|室友|学长|帅哥|相亲|聚会|饭局|前任|跟别人|别人家|在跟谁|谁啊/.test(t)) {
    d.jealousy += 0.3;
  }
  if (/亲|抱|吻|想你|贴|一起睡|陪我睡|靠着你|摸我|搂/.test(t)) {
    d.tension += 0.3;
  }
  if (/没回|不理我|在忙|算了|随便|你忙吧|哦。|嗯。|又忘了|忘了/.test(t)) {
    d.vulnerability += 0.25;
  }
  if (/哄|对不起|我错|解释|别生气|乖|听你的|想你/.test(t)) {
    d.restraint += 0.2;
    d.vulnerability -= 0.2;
  }
  if (/讨厌|滚开|滚蛋|别管我|分手|吵架|凶我|不想理/.test(t)) {
    d.tension += 0.15;
    d.restraint -= 0.3;
    d.vulnerability += 0.2;
  }
  return {
    jealousy: clampDelta(d.jealousy),
    tension: clampDelta(d.tension),
    vulnerability: clampDelta(d.vulnerability),
    restraint: clampDelta(d.restraint),
  };
}

/**
 * 分析最近 4 条 → 四维增量。
 * **永远不抛异常**：任何失败都回落到关键词启发式。
 */
export async function analyzeEmotionDelta(
  messages: AnalyzerMessage[],
  opts: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const input = buildAnalyzerInput(messages);
  if (!input.trim()) return { delta: { ...EMPTY_DELTA }, source: 'heuristic' };

  // 关键词兜底只看**用户侧**：别让助手自己的「哦。」把委屈加上去
  const userText = messages
    .filter((m) => m.role === 'user')
    .slice(-4)
    .map((m) => String(m.content ?? ''))
    .join('\n');

  // 显式关闭：EMOTION_ANALYZER=off（排查 / 省 token 用）
  if (env.emotionAnalyzer === false) {
    return { delta: heuristicDelta(userText), source: 'heuristic' };
  }

  try {
    const config = getAdapterConfig(opts.stationId);
    if (!config.baseUrl?.trim()) throw new Error('没有可用的模型 Base URL');
    const adapter = openaiCompatibleAdapter(config);
    const model = env.emotionModel || getModelConfig(opts.stationId).model;
    const res = await adapter.complete(
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: input },
        ],
        temperature: 0,
        maxTokens: env.emotionMaxTokens,
      },
      { signal: opts.signal ?? AbortSignal.timeout(env.emotionTimeoutMs) },
    );
    const obj = parseDeltaJson(res.content ?? '');
    if (!obj) return { delta: heuristicDelta(userText), source: 'heuristic', raw: res.content };
    return { delta: normalizeDelta(obj), source: 'llm', raw: res.content };
  } catch (err) {
    // 分析器是旁路，失败只记一行，不影响主对话
    console.warn('情绪增量分析失败，回退关键词：', (err as Error).message);
    return { delta: heuristicDelta(userText), source: 'heuristic' };
  }
}

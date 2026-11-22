import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, tokenUsage } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage, Usage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig } from './stations.js';

/**
 * 灵感便签路由（阶段 7 收尾）：每日一签的持久化 + AI 生成。
 * - CRUD 存 notes 表；POST /notes/generate 用模型生成一句文案（只返回文本，不落库，
 *   由前端决定用 AI 还是兜底文案，再 POST /notes 落库）。
 */

/**
 * 信封主题枚举（2026-11-13 由 3 套扩到 6 套，用户可以自己换信封颜色）：
 * default 米白 / memorial 玫瑰 / night 深蓝 / kraft 牛皮 / sage 苔绿 / lilac 丁香
 */
export const LETTER_THEMES = [
  'default',
  'memorial',
  'night',
  'kraft',
  'sage',
  'lilac',
] as const;
export type LetterTheme = (typeof LETTER_THEMES)[number];

function isLetterTheme(v: unknown): v is LetterTheme {
  return typeof v === 'string' && (LETTER_THEMES as readonly string[]).includes(v);
}

/** 库里若存了枚举外的脏值，兜底回 default，不让前端拿到非法主题 */
function normalizeTheme(v: unknown): LetterTheme {
  return isLetterTheme(v) ? v : 'default';
}

/**
 * 信封包装的白名单（2026-11-18 晚）：`纸色:封口件:压纹`，如 `sage:sprig:dot`。
 * 前端连点几下就能 PATCH 上来一串东西，脏串直接落库的话，
 * 前端 `parseLook` 每次都得兜底一遍 —— 不如在入口就把格式擦干净。
 * 空串是合法值（= 没挑过，按 letter_theme 兜底）。
 */
const LETTER_CHARMS = ['wax', 'sprig', 'string', 'tape'] as const;
const LETTER_TEXTURES = ['plain', 'line', 'dot'] as const;

function normalizeLook(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '';
  const [t, c, x] = v.split(':');
  if (!isLetterTheme(t)) return '';
  const charm = (LETTER_CHARMS as readonly string[]).includes(c) ? c : 'wax';
  const texture = (LETTER_TEXTURES as readonly string[]).includes(x) ? x : 'plain';
  return `${t}:${charm}:${texture}`;
}

function toDTO(n: typeof notes.$inferSelect) {
  return {
    id: n.id,
    content: n.content,
    letterTheme: normalizeTheme(n.letterTheme),
    letterLook: typeof n.letterLook === 'string' ? n.letterLook : '',
    createdAt: n.createdAt,
  };
}

export async function noteRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notes', async () => {
    return db
      .select()
      .from(notes)
      .all()
      .filter((n) => n.deletedAt == null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toDTO);
  });

  app.post('/notes', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      content?: string;
      createdAt?: number;
      letterTheme?: string;
      letterLook?: string;
    };
    const content = body.content?.trim();
    if (!content) {
      reply.code(400).send({ message: 'content 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = body.createdAt ?? now();
    db.insert(notes)
      .values({
        id,
        content,
        letterTheme: normalizeTheme(body.letterTheme),
        letterLook: normalizeLook(body.letterLook),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.delete('/notes/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(notes).set({ deletedAt: ts, updatedAt: ts }).where(eq(notes.id, id)).run();
    return { ok: true };
  });

  /**
   * 改一封信的包装或正文。
   * - `letterLook`：整套包装（纸色 + 封口件 + 压纹），换色也走这个，免得只改半套；
   * - `letterTheme`：老字段，仍然收 —— 但只改纸色，封口件/压纹保持不动；
   * - `content`：改正文。
   */
  app.patch('/notes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      content?: string;
      letterTheme?: string;
      letterLook?: string;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.content !== undefined) set.content = body.content.trim();
    if (body.letterTheme !== undefined) set.letterTheme = normalizeTheme(body.letterTheme);
    if (body.letterLook !== undefined) {
      const look = normalizeLook(body.letterLook);
      if (!look) {
        reply.code(400).send({ message: 'letterLook 格式应为「纸色:封口件:压纹」' });
        return;
      }
      set.letterLook = look;
      // 纸色以 look 的第一段为准，顺手把老字段对齐，两边永不打结
      set.letterTheme = look.split(':')[0];
    }

    const result = db.update(notes).set(set).where(eq(notes.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '信件不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  // AI 生成一句灵感文案（调用成功与否都不影响前端兜底）
  app.post('/notes/generate', async (req, reply) => {
    const model = getModelConfig().model;
    const adapter = openaiCompatibleAdapter(getAdapterConfig());
    const prompt: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是「小蓝莓」，写给一对情侣的每日一签。请生成一句温柔、简约、有陪伴感的中文文案（20 字以内），只输出这句话本身，不要引号或任何解释。',
      },
      { role: 'user', content: '给我一句今天的灵感便签文案。' },
    ];

    const started = now();
    let content: string;
    let usage: Usage | undefined;
    try {
      const r = await adapter.complete({ model, messages: prompt });
      content = r.content.trim().replace(/^["「『]+|["」』]+$/g, '');
      usage = r.usage;
    } catch (err) {
      reply.code(502).send({ message: (err as Error).message });
      return;
    }

    // 落 token_usage（featureType: note），让花费统计覆盖灵感便签生成
    try {
      db.insert(tokenUsage)
        .values({
          id: newId(),
          timestamp: now(),
          conversationId: null,
          messageId: null,
          featureType: 'note',
          model,
          tokenInput: usage?.input ?? 0,
          tokenOutput: usage?.output ?? 0,
          tokenTotal: (usage?.input ?? 0) + (usage?.output ?? 0),
          latencyMs: now() - started,
          status: 'success',
          createdAt: now(),
          updatedAt: now(),
        })
        .run();
    } catch {
      /* 落库失败不阻断 */
    }

    reply.send({ content });
  });
}

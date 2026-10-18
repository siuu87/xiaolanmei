import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { prompts } from '../db/schema.js';
import { env } from '../config/env.js';
import { newId, now } from '../utils/id.js';
import { PERSONA_ANNIVERSARY_FALLBACK, PERSONA_DEFAULT_VARS } from '../persona/modules.js';
import { seedPersonaModules } from '../persona/seed.js';
import { enabledStyleRules } from './styleRules.js';
import { buildTimeSense } from '../emotion/timeSense.js';
import { chatStyleBlock, normalizeChatStyle, type ChatStyleMode } from '../persona/chatStyle.js';
import { getChatStyleMode } from './settings.js';
import { DIET_GRADING_BLOCK, DIET_VAR_ALLERGIES, DIET_VAR_DISLIKES } from '../diet/profile.js';

/**
 * 恋爱起点，与前端 `features/shell/loveDays.ts` 的 `LOVE_START` 同源。
 * 前端用它渲染抽屉/聊天顶栏的「第 N 天」，后端用同一常量渲染提示词里的
 * `{{anniversary}}` / `{{loveDays}}`——**两处必须同步，改一处要改另一处**。
 */
const ANNIVERSARY = PERSONA_ANNIVERSARY_FALLBACK;

/** 距恋爱起点的整天数（按本地日期算，避免时区把日期算偏一天） */
function loveDaysSince(iso: string, now: Date): number {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86_400_000));
}

interface PromptBody {
  type?: 'global' | 'model';
  model?: string | null;
  name?: string;
  content?: string;
  variables?: Record<string, string> | null;
  enabled?: boolean;
  sortOrder?: number;
}

/**
 * 变量替换：`{{key}}` → 自定义变量 > 内置变量；未知替换为空。
 * 内置：`date` / `time` / `model` / `anniversary` / `loveDays` + 人设兜底 `PERSONA_DEFAULT_VARS`。
 */
function renderVariables(content: string, custom: Record<string, string>, model: string): string {
  const d = new Date();
  const builtin: Record<string, string> = {
    ...PERSONA_DEFAULT_VARS,
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    model,
    anniversary: ANNIVERSARY,
    loveDays: String(loveDaysSince(ANNIVERSARY, d)),
  };
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    if (key in custom) return custom[key];
    if (key in builtin) return builtin[key];
    return '';
  });
}

function parseVariables(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v === 'object' && v !== null ? (v as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/**
 * 组装 system 提示词（阶段 5）：启用的「全局 + 该模型」提示词按 sortOrder 拼接，变量替换。
 * 供 chat/stream 注入与 /prompts/preview 预览共用，保证注入与预览一致。
 *
 * 变量表是**跨模块共享**的：先把所有模块的 variables 合成一张表，再拿去渲染每个模块。
 * 这样 `{{user_nickname}}` 无论写在模块一还是模块四，读到的都是同一个值——
 * 否则同一个槽位在多处声明，改一处不改另一处，提示词就会自相矛盾。
 * 同名 key 后者覆盖前者：所以每个 key 只许在一个模块里声明（见 persona/modules.ts）。
 *
 * **语言风格条目按位置插入**（「他的资料 → 语言风格与输出」里那批）：
 * - `before` → 拼在角色设定正文**之前**
 * - `middle` → 插在角色设定正文**正中**：n 个模块取第 ⌈n/2⌉ 个之后（n=5 时即模块三之后）
 * - `after`  → 拼在角色设定正文**之后**
 * 「中」按模块数对半切而不是按字符对半切，是为了让切点永远落在模块边界上，
 * 不会把某条模块的正文拦腰截断。
 * **说话风格档位**（`chat.styleMode`）排在**所有模块与语言风格条目之后**：
 * 它讲的是「话怎么落地成气泡」，必须压过前面任何关于分行/整段的表述。
 * 预览接口可以传 `?style=improv` 临时覆盖，方便对着两套提示词调文案。
 */
export function buildSystemPrompt(
  model: string,
  ctx?: { lastMessageAt?: number | null; chatStyle?: ChatStyleMode },
): string {
  const rows = db
    .select()
    .from(prompts)
    .all()
    .filter((p) => p.deletedAt == null && p.enabled)
    .filter((p) => p.type === 'global' || (p.type === 'model' && p.model === model))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

  const shared: Record<string, string> = {};
  for (const p of rows) Object.assign(shared, parseVariables(p.variables) ?? {});

  const parts: string[] = [];
  for (const p of rows) {
    parts.push(renderVariables(p.content, shared, model));
  }

  const style = enabledStyleRules();
  const render = (list: string[]) => list.map((c) => renderVariables(c, shared, model));

  // 中点：模块数为 0 时切在 0（中段条目就落在最前），避免 slice 出负数
  const cut = Math.ceil(parts.length / 2);
  // 时间感信号（阶段 5 末尾追加，始终在场）：让 AI 语气随当前时段 / 距上次对话自适应。
  // lastMessageAt 由 chat 路由按会话最后一条消息算出；预览/拿不到时退化为「新对话」。
  const timeSense = buildTimeSense(new Date(), ctx?.lastMessageAt ?? null);
  // 说话风格：读完设置再拼，切档之后下一条消息立刻换口吻（不需要重启/重开会话）
  const styleBlock = chatStyleBlock(ctx?.chatStyle ?? getChatStyleMode());
  // 忌口分级：只有真的配了忌口/过敏源才追加，没配就是零噪音
  const hasDiet = !!(
    shared[DIET_VAR_DISLIKES]?.trim() || shared[DIET_VAR_ALLERGIES]?.trim()
  );
  const blocks = [
    render(style.before),
    parts.slice(0, cut),
    render(style.middle),
    parts.slice(cut),
    render(style.after),
    ...(hasDiet ? [[DIET_GRADING_BLOCK]] : []),
    [styleBlock],
    [timeSense],
  ];
  return blocks
    .filter((b) => b.length)
    .map((b) => b.join('\n\n'))
    .join('\n\n')
    .trim();
}

export async function promptRoutes(app: FastifyInstance): Promise<void> {
  app.get('/prompts', async () => {
    return db
      .select()
      .from(prompts)
      .all()
      .filter((p) => p.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
      .map((p) => ({
        id: p.id,
        type: p.type,
        model: p.model,
        name: p.name,
        content: p.content,
        variables: parseVariables(p.variables),
        enabled: p.enabled,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
      }));
  });

  app.post('/prompts', async (req, reply) => {
    const body = (req.body ?? {}) as PromptBody;
    if (!body.name?.trim() || !body.content?.trim()) {
      reply.code(400).send({ message: 'name 与 content 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(prompts)
      .values({
        id,
        type: body.type ?? 'global',
        model: body.type === 'model' ? (body.model ?? null) : null,
        name: body.name.trim(),
        content: body.content,
        variables: body.variables ? JSON.stringify(body.variables) : null,
        enabled: body.enabled ?? true,
        sortOrder: body.sortOrder ?? 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/prompts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as PromptBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.content !== undefined) set.content = body.content;
    if (body.type !== undefined) set.type = body.type;
    if (body.model !== undefined) set.model = body.model;
    if (body.variables !== undefined) set.variables = body.variables ? JSON.stringify(body.variables) : null;
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(prompts).set(set).where(eq(prompts.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '提示词不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/prompts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(prompts).set({ deletedAt: ts, updatedAt: ts }).where(eq(prompts.id, id)).run();
    return { ok: true };
  });

  app.get('/prompts/preview', async (req) => {
    const { model, style } = (req.query ?? {}) as { model?: string; style?: string };
    const m = model?.trim() || env.defaultModel;
    // `?style=` 只影响这次预览，不落库；不带就用当前设置里的档位
    const chatStyle = style ? normalizeChatStyle(style) : undefined;
    return { model: m, chatStyle: chatStyle ?? getChatStyleMode(), systemPrompt: buildSystemPrompt(m, { chatStyle }) };
  });

  /**
   * 播种五模块人设（幂等）。
   * 不带 force：只补缺失，不覆盖你在面板里的编辑。
   * 带 `{force:true}`：用仓库源码覆盖正文与变量。
   */
  app.post('/prompts/seed', async (req) => {
    const { force } = (req.body ?? {}) as { force?: boolean };
    return seedPersonaModules({ force: force === true });
  });
}

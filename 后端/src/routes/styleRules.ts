import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { styleRules } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 语言风格条目：「他的资料 → 语言风格与输出」里那个可以按 + 增删的列表。
 *
 * 交互：右上角 + 新增、可上下调序、每条带启用开关。
 * 原全局「世界书」已并入这里：世界设定与说话方式都写成条目，
 * 由 `buildSystemPrompt()` 按 `position` **插进五模块拼成的角色设定正文里**。
 */

/**
 * 插入位置（相对「角色设定」这块正文）：
 * - `before` 前：整块角色设定之前
 * - `middle` 中：角色设定**正文中间** —— 插在模块序列的正中（见 prompts.ts 的 insertion）
 * - `after`  后：整块角色设定之后
 */
export const STYLE_POSITIONS = ['before', 'middle', 'after'] as const;
export type StylePosition = (typeof STYLE_POSITIONS)[number];

export function normPosition(v: unknown): StylePosition | null {
  return typeof v === 'string' && (STYLE_POSITIONS as readonly string[]).includes(v)
    ? (v as StylePosition)
    : null;
}

interface StyleRuleBody {
  name?: string;
  content?: string;
  position?: string;
  enabled?: boolean;
  sortOrder?: number;
}

/** 未删除的条目，按 sortOrder 升序（同序按创建时间兜底，与其它面板一致） */
function liveRows() {
  return db
    .select()
    .from(styleRules)
    .all()
    .filter((r) => r.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

/**
 * 取启用中的条目并按位置分成三组，交给 `buildSystemPrompt()` 插进角色设定正文。
 * 组内保持 sortOrder 顺序。
 */
export function enabledStyleRules(): Record<StylePosition, string[]> {
  const out: Record<StylePosition, string[]> = { before: [], middle: [], after: [] };
  for (const r of liveRows()) {
    if (!r.enabled) continue;
    out[normPosition(r.position) ?? 'after'].push(r.content);
  }
  return out;
}

export async function styleRuleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/style-rules', async () =>
    liveRows().map((r) => ({
      id: r.id,
      name: r.name,
      content: r.content,
      position: r.position,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
    })),
  );

  app.post('/style-rules', async (req, reply) => {
    const body = (req.body ?? {}) as StyleRuleBody;
    if (!body.name?.trim() || !body.content?.trim()) {
      reply.code(400).send({ message: 'name 与 content 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(styleRules)
      .values({
        id,
        name: body.name.trim(),
        content: body.content,
        position: normPosition(body.position) ?? 'after',
        enabled: body.enabled ?? true,
        sortOrder: body.sortOrder ?? 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/style-rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as StyleRuleBody;

    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.content !== undefined) set.content = body.content;
    if (body.position !== undefined) {
      const p = normPosition(body.position);
      if (!p) {
        reply.code(400).send({ message: 'position 只能是 before / middle / after' });
        return;
      }
      set.position = p;
    }
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(styleRules).set(set).where(eq(styleRules.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '语言风格条目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/style-rules/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(styleRules).set({ deletedAt: ts, updatedAt: ts }).where(eq(styleRules.id, id)).run();
    return { ok: true };
  });
}

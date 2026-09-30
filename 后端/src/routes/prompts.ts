import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { prompts } from '../db/schema.js';
import { env } from '../config/env.js';
import { newId, now } from '../utils/id.js';

interface PromptBody {
  type?: 'global' | 'model';
  model?: string | null;
  name?: string;
  content?: string;
  variables?: Record<string, string> | null;
  enabled?: boolean;
  sortOrder?: number;
}

/** 变量替换：{{key}} → 自定义变量 > 内置变量；未知替换为空。 */
function renderVariables(content: string, custom: Record<string, string>, model: string): string {
  const d = new Date();
  const builtin: Record<string, string> = {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    model,
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
 */
export function buildSystemPrompt(model: string): string {
  const rows = db
    .select()
    .from(prompts)
    .all()
    .filter((p) => p.deletedAt == null && p.enabled)
    .filter((p) => p.type === 'global' || (p.type === 'model' && p.model === model))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

  const parts: string[] = [];
  for (const p of rows) {
    parts.push(renderVariables(p.content, parseVariables(p.variables) ?? {}, model));
  }
  return parts.join('\n\n').trim();
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
    const { model } = (req.query ?? {}) as { model?: string };
    const m = model?.trim() || env.defaultModel;
    return { model: m, systemPrompt: buildSystemPrompt(m) };
  });
}

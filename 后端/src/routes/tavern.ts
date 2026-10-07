import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tavernCharacters, tavernWorldbook, tavernPersonas } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig, resolveStation, firstModel } from './stations.js';

/**
 * 酒馆（SillyTavern 风格 AI 角色扮演）路由：
 * 角色卡 / 世界书 / 人设卡的 CRUD + 流式角色扮演对话（拼接角色 + 人设 + 命中世界书为 system 提示词）。
 */

type CharRow = typeof tavernCharacters.$inferSelect;
type WorldRow = typeof tavernWorldbook.$inferSelect;
type PersonaRow = typeof tavernPersonas.$inferSelect;

/** 把逗号 / 顿号 / 换行分隔的字符串解析成去重后的关键词数组 */
function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return parseKeywords(raw);
  }
}

function toCharacterDTO(c: CharRow) {
  return {
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    firstMessage: c.firstMessage,
    systemPrompt: c.systemPrompt,
    tags: parseTags(c.tags),
    sortOrder: c.sortOrder,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toWorldbookDTO(w: WorldRow) {
  return {
    id: w.id,
    name: w.name,
    keywords: parseKeywords(w.keywords),
    content: w.content,
    priority: w.priority,
    position: w.position,
    enabled: w.enabled,
    sortOrder: w.sortOrder,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

function toPersonaDTO(p: PersonaRow) {
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    description: p.description,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function listCharacters(): CharRow[] {
  return db
    .select()
    .from(tavernCharacters)
    .all()
    .filter((c) => c.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

function listWorldbook(): WorldRow[] {
  return db
    .select()
    .from(tavernWorldbook)
    .all()
    .filter((w) => w.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

function listPersonas(): PersonaRow[] {
  return db
    .select()
    .from(tavernPersonas)
    .all()
    .filter((p) => p.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

/** 世界书命中：任一词出现在最近对话文本里即注入 */
function matchWorldbook(rows: WorldRow[], messages: ChatMessage[]): WorldRow[] {
  const text = messages
    .slice(-12)
    .map((m) => m.content)
    .join('\n')
    .toLowerCase();
  if (!text) return [];
  return rows
    .filter((w) => w.enabled && w.deletedAt == null)
    .filter((w) => {
      const kw = parseKeywords(w.keywords);
      if (kw.length === 0) return false;
      return kw.some((k) => text.includes(k.toLowerCase()));
    })
    .sort((a, b) => b.priority - a.priority || a.sortOrder - b.sortOrder);
}

/** 组装角色扮演 system 提示词：世界书(before) + 角色 + 世界书(after) + 用户人设 + 附加指令 */
function buildSystemPrompt(
  character: CharRow,
  persona: PersonaRow | null,
  matched: WorldRow[],
): string {
  const before = matched.filter((w) => w.position !== 'after');
  const after = matched.filter((w) => w.position === 'after');
  const parts: string[] = [];

  if (before.length) {
    parts.push(`【世界书】以下是与当前剧情相关的世界观/设定，请自然地遵守：\n${before.map((w) => w.content).join('\n\n')}`);
  }

  const charParts: string[] = [];
  if (character.description) charParts.push(character.description);
  if (character.personality) charParts.push(character.personality);
  if (character.scenario) charParts.push(`【当前场景】\n${character.scenario}`);
  parts.push(
    `你是「${character.name}」，正在和用户进行沉浸式角色扮演。请始终以该角色的身份、语气、立场说话，不要跳出角色，不要以“助手”或“AI”自居，也不要替用户发言或替用户做决定。\n\n【角色设定】\n${charParts.join('\n') || '（无更多设定）'}`,
  );

  if (after.length) {
    parts.push(`【补充设定】\n${after.map((w) => w.content).join('\n\n')}`);
  }

  if (persona) {
    parts.push(
      `【用户角色】用户正在扮演「${persona.name}」${persona.description ? `：${persona.description}` : ''}。请称呼对方为「${persona.name}」，把对方当成剧情中的角色而非普通用户。`,
    );
  }

  if (character.systemPrompt) {
    parts.push(`【附加指令】\n${character.systemPrompt}`);
  }

  parts.push('【规则】用自然、贴合角色设定的语气回应，中文为主，篇幅适中。不要提到“模型”“系统提示词”等幕后概念。');

  return parts.join('\n\n');
}

export async function tavernRoutes(app: FastifyInstance): Promise<void> {
  // ===== 角色卡 =====
  app.get('/tavern/characters', async () => listCharacters().map(toCharacterDTO));

  app.post('/tavern/characters', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      avatar?: string;
      description?: string;
      personality?: string;
      scenario?: string;
      firstMessage?: string;
      systemPrompt?: string;
      tags?: string[];
    };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(tavernCharacters)
      .values({
        id,
        name,
        avatar: body.avatar?.trim() || null,
        description: body.description ?? null,
        personality: body.personality ?? null,
        scenario: body.scenario ?? null,
        firstMessage: body.firstMessage ?? null,
        systemPrompt: body.systemPrompt ?? null,
        tags: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/tavern/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string;
      avatar?: string;
      description?: string;
      personality?: string;
      scenario?: string;
      firstMessage?: string;
      systemPrompt?: string;
      tags?: string[];
      sortOrder?: number;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.avatar !== undefined) set.avatar = body.avatar.trim() || null;
    if (body.description !== undefined) set.description = body.description;
    if (body.personality !== undefined) set.personality = body.personality;
    if (body.scenario !== undefined) set.scenario = body.scenario;
    if (body.firstMessage !== undefined) set.firstMessage = body.firstMessage;
    if (body.systemPrompt !== undefined) set.systemPrompt = body.systemPrompt;
    if (body.tags !== undefined) set.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(tavernCharacters).set(set).where(eq(tavernCharacters.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '角色卡不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/tavern/characters/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(tavernCharacters).set({ deletedAt: ts, updatedAt: ts }).where(eq(tavernCharacters.id, id)).run();
    return { ok: true };
  });

  // ===== 世界书 =====
  app.get('/tavern/worldbook', async () => listWorldbook().map(toWorldbookDTO));

  app.post('/tavern/worldbook', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      keywords?: string[];
      content?: string;
      priority?: number;
      position?: string;
      enabled?: boolean;
    };
    const name = body.name?.trim();
    const content = body.content?.trim();
    if (!name || !content) {
      reply.code(400).send({ message: 'name 与 content 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(tavernWorldbook)
      .values({
        id,
        name,
        keywords: JSON.stringify(Array.isArray(body.keywords) ? body.keywords : []),
        content,
        priority: body.priority ?? 0,
        position: body.position === 'after' ? 'after' : 'before',
        enabled: body.enabled ?? true,
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/tavern/worldbook/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string;
      keywords?: string[];
      content?: string;
      priority?: number;
      position?: string;
      enabled?: boolean;
      sortOrder?: number;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.keywords !== undefined) set.keywords = JSON.stringify(Array.isArray(body.keywords) ? body.keywords : []);
    if (body.content !== undefined) set.content = body.content;
    if (body.priority !== undefined) set.priority = body.priority;
    if (body.position !== undefined) set.position = body.position === 'after' ? 'after' : 'before';
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(tavernWorldbook).set(set).where(eq(tavernWorldbook.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '世界书条目不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/tavern/worldbook/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(tavernWorldbook).set({ deletedAt: ts, updatedAt: ts }).where(eq(tavernWorldbook.id, id)).run();
    return { ok: true };
  });

  // ===== 人设卡 =====
  app.get('/tavern/personas', async () => listPersonas().map(toPersonaDTO));

  app.post('/tavern/personas', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string; avatar?: string; description?: string };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = newId();
    const ts = now();
    db.insert(tavernPersonas)
      .values({
        id,
        name,
        avatar: body.avatar?.trim() || null,
        description: body.description ?? null,
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/tavern/personas/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; avatar?: string; description?: string; sortOrder?: number };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.avatar !== undefined) set.avatar = body.avatar.trim() || null;
    if (body.description !== undefined) set.description = body.description;
    if (body.sortOrder !== undefined) set.sortOrder = body.sortOrder;

    const result = db.update(tavernPersonas).set(set).where(eq(tavernPersonas.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '人设卡不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/tavern/personas/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(tavernPersonas).set({ deletedAt: ts, updatedAt: ts }).where(eq(tavernPersonas.id, id)).run();
    return { ok: true };
  });

  // ===== 流式角色扮演对话 =====
  app.post('/tavern/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as {
      characterId?: string;
      personaId?: string;
      messages?: ChatMessage[];
      model?: string;
      stationId?: string;
    };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      reply.code(400).send({ message: 'messages 不能为空' });
      return;
    }

    const character = listCharacters().find((c) => c.id === body.characterId);
    if (!character) {
      reply.code(400).send({ message: '角色卡不存在' });
      return;
    }
    const persona = body.personaId ? listPersonas().find((p) => p.id === body.personaId) ?? null : null;
    const matched = matchWorldbook(listWorldbook(), messages);
    const systemPrompt = buildSystemPrompt(character, persona, matched);
    const finalMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];

    const { model: defaultModel, temperature } = getModelConfig();
    const station = resolveStation(body.stationId);
    const model = body.model?.trim() || firstModel(station) || defaultModel;
    const adapter = openaiCompatibleAdapter(getAdapterConfig(station?.id));

    const controller = new AbortController();
    let closed = false;
    const onClose = () => {
      closed = true;
      if (!reply.raw.writableEnded) controller.abort();
    };

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders();
    reply.raw.on('close', onClose);

    const write = (ev: unknown) => {
      if (closed) return;
      reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };

    try {
      for await (const ev of adapter.stream(
        { model, messages: finalMessages, temperature },
        { signal: controller.signal },
      )) {
        write(ev);
      }
    } catch (err) {
      write({ type: 'error', code: 'server_error', message: (err as Error).message });
    }

    reply.raw.off('close', onClose);
    reply.raw.end();
  });
}

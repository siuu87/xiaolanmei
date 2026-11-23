import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tavernCharacters, tavernWorldbook, tavernPersonas } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig, resolveStation, firstModel } from './stations.js';
import {
  parseKeywords,
  matchWorldbook,
  buildSystemPrompt,
  type PromptWorldEntry,
  type PromptCharacter,
  type PromptPersona,
} from '../services/tavernPrompt.js';

/**
 * 酒馆（SillyTavern 风格 AI 角色扮演）路由：
 * 角色卡 / 世界书 / 人设卡的 CRUD + 流式角色扮演对话（拼接角色 + 人设 + 命中世界书为 system 提示词）。
 * 提示词组装逻辑在 services/tavernPrompt.ts，与 ST 代理路由共用。
 */

type CharRow = typeof tavernCharacters.$inferSelect;
type WorldRow = typeof tavernWorldbook.$inferSelect;
type PersonaRow = typeof tavernPersonas.$inferSelect;

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

/** 本地世界书行 → 中立结构 */
function toPromptWorldEntry(w: WorldRow): PromptWorldEntry {
  return {
    content: w.content,
    priority: w.priority,
    position: w.position === 'after' ? 'after' : 'before',
    enabled: w.enabled,
    keywords: parseKeywords(w.keywords),
    sortOrder: w.sortOrder,
  };
}

/** 本地角色卡行 → 中立结构 */
function toPromptCharacter(c: CharRow): PromptCharacter {
  return {
    name: c.name,
    description: c.description ?? '',
    personality: c.personality ?? '',
    scenario: c.scenario ?? '',
    systemPrompt: c.systemPrompt ?? '',
  };
}

/** 本地人设卡行 → 中立结构 */
function toPromptPersona(p: PersonaRow): PromptPersona {
  return { name: p.name, description: p.description ?? '' };
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
    const matched = matchWorldbook(listWorldbook().map(toPromptWorldEntry), messages);
    const systemPrompt = buildSystemPrompt(toPromptCharacter(character), persona ? toPromptPersona(persona) : null, matched);
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

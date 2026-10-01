import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { skills } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { matchSkills, seedBuiltinSkills } from '../services/skillEngine.js';

/**
 * Skill 路由（阶段 11）：技能 CRUD、启用开关、匹配测试、内置技能初始化。
 */

const TRIGGER_MODES = ['keyword', 'always', 'manual'] as const;

function toDTO(s: typeof skills.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    instruction: s.instruction,
    triggerKeywords: s.triggerKeywords ? s.triggerKeywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
    triggerMode: s.triggerMode,
    icon: s.icon,
    color: s.color,
    category: s.category,
    enabled: s.enabled,
    priority: s.priority,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get('/skills', async (req) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const onlyEnabled = q.enabled === 'true';
    return db
      .select()
      .from(skills)
      .all()
      .filter((s) => s.deletedAt == null && (!onlyEnabled || s.enabled))
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
      .map(toDTO);
  });

  app.post('/skills', async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      slug?: string;
      description?: string;
      instruction?: string;
      triggerKeywords?: string[];
      triggerMode?: string;
      icon?: string;
      color?: string;
      priority?: number;
    };
    const name = body.name?.trim();
    const instruction = body.instruction?.trim();
    if (!name || !instruction) {
      reply.code(400).send({ message: 'name 与 instruction 必填' });
      return;
    }
    const slug = (body.slug?.trim() || name)
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '') || newId();
    const exists = db
      .select()
      .from(skills)
      .all()
      .some((s) => s.slug === slug && s.deletedAt == null);
    if (exists) {
      reply.code(409).send({ message: 'slug 已存在' });
      return;
    }
    const triggerMode = TRIGGER_MODES.includes(body.triggerMode as never) ? body.triggerMode : 'keyword';
    const id = newId();
    const ts = now();
    db.insert(skills)
      .values({
        id,
        name,
        slug,
        description: body.description?.trim() || '',
        instruction,
        triggerKeywords: Array.isArray(body.triggerKeywords) ? body.triggerKeywords.join(',') : null,
        triggerMode,
        icon: body.icon ?? null,
        color: body.color ?? null,
        category: 'custom',
        enabled: true,
        priority: body.priority ?? 0,
        version: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, slug, createdAt: ts });
  });

  app.patch('/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = String(body.name).trim();
    if (body.description !== undefined) set.description = body.description;
    if (body.instruction !== undefined) set.instruction = String(body.instruction).trim();
    if (body.icon !== undefined) set.icon = body.icon;
    if (body.color !== undefined) set.color = body.color;
    if (body.priority !== undefined) set.priority = Number(body.priority) || 0;
    if (body.triggerMode !== undefined) {
      set.triggerMode = TRIGGER_MODES.includes(body.triggerMode as never) ? body.triggerMode : 'keyword';
    }
    if (body.triggerKeywords !== undefined) {
      set.triggerKeywords = Array.isArray(body.triggerKeywords) ? body.triggerKeywords.join(',') : null;
    }
    const result = db.update(skills).set(set).where(eq(skills.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '技能不存在' });
      return;
    }
    return { ok: true };
  });

  app.post('/skills/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db
      .select()
      .from(skills)
      .all()
      .find((s) => s.id === id && s.deletedAt == null);
    if (!row) {
      reply.code(404).send({ message: '技能不存在' });
      return;
    }
    db.update(skills)
      .set({ enabled: !row.enabled, updatedAt: now() })
      .where(eq(skills.id, id))
      .run();
    return { enabled: !row.enabled };
  });

  app.delete('/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ts = now();
    const result = db.update(skills).set({ deletedAt: ts, updatedAt: ts }).where(eq(skills.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '技能不存在' });
      return;
    }
    return { ok: true };
  });

  app.post('/skills/match', async (req, reply) => {
    const body = (req.body ?? {}) as { query?: string; manual?: string[] };
    const query = body.query?.trim();
    if (!query) {
      reply.code(400).send({ message: 'query 必填' });
      return;
    }
    const manual = Array.isArray(body.manual) ? body.manual.map((m) => String(m)) : undefined;
    return {
      matches: matchSkills(query, manual ? { manual } : undefined).map(({ skill, reason, confidence }) => ({
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        reason,
        confidence,
      })),
    };
  });

  app.post('/skills/seed', async () => {
    await seedBuiltinSkills();
    return { ok: true };
  });
}

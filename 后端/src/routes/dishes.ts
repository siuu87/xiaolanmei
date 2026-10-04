import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { dishes, type Ingredient } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 今天吃什么路由：合并食谱 + 甜品为一张 dishes 表。
 * ingredients/steps/tags 以 JSON 文本存储，读写时序列化/反序列化。
 */

const SWEET_WORDS = [
  '这个配你，刚刚好 🍓',
  '小猫今天要好好吃饭哦 🥣',
  '选好了，不许挑食～',
  '这道菜会替我抱抱你 🤗',
  '尝一口，是我对你的心意 💕',
  '辛苦啦，奖励你吃这个 🍰',
];

const MANGO_KEYWORDS = ['芒果', 'mango', 'Mango', 'MANGO'];

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function dishDTO(d: typeof dishes.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    coverUrl: d.coverUrl ?? undefined,
    description: d.description ?? undefined,
    ingredients: parseJSON<Ingredient[]>(d.ingredients, []),
    steps: parseJSON<string[]>(d.steps, []),
    tags: parseJSON<string[]>(d.tags, []),
    difficulty: d.difficulty,
    healingIndex: d.healingIndex,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function listByType(type?: string) {
  return db
    .select()
    .from(dishes)
    .all()
    .filter((d) => d.deletedAt == null && (!type || d.type === type))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(dishDTO);
}

function containsMango(text: string): boolean {
  return MANGO_KEYWORDS.some((k) => text.includes(k));
}

export async function dishRoutes(app: FastifyInstance): Promise<void> {
  // 静态路径先于 /:id 注册，避免被参数路由捕获
  app.get('/dishes/random', async (req) => {
    const { type } = req.query as { type?: string };
    const all = listByType(type === 'dessert' ? 'dessert' : 'meal');
    const dish = all.length ? all[Math.floor(Math.random() * all.length)] : null;
    const recommendation = SWEET_WORDS[Math.floor(Math.random() * SWEET_WORDS.length)];
    return { dish, recommendation };
  });

  app.get('/dishes/search', async (req) => {
    const { q } = req.query as { q?: string };
    const keyword = (q ?? '').trim().toLowerCase();
    if (!keyword) return [];
    return listByType().filter(
      (d) =>
        d.name.toLowerCase().includes(keyword) ||
        d.description?.toLowerCase().includes(keyword) ||
        d.ingredients.some((i) => i.name.toLowerCase().includes(keyword)),
    );
  });

  app.post('/dishes/check-allergen', async (req) => {
    const body = (req.body ?? {}) as { text?: string };
    const text = body.text ?? '';
    return { hasMango: containsMango(text) };
  });

  app.get('/dishes', async (req) => {
    const { type } = req.query as { type?: string };
    return listByType(type);
  });

  app.get('/dishes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = db.select().from(dishes).all().find((x) => x.id === id && x.deletedAt == null);
    if (!d) {
      reply.code(404).send({ message: '菜品不存在' });
      return;
    }
    return dishDTO(d);
  });

  app.post('/dishes', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      name?: string;
      type?: string;
      coverUrl?: string;
      description?: string;
      ingredients?: Ingredient[];
      steps?: string[];
      tags?: string[];
      difficulty?: number;
      healingIndex?: number;
    };
    const name = body.name?.trim();
    if (!name) {
      reply.code(400).send({ message: 'name 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    const type = body.type === 'dessert' ? 'dessert' : 'meal';
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients.filter((i) => i && typeof i.name === 'string' && i.name.trim())
      : [];
    db.insert(dishes)
      .values({
        id,
        name,
        type,
        coverUrl: body.coverUrl?.trim() || null,
        description: body.description?.trim() || null,
        ingredients: ingredients.length ? JSON.stringify(ingredients) : null,
        steps: Array.isArray(body.steps) && body.steps.length ? JSON.stringify(body.steps) : null,
        tags: Array.isArray(body.tags) && body.tags.length ? JSON.stringify(body.tags) : null,
        difficulty: Math.min(3, Math.max(1, Math.round(body.difficulty ?? 1))),
        healingIndex: Math.min(5, Math.max(1, Math.round(body.healingIndex ?? 3))),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/dishes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Partial<{
      name: string;
      type: string;
      coverUrl: string | null;
      description: string | null;
      ingredients: Ingredient[];
      steps: string[];
      tags: string[];
      difficulty: number;
      healingIndex: number;
    }>;
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.type !== undefined) set.type = body.type === 'dessert' ? 'dessert' : 'meal';
    if (body.coverUrl !== undefined) set.coverUrl = body.coverUrl || null;
    if (body.description !== undefined) set.description = body.description || null;
    if (body.ingredients !== undefined) set.ingredients = JSON.stringify(body.ingredients);
    if (body.steps !== undefined) set.steps = JSON.stringify(body.steps);
    if (body.tags !== undefined) set.tags = JSON.stringify(body.tags);
    if (body.difficulty !== undefined) set.difficulty = Math.min(3, Math.max(1, Math.round(body.difficulty)));
    if (body.healingIndex !== undefined) set.healingIndex = Math.min(5, Math.max(1, Math.round(body.healingIndex)));

    const result = db.update(dishes).set(set).where(eq(dishes.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '菜品不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/dishes/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(dishes).set({ deletedAt: ts, updatedAt: ts }).where(eq(dishes.id, id)).run();
    return { ok: true };
  });
}

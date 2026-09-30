import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { stations } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { env } from '../config/env.js';
import { getSettingValue } from './settings.js';

/**
 * API 站子（供应商）：每个站子 = 名称 + Base URL + Key + 自己的模型列表。
 * Key 只存后端，绝不下发前端（GET /stations 只回 apiKeySet 布尔）。
 * 这里同时放「模型/适配器配置解析」的核心函数，取代 settings.ts 里的单套配置。
 */

type StationRow = typeof stations.$inferSelect;

/** legacy 单套配置的 key（无站子时回退，保持老库/老 .env 可用） */
const LEGACY = {
  baseUrl: 'api.baseUrl',
  apiKey: 'api.apiKey',
  defaultModel: 'model.default',
} as const;

function parseModels(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function listStations(): StationRow[] {
  return db
    .select()
    .from(stations)
    .all()
    .filter((s) => s.deletedAt == null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** 解析要用的站子：按 id → 默认 → 第一个可用 → null */
export function resolveStation(id?: string | null): StationRow | null {
  const all = listStations();
  if (id) {
    const hit = all.find((s) => s.id === id && s.enabled);
    if (hit) return hit;
  }
  return all.find((s) => s.isDefault && s.enabled) ?? all.find((s) => s.enabled) ?? null;
}

/** 某站子的第一个模型名（无站子返回 undefined） */
export function firstModel(st: StationRow | null | undefined): string | undefined {
  return st ? parseModels(st.models)[0] : undefined;
}

/** 适配器配置：站子优先，回退 legacy 单套配置（env 兜底）。 */
export function getAdapterConfig(stationId?: string | null): { baseUrl: string; apiKey: string } {
  const st = resolveStation(stationId);
  if (st) return { baseUrl: st.baseUrl, apiKey: st.apiKey ?? '' };
  return {
    baseUrl: getSettingValue<string>(LEGACY.baseUrl, env.openaiBaseUrl),
    apiKey: getSettingValue<string>(LEGACY.apiKey, env.openaiApiKey),
  };
}

/** 模型运行参数：temperature 仍为全局；默认模型 = 默认站子第一个模型 → legacy → env。 */
export function getModelConfig(): {
  model: string;
  temperature: number | undefined;
} {
  const temperature = getSettingValue<number | null>('model.temperature', null);
  const st = resolveStation();
  const model = st?.models ? parseModels(st.models)[0] : undefined;
  return {
    model: model || getSettingValue<string>(LEGACY.defaultModel, env.defaultModel),
    temperature: temperature ?? undefined,
  };
}

function toDTO(s: StationRow) {
  return {
    id: s.id,
    name: s.name,
    baseUrl: s.baseUrl,
    apiKeySet: !!s.apiKey,
    models: parseModels(s.models),
    enabled: s.enabled,
    isDefault: s.isDefault,
  };
}

/** 清除其它站子的「默认」标记（置默认时保证唯一） */
function clearDefault(excludeId?: string): void {
  const ts = now();
  for (const s of listStations()) {
    if (s.isDefault && s.id !== excludeId) {
      db.update(stations).set({ isDefault: false, updatedAt: ts }).where(eq(stations.id, s.id)).run();
    }
  }
}

export async function stationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/stations', async () => listStations().map(toDTO));

  app.post('/stations', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: string;
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      models?: string[];
      enabled?: boolean;
      isDefault?: boolean;
    };
    const name = body.name?.trim();
    const baseUrl = body.baseUrl?.trim();
    if (!name || !baseUrl) {
      reply.code(400).send({ message: 'name 和 baseUrl 必填' });
      return;
    }
    const id = body.id?.trim() || newId();
    const ts = now();
    if (body.isDefault) clearDefault();
    db.insert(stations)
      .values({
        id,
        name,
        baseUrl,
        apiKey: body.apiKey?.trim() || null,
        models: JSON.stringify(
          Array.isArray(body.models) ? body.models.map((m) => String(m).trim()).filter(Boolean) : [],
        ),
        enabled: body.enabled ?? true,
        isDefault: body.isDefault ?? false,
        sortOrder: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reply.code(201).send({ id, createdAt: ts });
  });

  app.patch('/stations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      models?: string[];
      enabled?: boolean;
      isDefault?: boolean;
    };
    const set: Record<string, unknown> = { updatedAt: now() };
    if (body.name !== undefined) set.name = body.name.trim();
    if (body.baseUrl !== undefined) set.baseUrl = body.baseUrl.trim();
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) set.apiKey = body.apiKey.trim();
    if (body.models !== undefined) {
      set.models = JSON.stringify(
        Array.isArray(body.models) ? body.models.map((m) => String(m).trim()).filter(Boolean) : [],
      );
    }
    if (body.enabled !== undefined) set.enabled = body.enabled;
    if (body.isDefault !== undefined) set.isDefault = body.isDefault;
    if (body.isDefault === true) clearDefault(id);

    const result = db.update(stations).set(set).where(eq(stations.id, id)).run();
    if (result.changes === 0) {
      reply.code(404).send({ message: '站子不存在' });
      return;
    }
    reply.send({ ok: true });
  });

  app.delete('/stations/:id', async (req) => {
    const { id } = req.params as { id: string };
    const ts = now();
    db.update(stations).set({ deletedAt: ts, updatedAt: ts }).where(eq(stations.id, id)).run();
    return { ok: true };
  });
}

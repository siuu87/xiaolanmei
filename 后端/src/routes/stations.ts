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

/** 模型运行参数：temperature 仍为全局；默认模型 = 指定站子（缺省默认站子）第一个模型 → legacy → env。 */
export function getModelConfig(stationId?: string | null): {
  model: string;
  temperature: number | undefined;
} {
  const temperature = getSettingValue<number | null>('model.temperature', null);
  const st = resolveStation(stationId);
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

/* ----------------------------- 自动拉取模型列表 ----------------------------- */

/**
 * 从站子自己的接口拉模型列表（OpenAI 兼容 GET {baseUrl}/models）。
 *
 * - 候选地址：baseUrl 以 /v1 结尾就只试 `{base}/models`（避免 …/v1/v1/models），
 *   否则依次试 `{base}/models` 和 `{base}/v1/models`（用户常把 /v1 省掉）。
 * - 兼容三种返回：`{data:[{id}]}`（OpenAI 标准）/ 裸数组 / `{models:[…]}`；
 *   条目取 id，退化取 name。
 * - 鉴权：站子的 apiKey（Bearer；同时带 api-key 头， Azure 系也能用）。
 * - 单机应用，站子本来就是用户自己配的可信地址；超时 12s，失败带回每个候选的原因。
 */
function extractModelIds(text: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const pick = (x: unknown): string | null => {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.id === 'string') return o.id;
      if (typeof o.name === 'string') return o.name;
    }
    return null;
  };
  let arr: unknown[] = [];
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) arr = d.data;
    else if (Array.isArray(d.models)) arr = d.models;
    else if (Array.isArray(d.body)) arr = d.body;
  }
  const out: string[] = [];
  for (const x of arr) {
    const id = pick(x);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

async function fetchModelsFromStation(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('baseUrl 要以 http(s):// 开头');
  const candidates = /\/v1$/i.test(base) ? [`${base}/models`] : [`${base}/models`, `${base}/v1/models`];
  const tried: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'blueberry-station-fetch',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'api-key': apiKey } : {}),
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        tried.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      const ids = extractModelIds(await res.text());
      if (ids.length) return ids;
      tried.push(`${url} → 返回里解析不出模型列表`);
    } catch (e) {
      tried.push(`${url} → ${(e as Error).message}`);
    }
  }
  throw new Error(tried.join('；') || '未知错误');
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

  /**
   * 自动拉取模型列表：{ id } 用库里站子的 baseUrl+Key（Key 留空编辑态也能拉），
   * 或直接传 { baseUrl, apiKey }（还没保存的新站子先试拉）。
   * 只返回列表，不落库——前端合并进表单，用户点保存才持久化。
   */
  app.post('/stations/fetch-models', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: string; baseUrl?: string; apiKey?: string };
    let baseUrl = body.baseUrl?.trim();
    let apiKey = body.apiKey?.trim() ?? '';
    if (body.id) {
      const st = listStations().find((s) => s.id === body.id);
      if (!st) {
        reply.code(404).send({ message: '站子不存在' });
        return;
      }
      baseUrl = baseUrl || st.baseUrl;
      apiKey = apiKey || (st.apiKey ?? '');
    }
    if (!baseUrl) {
      reply.code(400).send({ message: 'baseUrl 必填（或传已保存站子的 id）' });
      return;
    }
    try {
      const models = await fetchModelsFromStation(baseUrl, apiKey);
      if (!models.length) {
        reply.code(502).send({ message: '接口通了但没解析出模型列表' });
        return;
      }
      return { models };
    } catch (e) {
      reply.code(502).send({ message: `拉取失败：${(e as Error).message}` });
    }
  });
}

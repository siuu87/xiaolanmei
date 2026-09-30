import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * 设置（阶段 8）：现在只保留全局模型参数（temperature）。
 * 单套 API 配置（apiBaseUrl/apiKey/defaultModel）已迁到 stations.ts 的多站子体系；
 * 这里保留 getSettingValue/setSetting 供各路由复用（stations.ts 的 legacy 回退也会读这里）。
 */
const KEYS = {
  temperature: 'model.temperature',
  visionStationId: 'vision.stationId',
  visionModel: 'vision.model',
} as const;

function getSetting(key: string): string | null {
  const row = db
    .select()
    .from(settings)
    .all()
    .find((s) => s.deletedAt == null && s.key === key);
  return row?.value ?? null;
}

export function getSettingValue<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  const ts = now();
  const raw = JSON.stringify(value);
  const existing = db
    .select()
    .from(settings)
    .all()
    .find((s) => s.deletedAt == null && s.key === key);
  if (existing) {
    db.update(settings).set({ value: raw, updatedAt: ts }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings).values({ id: newId(), key, value: raw, createdAt: ts, updatedAt: ts }).run();
  }
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async () => ({
    temperature: getSettingValue<number>(KEYS.temperature, 0.7),
    visionStationId: getSettingValue<string | null>(KEYS.visionStationId, null),
    visionModel: getSettingValue<string | null>(KEYS.visionModel, null),
  }));

  app.put('/settings', async (req) => {
    const body = (req.body ?? {}) as {
      temperature?: number;
      visionStationId?: string | null;
      visionModel?: string | null;
    };
    if (body.temperature !== undefined) setSetting(KEYS.temperature, body.temperature);
    if (body.visionStationId !== undefined) setSetting(KEYS.visionStationId, body.visionStationId ?? null);
    if (body.visionModel !== undefined) setSetting(KEYS.visionModel, body.visionModel ?? null);
    return { ok: true };
  });
}

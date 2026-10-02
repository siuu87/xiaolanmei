import type { FastifyInstance } from 'fastify';
import { getSettingValue, setSetting } from './settings.js';

/**
 * 私密档案（Play 档案）：专属偏好标签 + 边界（软/硬）+ 安全词。
 * 存 settings 表 key=privateArchive（JSON），昵称/头像仍走 profiles。
 *
 * 安全提示：安全词属高敏感字段，当前本地明文落库；后续可加 libsodium
 * 加密后再落盘，并在前端入口加 PIN 二次验证解锁。
 */

const KEY = 'privateArchive';

export interface BoundaryItem {
  id: string;
  label: string;
  level: 'soft' | 'hard';
  enabled: boolean;
}

export interface SafewordConfig {
  word: string;
  pauseWord: string;
}

export interface PrivateArchive {
  preferences: string[];
  boundaries: BoundaryItem[];
  safeword: SafewordConfig;
}

const DEFAULT_ARCHIVE: PrivateArchive = {
  preferences: [],
  boundaries: [],
  safeword: { word: '', pauseWord: '' },
};

function normBoundary(b: Partial<BoundaryItem>, i: number): BoundaryItem {
  return {
    id: typeof b.id === 'string' && b.id ? b.id : `b${i}`,
    label: typeof b.label === 'string' ? b.label : '',
    level: b.level === 'hard' ? 'hard' : 'soft',
    enabled: b.enabled !== false,
  };
}

export async function archiveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/archive', async () => {
    const stored = getSettingValue<PrivateArchive>(KEY, DEFAULT_ARCHIVE);
    return {
      preferences: stored.preferences ?? DEFAULT_ARCHIVE.preferences,
      boundaries: stored.boundaries ?? DEFAULT_ARCHIVE.boundaries,
      safeword: stored.safeword ?? DEFAULT_ARCHIVE.safeword,
    };
  });

  app.put('/archive', async (req) => {
    const body = (req.body ?? {}) as Partial<PrivateArchive>;
    const stored = getSettingValue<PrivateArchive>(KEY, DEFAULT_ARCHIVE);

    const next: PrivateArchive = {
      preferences: Array.isArray(body.preferences)
        ? body.preferences.map((p) => String(p)).filter(Boolean)
        : stored.preferences,
      boundaries: Array.isArray(body.boundaries)
        ? body.boundaries.map((b, i) => normBoundary(b as Partial<BoundaryItem>, i))
        : stored.boundaries,
      safeword: {
        word: typeof body.safeword?.word === 'string' ? body.safeword.word : stored.safeword.word,
        pauseWord: typeof body.safeword?.pauseWord === 'string' ? body.safeword.pauseWord : stored.safeword.pauseWord,
      },
    };

    setSetting(KEY, next);
    return next;
  });
}

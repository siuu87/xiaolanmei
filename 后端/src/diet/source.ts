import { db } from '../db/client.js';
import { prompts, ragDocuments } from '../db/schema.js';
import { buildDietProfile, type DietProfile, type MemoRow } from './profile.js';

/**
 * 饮食档案的**查库层**：把「人设变量」和「备忘录」捞出来交给纯函数合并。
 * 单独一个文件是为了让 `profile.ts` 保持零依赖（好单测），而路由/菜品检测共用这一份读取。
 */

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 人设变量：所有启用模块的 `variables` 合成一张表
 * （与 `buildSystemPrompt` 的合成规则一致 —— 变量本来就是跨模块共享的）。
 * 同名 key 后者覆盖前者，跟提示词渲染保持同一语义。
 */
function personaVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const rows = db
      .select({
        variables: prompts.variables,
        sortOrder: prompts.sortOrder,
        createdAt: prompts.createdAt,
        enabled: prompts.enabled,
        deletedAt: prompts.deletedAt,
      })
      .from(prompts)
      .all()
      .filter((p) => p.deletedAt == null && p.enabled && p.variables)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    for (const r of rows) Object.assign(vars, parseJSON<Record<string, string>>(r.variables, {}));
  } catch {
    /* prompts 表还没建好 → 档案为空，不填充任何内置食物 */
  }
  return vars;
}

/** 备忘录（未软删）：标题 + 正文 + 标签 */
function memoRows(): MemoRow[] {
  try {
    return db
      .select({
        title: ragDocuments.title,
        content: ragDocuments.content,
        tags: ragDocuments.tags,
        deletedAt: ragDocuments.deletedAt,
      })
      .from(ragDocuments)
      .all()
      .filter((d) => d.deletedAt == null)
      .map((d) => ({
        title: d.title ?? '',
        content: d.content ?? '',
        tags: parseJSON<string[]>(d.tags, []).map((t) => String(t)),
        deletedAt: null,
      }));
  } catch {
    return [];
  }
}

/** 读完整饮食档案（人设 + 备忘录）。查库失败退化为「空档案」，绝不填充内置食物。 */
export function loadDietProfile(): DietProfile {
  return buildDietProfile({ personaVars: personaVariables(), memos: memoRows() });
}

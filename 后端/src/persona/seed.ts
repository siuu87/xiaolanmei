import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { prompts } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { PERSONA_MODULES } from './modules.js';

export interface SeedResult {
  inserted: string[];
  updated: string[];
  skipped: string[];
}

/**
 * 幂等播种五模块人设。
 *
 * - 默认**只补缺失**：同名模块已存在就跳过，绝不覆盖用户在「角色」面板里的编辑。
 * - `force: true` 时用仓库源码覆盖正文与变量（把新版人设推给已经装过的库）。
 *
 * 判重键是模块名（`模块一 · 角色定位与核心认知` 这类），创建后不要改名，
 * 否则会被当成新模块重复插入。
 */
export function seedPersonaModules(opts: { force?: boolean } = {}): SeedResult {
  const existing = db
    .select()
    .from(prompts)
    .all()
    .filter((p) => p.deletedAt == null);
  const inserted: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const ts = now();

  for (const m of PERSONA_MODULES) {
    const hit = existing.find((p) => p.name === m.name);

    if (!hit) {
      db.insert(prompts)
        .values({
          id: newId(),
          type: 'global',
          model: null,
          name: m.name,
          content: m.content,
          variables: JSON.stringify(m.variables),
          enabled: true,
          sortOrder: m.sortOrder,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      inserted.push(m.name);
      continue;
    }

    if (!opts.force) {
      skipped.push(m.name);
      continue;
    }

    db.update(prompts)
      .set({
        content: m.content,
        variables: JSON.stringify(m.variables),
        sortOrder: m.sortOrder,
        updatedAt: ts,
      })
      .where(eq(prompts.id, hit.id))
      .run();
    updated.push(m.name);
  }

  return { inserted, updated, skipped };
}

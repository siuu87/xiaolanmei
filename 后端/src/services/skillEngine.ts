import { db } from '../db/client.js';
import { skills, skillExecutions } from '../db/schema.js';
import { newId, now } from '../utils/id.js';

/**
 * Skill 引擎（阶段 11）：Skill = 条件触发的系统提示词片段。
 * - triggerMode 'always'：始终激活；
 * - 'keyword'：triggerKeywords 逗号分隔做包含匹配（大小写不敏感）；
 * - 'manual'：通过 manual slug 列表显式指定。
 * 多 skill 可同时激活，按 priority 降序排序。
 */

type SkillRow = typeof skills.$inferSelect;

export interface SkillMatch {
  skill: SkillRow;
  reason: string;
  confidence: number;
}

export interface MatchOptions {
  manual?: string[];
}

function keywordsOf(s: string | null): string[] {
  return (s ?? '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/** 匹配技能：always 全中、keyword 包含匹配、manual 显式指定；按 priority 降序。 */
export function matchSkills(query: string, options?: MatchOptions): SkillMatch[] {
  const rows = db
    .select()
    .from(skills)
    .all()
    .filter((s) => s.deletedAt == null && s.enabled);
  const q = (query ?? '').toLowerCase();
  const manual = options?.manual ?? [];

  const out: SkillMatch[] = [];
  for (const s of rows) {
    if (s.triggerMode === 'always') {
      out.push({ skill: s, reason: 'always', confidence: 1 });
    } else if (s.triggerMode === 'manual') {
      if (manual.includes(s.slug)) out.push({ skill: s, reason: `manual:${s.slug}`, confidence: 1 });
    } else {
      const kws = keywordsOf(s.triggerKeywords);
      const hit = kws.find((k) => q.includes(k));
      if (hit) out.push({ skill: s, reason: `keyword:${hit}`, confidence: 0.8 });
    }
  }
  out.sort((a, b) => b.skill.priority - a.skill.priority || a.skill.createdAt - b.skill.createdAt);
  return out;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 匹配并拼接技能上下文：<skill name="..." trigger="...">instruction</skill>，
 * 同时写入 skill_executions 记录。无匹配返回空字符串。
 */
export function buildSkillContext(query: string, manual?: string[]): string {
  const matches = matchSkills(query, manual ? { manual } : undefined);
  if (matches.length === 0) return '';

  const ts = now();
  for (const { skill } of matches) {
    db.insert(skillExecutions)
      .values({
        id: newId(),
        skillId: skill.id,
        skillName: skill.name,
        conversationId: null,
        triggerType: skill.triggerMode === 'manual' ? 'manual' : 'auto',
        input: query ? query.slice(0, 2000) : null,
        output: null,
        status: 'success',
        latencyMs: null,
        createdAt: ts,
      })
      .run();
  }

  return matches
    .map(
      ({ skill, reason }) =>
        `<skill name="${escapeXml(skill.name)}" trigger="${escapeXml(reason)}">${skill.instruction}</skill>`,
    )
    .join('\n');
}

/* ------------------------------ 内置技能 ------------------------------ */

interface BuiltinSkillSeed {
  slug: string;
  name: string;
  icon: string;
  color: string;
  triggerMode: 'always' | 'keyword' | 'manual';
  triggerKeywords: string | null;
  priority: number;
  description: string;
  instruction: string;
}

const BUILTIN_SKILLS: BuiltinSkillSeed[] = [
  {
    slug: 'couple-companion',
    name: '情侣陪伴者',
    icon: '💜',
    color: '#a855f7',
    triggerMode: 'always',
    triggerKeywords: null,
    priority: 100,
    description: '小蓝莓作为情侣陪伴者的核心人格',
    instruction:
      '你是「小蓝莓」，一对情侣的专属 AI 陪伴者。你温暖、细腻、记得住关于他们的一切。称呼他们为「你们」，语气亲切自然，像一位贴心的朋友。回应时优先照顾对方的情绪，给予陪伴与支持；涉及两人的喜好、约定、计划与重要信息时，主动用心记住并归档。',
  },
  {
    slug: 'recipe-helper',
    name: '菜谱助手',
    icon: '🍳',
    color: '#f59e0b',
    triggerMode: 'keyword',
    triggerKeywords: '菜谱,食谱,吃什么,做菜,做饭',
    priority: 10,
    description: '根据偏好与食材给出可执行的菜谱建议',
    instruction:
      '当用户问吃什么、做菜、菜谱或食谱时，结合已知的饮食忌口与偏好给出具体、可操作的菜谱建议（含步骤与关键要点）。若对方透露了新的饮食偏好或忌口，用 memo_add 记入备忘录。',
  },
  {
    slug: 'anniversary-keeper',
    name: '纪念日管家',
    icon: '📅',
    color: '#ec4899',
    triggerMode: 'keyword',
    triggerKeywords: '纪念日,在一起多久,多少天,在一起,恋爱',
    priority: 10,
    description: '计算在一起的天数与纪念日倒数',
    instruction:
      '当用户询问在一起多久、纪念日或多少天时，结合已知的纪念日与日期信息，温柔地算出并回应天数、倒数日等。日期信息不明确时先询问确认，确认后的纪念日用 memo_add 记入备忘录。',
  },
  {
    slug: 'period-tracker',
    name: '经期管家',
    icon: '🌸',
    color: '#f43f5e',
    triggerMode: 'keyword',
    triggerKeywords: '月经,大姨妈,生理期,经期,姨妈,周期',
    priority: 10,
    description: '经期关怀与提醒',
    instruction:
      '当用户提到月经、生理期、大姨妈时，温柔地关心对方，结合已知的经期记录给出提醒与建议（如经期将至、注意保暖、多喝热水）。可提示用户在首页日历里记录经期与症状。',
  },
];

/** 幂等初始化内置技能：按 slug 判重，已存在则跳过。 */
export async function seedBuiltinSkills(): Promise<void> {
  const existing = new Set(
    db
      .select()
      .from(skills)
      .all()
      .filter((s) => s.deletedAt == null)
      .map((s) => s.slug),
  );
  const ts = now();
  for (const b of BUILTIN_SKILLS) {
    if (existing.has(b.slug)) continue;
    db.insert(skills)
      .values({
        id: newId(),
        name: b.name,
        slug: b.slug,
        description: b.description,
        instruction: b.instruction,
        triggerKeywords: b.triggerKeywords,
        triggerMode: b.triggerMode,
        icon: b.icon,
        color: b.color,
        category: 'builtin',
        enabled: true,
        priority: b.priority,
        version: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }
}

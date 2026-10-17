/**
 * 饮食与健康档案（忌口 / 过敏源）的**动态解析**。
 *
 * 硬规则（需求 §1/§3）：**代码里不许出现任何具体食物名**。
 * 所有条目一律从两处动态读取：
 *   1. **Persona（人设）** —— `prompts` 表模块四的两个变量
 *      `diet_dislikes`（忌口）/ `diet_allergies`（过敏源），值是顿号分隔的列表。
 *   2. **Memo（备忘录）** —— `rag_documents`，靠「标记词」判断级别、
 *      再按位置把食物名抠出来（前置型 / 后置型），见 `extractFood`。
 * 没定义就返回空数组 —— **不填充任何内置食物**。
 *
 * 这里全是纯函数（除了 `loadDietProfile` 要查库），便于单测。
 */

export type DietLevel = 'dislike' | 'allergy';

export interface DietProfile {
  /** 忌口（不想吃 / 要避开）→ 前端渲染成暖橙胶囊 */
  dislikes: string[];
  /** 过敏源（硬拦截）→ 前端渲染成红色胶囊 */
  allergies: string[];
}

export interface DietHit {
  name: string;
  level: DietLevel;
}

/** 人设变量名：模块四声明，面板里可改 */
export const DIET_VAR_DISLIKES = 'diet_dislikes';
export const DIET_VAR_ALLERGIES = 'diet_allergies';

/** 单个档案的条目上限，防止人设里误粘长文本把徽章刷爆 */
const MAX_ITEMS = 60;
/** 单条目最长字数（超过基本不是食物名，是整句话） */
const MAX_NAME_LEN = 12;

/* ------------------------------ 文本切分 ------------------------------ */

/**
 * 食物名之间的分隔符（含「和」——「洋葱和蒜」拆成两条，别合成一个怪名字）。
 *
 * 刻意存成**字符列表的字符串**而不是正则字面量：下面 `extractFood` 要拼
 * `[^…]` 取反字符类，从 `/…/.source` 上切会把 `[` `]` `+` 一起切进来，
 * 拼出来的正则会静默变成错的（踩过，表现为「她对花生过敏」只抠出「生」）。
 */
const SEP_CHARS = ',，、;；。.!！?？\\s/|和与及';
const SEPARATORS = new RegExp(`[${SEP_CHARS}]+`);

/**
 * 从「标记词」的一侧抠出食物名。
 * - 前置型（`过敏` / `忌口`）：食物在标记**前面** → 「她对花生过敏」→ 花生
 * - 后置型（`不吃` / `戒` / `避开`）：食物在标记**后面** → 「不吃香菜」→ 香菜
 */
function extractFood(text: string, marker: string, foodAfter: boolean): string | null {
  // 遍历**每一处**标记：一条备忘里可能出现多次（标题 + 正文重复是常态），
  // 只认第一次的话，第一次旁边凑不出食物名就整条丢了。
  let from = 0;
  for (;;) {
    const at = text.indexOf(marker, from);
    if (at < 0) return null;
    from = at + marker.length;
    const raw = foodAfter ? text.slice(from) : text.slice(0, at);

    // 按分隔符切成若干段，取**最贴近标记**的那一段：
    // 后置型取第一段（「不吃香菜 记录…」→ 香菜），前置型取最后一段（「芒果 忌口」→ 芒果）。
    const runs = raw.match(new RegExp(`[^${SEP_CHARS}]+`, 'g'));
    if (!runs || !runs.length) continue;
    const name = cleanName(foodAfter ? runs[0] : runs[runs.length - 1]);
    if (name) return name;
  }
}

/**
 * 清洗成「看起来像食物名」的字符串：去标点空白 → 反复剥掉开头/结尾的停用词。
 * 这里是**停用词表，不是食物词典** —— 换成任何用户、任何食材都照样成立。
 */
const LEAD_STOPWORDS = [
  '严重过敏', '过敏', '忌口', '不吃', '不爱吃', '讨厌吃', '讨厌', '避开', '戒了', '戒',
  '我们', '我', '她', '他', '它', '人家', '对', '对于', '关于',
  '不能吃', '不能', '别吃', '别', '不要', '不想吃', '不想', '要避开', '要',
  '吃', '喝', '碰', '沾', '闻到', '闻', '是', '会', '也', '就', '都', '很', '特别', '超级',
  '有点', '一点', '有点儿', '以后', '以后也', '这个', '那个', '这种', '那种',
  '的', '了', '过', '着', '吧', '啊', '呢', '嘛', '哦', '呀',
  '记一下', '记录', '注意', '小心', '提醒', '还有', '加上', '放了', '放', '加',
  '一', '点', '儿', '和', '与', '及', '或',
];
const TAIL_STOPWORDS = [
  '过敏', '严重过敏', '忌口', '类', '味', '口味', '的东西', '食物', '食材',
  // 语气助词收尾（「戒酒了」→ 酒）。注意**不要收「的」**——「冰的」本身就是条目名。
  '了', '呀', '啊', '哦', '呢', '吧', '嘛', '儿',
];

function stripLead(s: string): string {
  let cur = s;
  let changed = true;
  while (changed && cur) {
    changed = false;
    for (const w of LEAD_STOPWORDS) {
      if (w && cur.startsWith(w) && cur.length > w.length) {
        cur = cur.slice(w.length);
        changed = true;
        break;
      }
    }
  }
  return cur;
}

function stripTail(s: string): string {
  let cur = s;
  let changed = true;
  while (changed && cur) {
    changed = false;
    for (const w of TAIL_STOPWORDS) {
      if (w && cur.endsWith(w) && cur.length > w.length) {
        cur = cur.slice(0, -w.length);
        changed = true;
        break;
      }
    }
  }
  return cur;
}

/** 清洗：去首尾符号/空白 → 剥停用词 → 长度与内容校验 */
export function cleanName(raw: string): string | null {
  let s = raw.trim().replace(/^[\s"'「」『』()（）:：]+|[\s"'「」『』()（）:：]+$/g, '');
  s = stripLead(s);
  s = stripTail(s);
  s = s.trim();
  if (!s || s.length > MAX_NAME_LEN) return null;
  // 纯标点 / 纯数字（如「3」）不算食物名
  if (!/[\u4e00-\u9fa5A-Za-z]/.test(s)) return null;
  return s;
}

/* --------------------------- 人设（Persona）侧 --------------------------- */

/** 把「芒果、花生 冰的」这类自由文本切成条目列表 */
export function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(SEPARATORS)
    .map((s) => cleanName(s))
    .filter((s): s is string => !!s);
}

export function parsePersonaDiet(variables: Record<string, string> | null): DietProfile {
  const v = variables ?? {};
  return {
    dislikes: splitList(v[DIET_VAR_DISLIKES]).slice(0, MAX_ITEMS),
    allergies: splitList(v[DIET_VAR_ALLERGIES]).slice(0, MAX_ITEMS),
  };
}

/* ----------------------------- 备忘录（Memo）侧 ----------------------------- */

/** 前置型标记：食物在标记前 */
const ALLERGY_MARKERS_BEFORE = ['严重过敏', '过敏'];
const DISLIKE_MARKERS_BEFORE = ['忌口'];
/** 后置型标记：食物在标记后 */
const DISLIKE_MARKERS_AFTER = ['不吃', '不爱吃', '讨厌吃', '讨厌', '避开', '戒了', '戒'];

/** 备忘录里显式打的标签（比正文关键词更可信，优先用） */
const TAG_ALLERGY = ['过敏', '严重过敏', 'allergy'];
const TAG_DISLIKE = ['忌口', 'taboo', 'dislike'];

export interface MemoRow {
  title: string;
  content: string;
  tags: string[];
  deletedAt?: number | null;
}

/**
 * 从备忘录里解析忌口 / 过敏。
 * 两条路都走，取并集：
 *   1. **标签**：打了「过敏」/「忌口」标签 → 直接拿标题当食物名（AI 整理时起的标题最干净）
 *   2. **正文关键词**：按标记词的前后位置抠食物名
 */
export function parseMemoDiet(rows: MemoRow[]): DietProfile {
  const dislikes = new Set<string>();
  const allergies = new Set<string>();

  for (const row of rows) {
    if (row.deletedAt != null) continue;
    const tags = (row.tags ?? []).map((t) => String(t).trim().toLowerCase());
    const title = row.title ?? '';
    const content = row.content ?? '';
    const text = `${title} ${content}`;

    // 1) 标签优先
    if (tags.some((t) => TAG_ALLERGY.includes(t))) {
      const n = cleanName(title) ?? cleanName(content);
      if (n) allergies.add(n);
      continue; // 已经定了级别，不再走正文规则，避免同一条被两边都收
    }
    if (tags.some((t) => TAG_DISLIKE.includes(t))) {
      const n = cleanName(title) ?? cleanName(content);
      if (n) dislikes.add(n);
      continue;
    }

    // 2) 正文关键词：过敏先判（命中就不当忌口）
    let hitAllergy = false;
    for (const marker of ALLERGY_MARKERS_BEFORE) {
      const n = extractFood(text, marker, false);
      if (n) {
        allergies.add(n);
        hitAllergy = true;
        break;
      }
    }
    if (hitAllergy) continue;

    for (const marker of DISLIKE_MARKERS_BEFORE) {
      const n = extractFood(text, marker, false);
      if (n) {
        dislikes.add(n);
        break;
      }
    }
    for (const marker of DISLIKE_MARKERS_AFTER) {
      const n = extractFood(text, marker, true);
      if (n) {
        dislikes.add(n);
        break;
      }
    }
  }

  return { dislikes: [...dislikes].slice(0, MAX_ITEMS), allergies: [...allergies].slice(0, MAX_ITEMS) };
}

/* ------------------------------- 合并与命中 ------------------------------- */

/**
 * 合并两处来源：去重、保序（人设在前，备忘录在后）。
 * **过敏优先级高于忌口**：同一个名字两边都有，只留过敏（红胶囊更重）。
 */
export function mergeDietProfiles(list: DietProfile[]): DietProfile {
  const dislikes: string[] = [];
  const allergies: string[] = [];
  const seen = new Set<string>();

  const push = (arr: string[], name: string) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    arr.push(name);
  };

  for (const p of list) for (const n of p.allergies) push(allergies, n);
  for (const p of list) for (const n of p.dislikes) {
    if (allergies.some((a) => a.toLowerCase() === n.toLowerCase())) continue; // 已是过敏，别再当忌口
    push(dislikes, n);
  }
  return { dislikes, allergies };
}

/**
 * 文本命中检测：返回命中的忌口 / 过敏（过敏排前面）。
 * 大小写不敏感，中英文都能命中。
 */
export function matchDietHits(text: string, profile: DietProfile): DietHit[] {
  const lower = (text ?? '').toLowerCase();
  if (!lower.trim()) return [];
  const hits: DietHit[] = [];
  const seen = new Set<string>();

  for (const n of profile.allergies) {
    if (n && lower.includes(n.toLowerCase()) && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      hits.push({ name: n, level: 'allergy' });
    }
  }
  for (const n of profile.dislikes) {
    if (n && lower.includes(n.toLowerCase()) && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      hits.push({ name: n, level: 'dislike' });
    }
  }
  return hits;
}

/* --------------------------------- 查库 --------------------------------- */

/**
 * 合并**人设变量 + 备忘录**两处来源。
 * 查询在路由里做（用 drizzle），这里只负责合并 —— 保持纯函数，好单测。
 */
export function buildDietProfile(input: { personaVars: Record<string, string> | null; memos: MemoRow[] }): DietProfile {
  return mergeDietProfiles([parsePersonaDiet(input.personaVars), parseMemoDiet(input.memos)]);
}

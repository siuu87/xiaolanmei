/**
 * 纪念品码（2026-11-18 二十九改）：礼物盒的 keepsake 类型走「纪念品工坊」
 * （Companion Keepsakes，Elisekaiu · MIT，自托管 public/keepsakes/）。
 *
 * 礼物 meta 存 `{ code }`——一枚纪念品 AI 码，格式（README「给AI伴侣看的说明」§4）：
 *   ai~<recipe>~half=all~<槽位>=编号…~name=<名字>~line_<half>=<话>~why=~wish=~from=~for=
 *   recipe ∈ planet1（小小星球）/ globe1（记忆雪花球）/ talisman1（护身符）
 * 缺的槽位工坊会「交给星星」按种子随机补（fillChance），所以最简码也合法、
 * 且同一枚码永远渲出同一件（种子 = 码哈希）。
 */

/** 三种纪念品（工坊 recipe code） */
export const KEEPSAKE_RECIPES = ['planet1', 'globe1', 'talisman1'] as const;
export type KeepsakeRecipe = (typeof KEEPSAKE_RECIPES)[number];

/** 面板里的三件（随手抽——槽位都交给星星） */
export const KEEPSAKE_PRESETS: { recipe: KeepsakeRecipe; name: string; desc: string }[] = [
  { recipe: 'planet1', name: '一颗小小星球', desc: '不必遵守任何规则的小世界，星星来决定它长什么样' },
  { recipe: 'globe1', name: '一个记忆雪花球', desc: '把某个瞬间装进玻璃里，摇一摇它就再发生一次' },
  { recipe: 'talisman1', name: '一串护身符', desc: '31 颗有含义的珠子，丝绸小袋里折着两句悄悄话' },
];

/** 工坊静态页地址（自托管） */
export const keepsakeSrc = (code: string) => `/keepsakes/index.html?embed=view#${encodeURIComponent(code)}`;

/** 从礼物 meta 里读纪念品码；没有就按礼物 id 稳定造一枚随手抽的 */
export function keepsakeCodeOf(gift: { id: string; meta?: string | null }): string {
  let raw: unknown = null;
  try {
    raw = gift.meta ? JSON.parse(gift.meta) : null;
  } catch {
    raw = null;
  }
  const code = (raw as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^ai~(planet1|globe1|talisman1)~/i.test(code.trim())) {
    return code.trim().replace(/\s+/g, '');
  }
  // 没存 / 存坏了：按 id 挑一种 recipe，随手抽一枚（缺槽位交给星星）
  let h = 0;
  for (let i = 0; i < gift.id.length; i++) h = (h * 31 + gift.id.charCodeAt(i)) >>> 0;
  const recipe = KEEPSAKE_RECIPES[h % KEEPSAKE_RECIPES.length];
  return composeKeepsakeCode(recipe);
}

/**
 * 造一枚「随手抽」纪念品码：只写 half=all，槽位全部交给星星按种子随机补。
 * for / name / from 可选（写进作品的那句话 / 名字 / 署名）。
 */
export function composeKeepsakeCode(
  recipe: KeepsakeRecipe,
  opts: { for?: string; name?: string; from?: string } = {},
): string {
  let code = `ai~${recipe}~half=all`;
  if (opts.for) code += `~for=${sanitize(opts.for)}`;
  if (opts.name) code += `~name=${sanitize(opts.name)}`;
  if (opts.from) code += `~from=${sanitize(opts.from)}`;
  return code;
}

/** 码字段里不能出现 ~ | [ ]（工坊按 ~ 分字段），换成空格 */
const sanitize = (s: string) => s.replace(/[~|[\]]/g, ' ').trim();

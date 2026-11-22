/**
 * 信封主题（`letter_theme`）：同一封信换个主题 = 换一套信封 / 信纸 / 火漆配色。
 * - `default`  米白纸 + 浅褐信封 + 暗红火漆
 * - `memorial` 玫瑰：暖玫瑰金 + 金箔火漆
 * - `night`    深色磨砂星空：深蓝紫纸 + 银蓝火漆
 * - `kraft`    牛皮纸：牛皮信封 + 米黄纸 + 深棕火漆（最像真邮局的那套）
 * - `sage`     苔绿：鼠尾草信封 + 米白纸 + 陶土火漆
 * - `lilac`    丁香：淡紫信封 + 奶白纸 + 紫红火漆
 *
 * 枚举放在**数据层**（而不是 LetterArt）是因为它属于信件实体的一个字段，
 * 后端 `/api/notes` 就返回它；LetterArt 只负责「主题 → 配色」的映射。
 */
export type LetterTheme = 'default' | 'memorial' | 'night' | 'kraft' | 'sage' | 'lilac';

export const LETTER_THEMES: LetterTheme[] = [
  'default',
  'memorial',
  'night',
  'kraft',
  'sage',
  'lilac',
];

/** 换信封时给用户看的名字（色块用 LetterArt 里的 envelope 渐变） */
export const LETTER_THEME_LABEL: Record<LetterTheme, string> = {
  default: '米白',
  memorial: '玫瑰',
  night: '深蓝',
  kraft: '牛皮',
  sage: '苔绿',
  lilac: '丁香',
};

/** 库里/接口若给了枚举外的脏值，一律兜底成 default，不至于渲染出半成品 */
export function normalizeLetterTheme(v: unknown): LetterTheme {
  return typeof v === 'string' && (LETTER_THEMES as string[]).includes(v)
    ? (v as LetterTheme)
    : 'default';
}

/* ---------------------- 信封「包装」look ---------------------- */

/**
 * 一封信的包装（2026-11-18 晚：用户要「每封都有点小惊喜，不一样一点」）
 *
 * 只有纸色的话，六套颜色转一圈就腻了。所以把包装拆成三个正交的维度：
 *
 *   纸色 `theme`    —— 6 套（米白 / 玫瑰 / 深蓝 / 牛皮 / 苔绿 / 丁香）
 *   封口件 `charm`  —— 压在封盖尖端的那一件：火漆 / 干花枝 / 棉线 / 和纸胶带
 *   纸面压纹 `texture` —— plain 光纸 / line 细竖纹 / dot 点阵
 *
 * 6 × 4 × 3 = 72 种。后端 `pickLetterLook` 按「写信的时辰 + 信里写的字 + 当天日期」
 * 挑一组存进 `letter_look` 列 —— 同样的话换个时间收到，信封就不一样。
 *
 * 存库格式是一行字符串 `sage:sprig:dot`：加维度不用改表结构，只加一段解析。
 */
export type LetterCharm = 'wax' | 'sprig' | 'string' | 'tape';
export const LETTER_CHARMS: LetterCharm[] = ['wax', 'sprig', 'string', 'tape'];

/** 纸面压纹：极淡。远看只是「纸好像不是纯色的」，近看才认得出 */
export type LetterTexture = 'plain' | 'line' | 'dot';
export const LETTER_TEXTURES: LetterTexture[] = ['plain', 'line', 'dot'];

export interface LetterLook {
  theme: LetterTheme;
  charm: LetterCharm;
  texture: LetterTexture;
}

/** 老数据 / 没挑过 look 的信：沿用原来的「纸色 + 火漆 + 光纸」 */
export function defaultLook(theme: LetterTheme): LetterLook {
  return { theme, charm: 'wax', texture: 'plain' };
}

/** 存库：`sage:sprig:dot` */
export function encodeLook(l: LetterLook): string {
  return `${l.theme}:${l.charm}:${l.texture}`;
}

/** 跟后端 `hashSeed` 同一套 FNV-1a：只求「同样的输入永远同样的输出」 */
function seedOf(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 读库。任何一段坏了都只降级那一段，不至于整封信画不出来：
 * 纸色坏 → 用传进来的 `themeFallback`；封口件/压纹坏 → 火漆 / 光纸。
 *
 * 第三个数 `seed`（一般传信件的 id）只在一件事上有用：
 * `letterLook` 是空的（2026-11-18 之前写下的老信，那时候还没有这道字段）。
 * 没有它，所有老信都会长成「火漆 + 光纸」一模一样的一摞；给了它，
 * 每封按自己的 id 派生一套固定的包装 —— **不写库、不改历史**，
 * 但下次打开还是这几套，不会每次刷新都换。
 */
export function parseLook(
  raw: unknown,
  themeFallback: LetterTheme,
  seed?: string,
): LetterLook {
  const fallback = normalizeLetterTheme(themeFallback);
  if (typeof raw !== 'string' || !raw.trim()) {
    if (!seed) return defaultLook(fallback);
    const h = seedOf(seed);
    return {
      theme: fallback,
      charm: LETTER_CHARMS[h % LETTER_CHARMS.length],
      texture: h % 5 === 0 ? 'line' : h % 7 === 0 ? 'dot' : 'plain',
    };
  }
  const [t, c, x] = raw.split(':');
  return {
    theme: normalizeLetterTheme(t || fallback),
    charm: (LETTER_CHARMS as string[]).includes(c) ? (c as LetterCharm) : 'wax',
    texture: (LETTER_TEXTURES as string[]).includes(x) ? (x as LetterTexture) : 'plain',
  };
}

/** 一条 AI 灵感便签 */
export interface InspirationNote {
  id: string;
  content: string; // 文案正文
  createdAt: number; // 生成时间戳（ms）
  /** 信封主题；老数据 / 手写补录没有这一列，渲染时按 default 兜底 */
  letterTheme?: LetterTheme;
  /** 信封包装（`sage:sprig:dot`，见 `encodeLook`）；空 = 按 letterTheme 兜底成「火漆 + 光纸」 */
  letterLook?: string;
}

/**
 * 署名：信纸右下角的作者行。
 * 2026-11-11 起信件改成「一封慢慢读懂你的回信」，正文自带落款，
 * 这里不能再写「AI灵感撰写」——又出戏又和落款重复（见 LetterSheetModal）。
 */
export const NOTE_AUTHOR = '小蓝莓';

/**
 * 内置灵感文案库（兜底）：后端 AI 生成失败 / 未配置时，用这些本地文案顶上。
 * 温柔、简约、适合每日一签。
 */
export const INSPIRATION_QUOTES: string[] = [
  '把日子过成喜欢的样子，慢一点也没关系。',
  '今天也别忘了，你已经是很好很好的人了。',
  '温柔是疲惫生活里，最不动声色的浪漫。',
  '不必追光，你本身就是光。',
  '把期待降低，把热爱拉满。',
  '允许一切发生，然后继续往前走。',
  '生活不会辜负，每一个认真生活的你。',
  '你认真生活的样子，比任何风景都好看。',
  '别急，你想要的时间都会给你答案。',
  '被爱是幸运，学会爱自己是底气。',
  '每一个平凡的日子，都藏着小小的甜。',
  '累了就歇一歇，天不会塌，路还很长。',
  '愿你既有软肋，也有铠甲。',
  '慢慢来，比较快。',
  '今天也要认真吃好一顿饭，睡一个好觉。',
  '你值得世间所有的温柔与偏爱。',
  '把平凡的小事，做到让自己满意。',
  '别怕走弯路，弯路也是风景。',
  '眼里有光，心里有爱，脚下有路。',
  '愿你在拥挤的人海里，也记得抱抱自己。',
  '今天的不开心，就留在今天吧。',
  '爱不是寻找完美的人，而是温柔地接纳彼此。',
  '陪伴是最长情的告白。',
  '有你在的每一天，都是好天气。',
  '我们慢慢来，把日子过成诗。',
  '再普通的一天，因为有你而特别。',
  '愿你被这个世界温柔以待，也被我偏爱。',
  '一起变好，就是最好的浪漫。',
  '你笑一下，我的世界就亮了。',
  '未来很长，我们慢慢讲。',
];

/** YYYY-MM-DD（本地时区） */
export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 生成日期展示文案，如「2026年9月27日」 */
export function formatNoteDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

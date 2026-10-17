/**
 * 信封主题（`letter_theme`）：同一封信换个主题 = 换一套信封 / 信纸 / 火漆配色。
 * - `default`  极简素雅：米白纸 + 浅褐信封 + 暗红火漆
 * - `memorial` 纪念日：暖玫瑰金 + 金箔火漆
 * - `night`    深色磨砂星空：深蓝紫纸 + 银蓝火漆
 *
 * 枚举放在**数据层**（而不是 LetterArt）是因为它属于信件实体的一个字段，
 * 后端 `/api/notes` 就返回它；LetterArt 只负责「主题 → 配色」的映射。
 */
export type LetterTheme = 'default' | 'memorial' | 'night';

export const LETTER_THEMES: LetterTheme[] = ['default', 'memorial', 'night'];

/** 库里/接口若给了枚举外的脏值，一律兜底成 default，不至于渲染出半成品 */
export function normalizeLetterTheme(v: unknown): LetterTheme {
  return v === 'memorial' || v === 'night' ? v : 'default';
}

/** 一条 AI 灵感便签 */
export interface InspirationNote {
  id: string;
  content: string; // 文案正文
  createdAt: number; // 生成时间戳（ms）
  /** 信封主题；老数据 / 手写补录没有这一列，渲染时按 default 兜底 */
  letterTheme?: LetterTheme;
}

/** 署名：固定展示在便签右下角 */
export const NOTE_AUTHOR = 'AI灵感撰写';

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

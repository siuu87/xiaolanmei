export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  author: 'me' | 'partner';
  content: string;
  /** 这一页的图片 URL（/api/files/xxx），一页可图文混排；空 = 纯文字页 */
  images?: string[];
  bookId?: string; // 归属日记本；空 = 我的日记（历史数据）
  /** 记录时刻 HH:mm（一条 = 一天里的一个「时刻」） */
  time?: string;
  /**
   * 心情 emoji —— **2026-11-15 起不再用**（改成了贴纸），字段只为老数据留着，不显示也不写。
   */
  mood?: string;
  /** 标签，最多 6 个 */
  tags?: string[];
}

export interface DiaryBook {
  id: string;
  name: string;
  /** 2026-11-16 起只有两种：我的 / TA 的（两个人各写自己的，情侣本取消） */
  kind: 'me' | 'partner';
  cover: string; // 封皮主色（莫兰迪色）
  /** 封皮换成图片时的图 URL；空 = 纯色封皮 */
  coverImage?: string;
  /** 是否上锁（本机仪式感，不是加密） */
  locked: boolean;
  /** 4 位数字密码；空串 = 没设过 */
  lockCode: string;
  sortOrder: number;
}

/** 小纸条：夹在本子某一页上的便条（写不了 TA 的日记时留一张） */
export interface DiarySlip {
  id: string;
  bookId: string;
  /** 夹在哪一页（YYYY-MM-DD） */
  date: string;
  content: string;
  /** 纸条底色（SLIP_PALETTE 里的一支；TA 的走另一个色，见 TA_SLIP_COLOR） */
  color: string;
  /** me = 我夹的 / ta = TA 塞进来的（TA 的只读，样式也不同） */
  author?: 'me' | 'ta';
  createdAt?: number;
}

/** TA 塞进来的纸条默认用的纸色（与后端 TA_SLIP_COLOR 一致） */
export const TA_SLIP_COLOR = '#e6edf1';

/** 日记贴纸（2026-11-15）：贴在某一页上的表情包，像手账贴纸 */
export interface DiarySticker {
  id: string;
  bookId: string;
  /** 贴在哪一页（YYYY-MM-DD） */
  date: string;
  /** 表情包 key：内置贴图的 emoji 字符，或自定义表情包的图片地址（走 resolveSticker 解析） */
  src: string;
  /** 相对纸页的位置（0~1），换屏幕尺寸不会跑位 */
  x: number;
  y: number;
  /** 缩放 0.4 ~ 3 */
  scale: number;
  /** 旋转角度 -180 ~ 180 */
  rot: number;
}

/** 这个本子能不能写日记：TA 的日记只能加小纸条，不能代写 */
export function canWriteDiary(book: Pick<DiaryBook, 'kind'>): boolean {
  return book.kind !== 'partner';
}

/** 密码位数 */
export const LOCK_CODE_LEN = 4;

/**
 * 单页锁（2026-11-15，2026-11-16 改「他开不开由他定」）：
 * 只锁「这一本 · 这一天」。
 *
 * 锁着的页翻开时是一张灰纸 + 一把锁，进去有三条路：
 * 输 4 位密码（本次翻开，锁还在）、**敲敲**（每敲一下 TA 都会收到提醒，
 * 开不开由他定，可能塞张纸条出来）、**撬锁**（猜错几次后硬撬，他会发现）。
 */
export interface DiaryPageLock {
  id: string;
  bookId: string;
  date: string;
  /** 已经敲了几下（只用来算开门概率与保险丝，界面上不显示次数） */
  knocks: number;
  /** 被撬进来的时刻（0 = 没被撬过） */
  sneakedAt?: number;
  /** TA 发现我潜入留字条的时刻（0 = 还没发现） */
  discoveredAt?: number;
  /** 谁打开的：ta / me / 空 */
  openedBy: string;
  openedAt: number;
}

/** 手写感用系统楷体，不引外部字体：断网也稳定 */
export const HAND_FONT = '"Kaiti SC", "STKaiti", KaiTi, "楷体", "FangSong", serif';

/** 手写纸横线背景（与 PAPER_CLASS 的纸色配套） */
export const HAND_RULE_BG =
  'repeating-linear-gradient(180deg, transparent 0 30px, rgba(120,110,95,0.16) 30px 31px)';

/** 日记本类型：我的日记 / TA 的日记（情侣本 2026-11-16 取消 —— 两个人各写自己的） */
export const BOOK_KIND_LABEL: Record<DiaryBook['kind'], string> = {
  me: '我的日记',
  partner: 'TA 的日记',
};

/** 日记本类型 → 默认封皮色（莫兰迪：低饱和、偏灰） */
export const KIND_DEFAULT_COVER: Record<DiaryBook['kind'], string> = {
  me: '#9AA6B2',
  partner: '#C0A9A3',
};

/**
 * 封皮色板（莫兰迪色系，2026-11-13 按「paper 那种本子」换掉原来的高饱和色）：
 * 全是加过灰的布料色，深色模式下也不刺眼。
 */
export const COVER_PALETTE = [
  '#A8AFA3', '#B4A99B', '#9AA6B2', '#C0A9A3',
  '#A79FB0', '#BFAF95', '#8E9B98', '#C7B5AE',
  '#8A8783', '#D3CCC0', '#7F8A8E', '#9C8F8F',
];

/** 小纸条底色：很淡的一层，压在纸上不抢正文 */
export const SLIP_PALETTE = ['#f6efd9', '#f7e4e4', '#e4ecf4', '#e6efe3', '#f3e8f5'];

/** 一张纸条最多几个字 */
export const SLIP_MAX = 160;

/** 按 kind 推断默认归属本：me→我的日记，partner→TA 的日记 */
export function defaultBookFor(kind: DiaryBook['kind'], books: DiaryBook[]): string {
  return books.find((b) => b.kind === kind)?.id ?? '';
}

// 作者展示：我是主题色，对方是暖粉
export const AUTHOR_LABEL: Record<DiaryEntry['author'], string> = {
  me: '我',
  partner: 'TA',
};

export const AUTHOR_CLASS: Record<DiaryEntry['author'], string> = {
  me: 'text-primary',
  partner: 'text-rose-400',
};

/** 与日历的 dayKey（YYYY-M-D）比较用 */
export function diaryDayKey(e: DiaryEntry): string {
  const [y, m, d] = e.date.split('-').map(Number);
  return `${y}-${m}-${d}`;
}

/** 把日历的 dayKey（YYYY-M-D）转回 YYYY-MM-DD */
export function dayKeyToDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * D·LOG 式流水账（2026-11-14）：时刻 / 月份网格
 * ------------------------------------------------------------------ */

/** 现在几点 HH:mm */
export function hmNow(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

/** '09:12' → '上午 9:12'；没有就返回空串 */
export function prettyTime(hm?: string): string {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm)) return '';
  const [h, m] = hm.split(':').map(Number);
  const ap = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : '晚上';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${hh}:${String(m).padStart(2, '0')}`;
}

/** 2026-11-14 → 11月14日 星期六 */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日 星期${wd}`;
}

/** 某个日期所在月的天数 */
export function daysInMonth(y: number, m1: number): number {
  return new Date(y, m1, 0).getDate();
}

/** 年月 → 'YYYY-MM' */
export function ymKey(y: number, m1: number): string {
  return `${y}-${String(m1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → 那天是周几（0=周日） */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 往前/往后挪一天 */
export function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + delta);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** 这天的日记按时刻排序（没填时刻的排最后，同刻按创建先后） */
export function sortByTime(list: DiaryEntry[]): DiaryEntry[] {
  return [...list].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

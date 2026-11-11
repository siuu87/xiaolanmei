import { db } from '../db/client.js';
import {
  messages,
  memories,
  diaries,
  moods,
  pluginWishlist,
  memorials,
} from '../db/schema.js';
import { getSettingValue } from '../routes/settings.js';

/**
 * 深夜来信的「真实素材」收集器（2026-11-11）。
 *
 * 参考用户给的那封冬日回信：它之所以打动人，不是因为辞藻，而是因为
 * **每一句都落在真实发生过的小事上** —— 认识第 135 天、立冬后第二天、
 * 聊一碗好吃的面、聊一场下的暴雨、天一冷又有点画地为牢。
 *
 * 所以写信前先把库里真实存在的东西捞出来喂给模型：聊过的话、记住的事、
 * 写下的日记、标过的心情、还没做完的小事、快到的纪念日、认识的天数、当下的节气。
 * 提示词里会硬性要求「只能用这里出现过的事」，素材不够就写诚实的初识短笺，
 * 不许脑补。这样信是「慢慢读懂你」，而不是一堆漂亮但谁都不信的罐头话。
 *
 * 全篇只读、每块独立 try/catch：任何一张表出问题都不该拖垮写信。
 */

export interface LetterContext {
  /** 拼进提示词的素材文本 */
  text: string;
  /** 真实素材条数；太少时模型改写成「刚认识」的短笺 */
  materialCount: number;
}

/** 压成一行并截断，避免某条超长日记把提示词撑爆 */
function cut(s: string, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** 二十四节气近似日期（够用来写「立冬后第 4 天」这类表达，不做天文精算） */
const SOLAR_TERMS: ReadonlyArray<[number, number, string]> = [
  [1, 5, '小寒'], [1, 20, '大寒'], [2, 4, '立春'], [2, 19, '雨水'],
  [3, 5, '惊蛰'], [3, 20, '春分'], [4, 5, '清明'], [4, 20, '谷雨'],
  [5, 5, '立夏'], [5, 21, '小满'], [6, 6, '芒种'], [6, 21, '夏至'],
  [7, 7, '小暑'], [7, 23, '大暑'], [8, 7, '立秋'], [8, 23, '处暑'],
  [9, 7, '白露'], [9, 23, '秋分'], [10, 8, '寒露'], [10, 23, '霜降'],
  [11, 7, '立冬'], [11, 22, '小雪'], [12, 7, '大雪'], [12, 22, '冬至'],
];

/** 「初冬 · 立冬后第 4 天」这样的时令描述；离节气太远就只留季节 */
function seasonHint(d: Date): string {
  const m = d.getMonth() + 1;
  // 单字季节，好跟「初 / 深」拼成「初冬」「深秋」，别拼出「初冬天」
  const season = m >= 11 || m <= 1 ? '冬' : m <= 4 ? '春' : m <= 7 ? '夏' : '秋';
  const phase = m === 11 || m === 2 || m === 5 || m === 8 ? '初' :
    m === 1 || m === 4 || m === 7 || m === 10 ? '深' : '';
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  let nearest: { name: string; days: number } | null = null;
  for (const year of [d.getFullYear(), d.getFullYear() - 1]) {
    for (const [mm, dd, name] of SOLAR_TERMS) {
      const at = new Date(year, mm - 1, dd);
      const days = Math.round((today.getTime() - at.getTime()) / 86_400_000);
      if (days < 0 || days > 15) continue;
      if (!nearest || days < nearest.days) nearest = { name, days };
    }
  }
  if (!nearest) return `${phase}${season}`;
  const tail = nearest.days === 0 ? `${nearest.name}这天` : `${nearest.name}后第 ${nearest.days} 天`;
  return `${phase}${season} · ${tail}`;
}

/** 深夜 / 清晨 / 午后…，跟前端挑信封主题的时段口径一致 */
function daypart(d: Date): string {
  const h = d.getHours();
  if (h >= 22 || h < 5) return '深夜';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 18) return '午后';
  return '入夜';
}

function prettyDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** 安全查询：任何异常都退化成空数组 */
function safe<T>(fn: () => T[]): T[] {
  try {
    return fn();
  } catch {
    return [];
  }
}

export function buildLetterContext(ts: number): LetterContext {
  const d = new Date(ts);
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const lines: string[] = [];
  let materialCount = 0;

  lines.push(
    `[此刻] ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week} · ${daypart(d)} · ${seasonHint(d)}`,
  );

  // 伴侣备注：AI 也能改（set_partner_remark），后端 settings 是它的单一来源
  const remark = safe(() => [getSettingValue<string | null>('profile.partnerRemark', null)])
    .find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  lines.push(`[我的名字] ${remark?.trim() || '小蓝莓'}`);

  /* ---------------- 聊过的话 ---------------- */
  const talk = safe(() =>
    db
      .select({
        role: messages.role,
        content: messages.content,
        meta: messages.meta,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
        status: messages.status,
      })
      .from(messages)
      .all(),
  )
    .filter((m) => {
      if (m.deletedAt != null || m.status !== 'done') return false;
      if (m.role !== 'user' && m.role !== 'assistant') return false;
      const c = (m.content ?? '').trim();
      if (c.length < 2) return false;
      // 通话卡片（「（语音通话 00:06）」）、模型报错占位都不是「聊过的话」。
      // 真库里这类卡片能连刷几十条，不过滤会把真正的对话全挤出去。
      if ((m.meta ?? '').includes('"call"')) return false;
      if (/^[（(](?:视频通话|语音通话|通话)/.test(c)) return false;
      if (/^[⚠️❗]/.test(c) || c.startsWith('无法连接模型服务')) return false;
      // 测试占位 / 纯 emoji / 纯标点，写进信里只会显得假
      if (/^(测试消息|测试|test|1、)$/i.test(c)) return false;
      if (!/[\u4e00-\u9fa5a-zA-Z]/.test(c)) return false;
      return true;
    })
    .sort((a, b) => a.createdAt - b.createdAt);

  if (talk.length) {
    // 认识天数从最早一条真实对话算起 —— 比写死一个纪念日更诚实
    const first = talk[0].createdAt;
    const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const firstDay = new Date(new Date(first).getFullYear(), new Date(first).getMonth(), new Date(first).getDate()).getTime();
    const days = Math.max(1, Math.round((day0 - firstDay) / 86_400_000) + 1);
    lines.push(`[我们聊了多久] 最早一次是 ${prettyDate(first)}，到今天是第 ${days} 天`);
  }

  const recentTalk = talk.slice(-24);
  if (recentTalk.length) {
    // 只有「像句话」的对话才算素材：一个「嗯」不足以撑起一封回信
    materialCount += recentTalk.filter((m) => (m.content ?? '').trim().length >= 6).length;
    lines.push('', '[最近一起聊过的]（按时间先后，你 = 用户，我 = 小蓝莓）');
    for (const m of recentTalk) {
      lines.push(`${m.role === 'user' ? '你' : '我'}：${cut(m.content, 100)}`);
    }
  }

  /* ---------------- 长期记忆 ---------------- */
  const mem = safe(() =>
    db
      .select({
        content: memories.content,
        category: memories.category,
        importance: memories.importance,
        active: memories.active,
        deletedAt: memories.deletedAt,
      })
      .from(memories)
      .all(),
  )
    .filter((m) => m.deletedAt == null && m.active && (m.content ?? '').trim())
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 12);
  if (mem.length) {
    materialCount += mem.length;
    lines.push('', '[我记得的事]');
    for (const m of mem) lines.push(`- ${cut(m.content, 80)}`);
  }

  /* ---------------- 日记 ---------------- */
  const diary = safe(() =>
    db
      .select({
        content: diaries.content,
        date: diaries.date,
        author: diaries.author,
        createdAt: diaries.createdAt,
        deletedAt: diaries.deletedAt,
      })
      .from(diaries)
      .all(),
  )
    .filter((x) => x.deletedAt == null && (x.content ?? '').trim())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);
  if (diary.length) {
    materialCount += diary.length;
    lines.push('', '[你写下的日记]');
    for (const x of diary) lines.push(`- ${x.date}（${x.author === 'me' ? '你' : '我'}）：${cut(x.content, 160)}`);
  }

  /* ---------------- 心情 ---------------- */
  const mood = safe(() =>
    db.select({ id: moods.id, me: moods.me, createdAt: moods.createdAt, deletedAt: moods.deletedAt }).from(moods).all(),
  )
    .filter((x) => x.deletedAt == null && x.me)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 7);
  if (mood.length) {
    materialCount += mood.length;
    lines.push('', '[你标过的心情]');
    for (const x of mood) lines.push(`- ${x.id}：${x.me}`);
  }

  /* ---------------- 还没做完的小事 ---------------- */
  const wish = safe(() =>
    db
      .select({
        content: pluginWishlist.content,
        isTodo: pluginWishlist.isTodo,
        completed: pluginWishlist.completed,
        createdAt: pluginWishlist.createdAt,
        deletedAt: pluginWishlist.deletedAt,
      })
      .from(pluginWishlist)
      .all(),
  )
    .filter((x) => x.deletedAt == null && !x.completed && (x.content ?? '').trim())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);
  if (wish.length) {
    materialCount += wish.length;
    lines.push('', '[还没做完的小事 / 随口记下的灵感]');
    for (const x of wish) lines.push(`- ${cut(x.content, 50)}`);
  }

  /* ---------------- 纪念日 ---------------- */
  const memDay = safe(() =>
    db
      .select({ title: memorials.title, date: memorials.date, deletedAt: memorials.deletedAt })
      .from(memorials)
      .all(),
  )
    .filter((x) => x.deletedAt == null && (x.title ?? '').trim())
    .slice(0, 4);
  if (memDay.length) {
    lines.push('', '[日历上记着的日子]');
    for (const x of memDay) lines.push(`- ${x.date} ${cut(x.title, 30)}`);
  }

  return { text: lines.join('\n'), materialCount };
}

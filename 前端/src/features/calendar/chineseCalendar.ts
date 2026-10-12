/**
 * 中国日历标注：24 节气 + 农历节日 + 公历节日 + 法定放假。
 * 农历与节气基于 solarlunar（1900–2100），超出范围时返回 undefined。
 */
import solarlunar from 'solarlunar';

export interface DaySpecial {
  /** 展示名称（节气/节日），如「立春」「春节」「中秋」 */
  label: string;
  /** 是否为放假日（绿线） */
  off: boolean;
  /** 标注类型（用于配色）：放假日 / 节气 / 普通节日 */
  kind: 'holiday' | 'term' | 'festival';
}

/** 农历节日（lMonth-lDay → 名称） */
const LUNAR_FESTIVALS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕',
  '7-15': '中元节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
  '12-23': '小年',
};

/** 公历节日（m-d → 名称） */
const SOLAR_FESTIVALS: Record<string, string> = {
  '1-1': '元旦',
  '2-14': '情人节',
  '3-8': '妇女节',
  '3-12': '植树节',
  '4-1': '愚人节',
  '5-1': '劳动节',
  '5-4': '青年节',
  '6-1': '儿童节',
  '7-1': '建党节',
  '8-1': '建军节',
  '9-10': '教师节',
  '10-1': '国庆节',
  '10-31': '万圣节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
};

function lunarOf(y: number, m: number, d: number) {
  try {
    const r = solarlunar.solar2lunar(y, m, d);
    return r === -1 ? null : r;
  } catch {
    return null;
  }
}

/** 某年某月第 n 个 weekday（0=周日）是否为 d 日 */
function isNthWeekday(y: number, m: number, d: number, n: number, weekday: number): boolean {
  const first = new Date(y, m - 1, 1).getDay();
  const firstTarget = ((weekday - first + 7) % 7) + 1; // 当月第一个 weekday 的日期
  return d === firstTarget + (n - 1) * 7;
}

/** 某天的节日/节气标注；无标注返回 undefined */
export function daySpecial(y: number, m: number, d: number): DaySpecial | undefined {
  const key = `${y}-${m}-${d}`;
  const hit = specialCache.get(key);
  if (hit !== undefined) return hit ?? undefined;
  const v = computeDaySpecial(y, m, d);
  // 「休/班」要往前后各看 10 天，一格要算 20 次，不缓存的话翻月会明显卡
  if (specialCache.size > 4000) specialCache.clear();
  specialCache.set(key, v ?? null);
  return v;
}

const specialCache = new Map<string, DaySpecial | null>();

function computeDaySpecial(y: number, m: number, d: number): DaySpecial | undefined {
  const lunar = lunarOf(y, m, d);
  if (!lunar) return undefined;
  const lMonth = lunar.lMonth;
  const lDay = lunar.lDay;
  const termName = lunar.term || '';

  const lunarFest = LUNAR_FESTIVALS[`${lMonth}-${lDay}`];
  const solarFest = SOLAR_FESTIVALS[`${m}-${d}`];

  // 母亲节（5 月第 2 个周日）、父亲节（6 月第 3 个周日）
  const mothersDay = m === 5 && isNthWeekday(y, m, d, 2, 0);
  const fathersDay = m === 6 && isNthWeekday(y, m, d, 3, 0);

  // 除夕：明天是正月初一（腊月廿九/三十）
  let isChuXi = false;
  if (lMonth === 12 && lDay >= 29) {
    const tm = new Date(y, m - 1, d + 1);
    const tl = lunarOf(tm.getFullYear(), tm.getMonth() + 1, tm.getDate());
    isChuXi = !!tl && tl.lMonth === 1 && tl.lDay === 1;
  }

  // 放假判断（法定节假日主要放假区间，含连假）
  const off =
    (m === 1 && d === 1) ||                     // 元旦
    (m === 5 && d >= 1 && d <= 5) ||            // 劳动节
    (m === 10 && d >= 1 && d <= 7) ||           // 国庆节
    termName === '清明' ||                      // 清明节（节气日）
    isChuXi ||                                  // 除夕
    (lMonth === 1 && lDay >= 1 && lDay <= 6) || // 春节（初一~初六）
    (lMonth === 5 && lDay === 5) ||             // 端午
    (lMonth === 8 && lDay === 15);              // 中秋

  // 名称优先级：除夕 > 农历节日 > 公历节日 > 母亲/父亲节 > 节气
  let label = '';
  if (isChuXi) label = '除夕';
  else if (lunarFest) label = lunarFest;
  else if (solarFest) label = solarFest;
  else if (mothersDay) label = '母亲节';
  else if (fathersDay) label = '父亲节';
  else if (termName) label = termName;
  // 无名称但为放假日（连假中的无名日，如国庆 2~7 日）也返回标注：仅画绿线，不写字
  if (!label && !off) return undefined;

  const isTermOnly =
    !isChuXi && !lunarFest && !solarFest && !mothersDay && !fathersDay && !!termName;
  const kind: DaySpecial['kind'] = off ? 'holiday' : isTermOnly ? 'term' : 'festival';

  return { label, off, kind };
}

/* ------------------------------ 休 / 班 角标 ------------------------------ */

/** 手机日历右上角那两个小标记：休息/放假 = 休，调休补班 = 班 */
export type WorkFlag = '休' | '班';

/**
 * 官方公布的调休补班日（周末却要上班），yyyy-mm-dd。
 * 2026 年的部分按国务院办公厅公布的放假安排填；之后年份逐年往这里补。
 */
const OFFICIAL_MAKEUP: string[] = [
  // 2026 春节（2/15–2/22 放假调休）
  '2026-02-14',
  '2026-02-28',
  // 2026 劳动节（5/1–5/5 放假调休）
  '2026-04-26',
  '2026-05-09',
];

/** 官方公布的调休放假日（工作日却放假 / 连假里的普通周末也按官方日历标「休」），yyyy-mm-dd */
const OFFICIAL_OFF: string[] = [
  // 2026 春节连假首日（周日，但属于法定假期区间）
  '2026-02-15',
  // 2026 清明 4/4–4/6 三天（首尾两天单靠节气只标得到 4/5）
  '2026-04-04',
  '2026-04-06',
  // 2026 端午连假的周末两天
  '2026-06-20',
  '2026-06-21',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 判断某天该标「休」还是「班」（对齐中国日历的做法）：
 * - 官方调休表里有 → 直接按表来
 * - 法定放假日（含连休里的日子）→ 休
 * - **普通周末 → 不标**：正常周六日谁都看得出是休息，标了反而吵；
 *   只有法定节假日标「休」、调休补班日标「班」。
 */
export function dayWorkFlag(y: number, m: number, d: number): WorkFlag | null {
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  if (OFFICIAL_MAKEUP.includes(iso)) return '班';
  if (OFFICIAL_OFF.includes(iso)) return '休';

  if (daySpecial(y, m, d)?.off) return '休';

  return null;
}

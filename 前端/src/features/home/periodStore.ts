import { create } from 'zustand';
import { getPeriod, putPeriod } from '@/lib/api/home';
import { newId } from '@/lib/id';

export type MoodKey = 'happy' | 'calm' | 'sad' | 'angry' | 'love';

/** 经期某天记录的痛经程度：0 无 / 1 轻微 / 2 中等 / 3 严重 */
export const CRAMP_LEVELS = ['无', '轻微', '中等', '严重'] as const;

/** 经期某天的症状记录 */
export interface PeriodSymptoms {
  cramps: number; // 痛经程度 0-3
  discomfort: string; // 其他不适
  mood?: MoodKey; // 今日心情（经期）
}

/** 一条经期记录：days 为标记为经期的日期集合（升序，第 1 天 = days[0]） */
export interface PeriodRecord {
  id: string;
  days: string[]; // 升序 ISO 日期，可逐日增删
  symptoms: Record<string, PeriodSymptoms>; // 该经期内每天的症状，key = ISO 日期
}

export interface PeriodSettings {
  periodDays: number; // 经期持续天数（默认）
  cycleDays: number; // 月经周期天数
  regular: boolean; // 规律 / 不规律
}

// ---------- 日期工具 ----------

/** 组装 ISO 日期 YYYY-MM-DD（month 为 1-based） */
export function toISODate(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** 今天的 ISO 日期 YYYY-MM-DD */
export function todayISODate(): string {
  const n = new Date();
  return toISODate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** ISO 日期 + n 天 */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return toISODate(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** b - a 的天数差 */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000,
  );
}

// ---------- 派生 ----------

/** 某 ISO 日期是某条经期记录的第几天（1-based，相对第 1 天）；不在经期内返回 null */
export function periodDayIndexOf(iso: string, records: PeriodRecord[]): number | null {
  for (const r of records) {
    if (r.days.includes(iso)) return diffDays(r.days[0], iso) + 1;
  }
  return null;
}

/** 某 ISO 日期所属的经期记录；不在经期内返回 null */
export function recordFor(iso: string, records: PeriodRecord[]): PeriodRecord | null {
  for (const r of records) {
    if (r.days.includes(iso)) return r;
  }
  return null;
}

/** 相邻记录第 1 天差值的均值；不足 2 条返回 null */
function averageCycle(records: PeriodRecord[]): number | null {
  if (records.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < records.length; i++) {
    gaps.push(diffDays(records[i - 1].days[0], records[i].days[0]));
  }
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

/** 下一次经期预测开始日（ISO）；无记录返回 null */
export function predictNextStart(
  records: PeriodRecord[],
  settings: PeriodSettings,
): string | null {
  if (!records.length) return null;
  const last = records[records.length - 1].days[0];
  const cycle = settings.regular
    ? settings.cycleDays
    : (averageCycle(records) ?? settings.cycleDays);
  return addDays(last, cycle);
}

/** 某 ISO 日期是否落在预测经期内（含首日，不含首日 + periodDays） */
export function isPredictedDay(
  iso: string,
  nextStart: string | null,
  periodDays: number,
): boolean {
  if (!nextStart) return false;
  return iso >= nextStart && iso < addDays(nextStart, periodDays);
}

// ---------- 关怀 ----------

/** 小蓝莓的经期关怀语（默认基于今天，可传指定日期） */
export function careMessage(
  state: { records: PeriodRecord[]; settings: PeriodSettings },
  date: string = todayISODate(),
): string {
  const idx = periodDayIndexOf(date, state.records);
  if (idx !== null) {
    const rec = recordFor(date, state.records)!;
    const sym = rec.symptoms[date];
    const tips: string[] = [];
    if (sym) {
      if (sym.cramps >= 2) tips.push('痛经的话别硬撑，喝点热的、好好休息');
      if (sym.mood === 'sad' || sym.mood === 'angry') tips.push('看起来有点难受，我陪着你');
    }
    if (tips.length) return `经期第 ${idx} 天，${tips.join('，')} 🫐`;
    return `经期第 ${idx} 天，注意保暖、别贪凉～ 🫐`;
  }
  const next = predictNextStart(state.records, state.settings);
  if (next) {
    const d = diffDays(date, next);
    if (d < 0) return `预测经期已经推迟 ${-d} 天了，来了记得告诉我 🫐`;
    if (d === 0) return '预测经期就是这一天，来了吗？ 🫐';
    return `距离预测经期还有 ${d} 天，提前准备好～ 🫐`;
  }
  return '记录一次经期，我就能帮你预测下一次 🫐';
}

// ---------- store ----------

/** date 是否与某条记录的边界相邻（前一天 / 后一天） */
function isAdjacentTo(date: string, rec: PeriodRecord): boolean {
  const first = rec.days[0];
  const last = rec.days[rec.days.length - 1];
  return date === addDays(first, -1) || date === addDays(last, 1);
}

interface PeriodState {
  settings: PeriodSettings;
  records: PeriodRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  setSetting: (patch: Partial<PeriodSettings>) => void;
  confirmStart: (date: string) => void;
  toggleDay: (date: string) => void;
  setSymptom: (date: string, patch: Partial<PeriodSymptoms>) => void;
}

const DEFAULT_SETTINGS: PeriodSettings = { periodDays: 5, cycleDays: 28, regular: true };

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** 经期共享 store：日历（手动）与 AI 聊天（口头）都读写这里；本地乐观更新 + 防抖写穿后端。 */
export const usePeriodStore = create<PeriodState>((set, get) => {
  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const { settings, records } = get();
      void putPeriod({ settings, records }).catch(() => {});
    }, 250);
  };

  return {
    settings: DEFAULT_SETTINGS,
    records: [],
    loaded: false,

    load: async () => {
      try {
        const { settings, records } = await getPeriod();
        set({ settings, records, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    setSetting: (patch) => {
      set((s) => ({ settings: { ...s.settings, ...patch } }));
      persist();
    },

    // 记入某日为经期第 1 天，自动补全默认持续天数（口头「来了」用）
    confirmStart: (date) => {
      set((s) => {
        if (recordFor(date, s.records)) return s;
        const days = Array.from({ length: s.settings.periodDays }, (_, i) => addDays(date, i));
        const records = [
          ...s.records,
          { id: newId(), days, symptoms: {} },
        ].sort((a, b) => (a.days[0] < b.days[0] ? -1 : 1));
        return { records };
      });
      persist();
    },

    // 逐日调整：经期日 → 取消该天及其之后的所有经期日（截断）；相邻 → 延长一天；否则 → 记入第 1 天并自动补全
    toggleDay: (date) => {
      set((s) => {
        const rec = recordFor(date, s.records);
        if (rec) {
          const days = rec.days.filter((d) => d < date);
          if (days.length === 0) {
            return { records: s.records.filter((r) => r.id !== rec.id) };
          }
          return { records: s.records.map((r) => (r.id === rec.id ? { ...r, days } : r)) };
        }
        const adjacent = s.records.find((r) => isAdjacentTo(date, r));
        if (adjacent) {
          return {
            records: s.records.map((r) =>
              r.id === adjacent.id ? { ...r, days: [...r.days, date].sort() } : r,
            ),
          };
        }
        const days = Array.from({ length: s.settings.periodDays }, (_, i) => addDays(date, i));
        return {
          records: [...s.records, { id: newId(), days, symptoms: {} }].sort((a, b) =>
            a.days[0] < b.days[0] ? -1 : 1,
          ),
        };
      });
      persist();
    },

    setSymptom: (date, patch) => {
      set((s) => {
        const rec = recordFor(date, s.records);
        if (!rec) return s;
        const prev = rec.symptoms[date] ?? { cramps: 0, discomfort: '' };
        const nextSym = { ...prev, ...patch };
        const records = s.records.map((r) =>
          r.id === rec.id ? { ...r, symptoms: { ...r.symptoms, [date]: nextSym } } : r,
        );
        return { records };
      });
      persist();
    },
  };
});

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { periodSummary } from '@/lib/cycle';
import { useLocalSwitch } from '@/lib/useLocalSwitch';
import { diaryDayKey, AUTHOR_LABEL } from '@/features/diary/diaryData';
import { useDiaryStore } from '@/features/diary/diaryStore';
import type { CalendarDayDecoration } from '@/features/calendar/CollapsibleCalendar';
import { daySpecial, dayWorkFlag } from '@/features/calendar/chineseCalendar';
import { lunarTextOf } from '@/features/calendar/almanac';
import { AlmanacPage } from '@/features/calendar/AlmanacPage';
import { useMoodStore, moodColor, moodInfo, type MoodKey } from './moodStore';
import {
  usePeriodStore,
  periodDayIndexOf,
  recordFor,
  predictNextStart,
  isPredictedDay,
  careMessage,
  CRAMP_LEVELS,
  todayISODate,
} from './periodStore';
import { useMemorialStore, memorialOnDate } from './memorialStore';

const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 某月的周日历矩阵（周日开头，null = 空位），对齐设计稿月历小组件 */
function monthMatrix(y: number, m: number): (number | null)[][] {
  const lead = new Date(y, m - 1, 1).getDay(); // 0 = 周日
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 详情面板统一行标题样式（对齐设计稿：深色 medium 小字） */
const PANEL_TITLE = 'text-[13px] font-medium text-foreground';

/**
 * 心情在这里**只读**：选心情的入口已经统一收到首页日历上方的 MOOD 卡片。
 * 三种心情（高兴·黄 / 平静·绿 / 难过·蓝）与首页用的是同一份定义、同一份存储。
 *
 * 版式完全对齐设计稿（首页可编辑稿 PDF）：
 * - 默认态 = 左「月份/星期/大字日期」+ 右月历小组件；
 * - 选中态 = 左栏切换成**日期详情面板**（心情/农历/日记/经期/提醒），月历保持右侧。
 */
export function CalendarCard() {
  const navigate = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  const records = usePeriodStore((s) => s.records);
  const settings = usePeriodStore((s) => s.settings);
  const setSymptom = usePeriodStore((s) => s.setSymptom);
  const setSetting = usePeriodStore((s) => s.setSetting);
  const toggleDay = usePeriodStore((s) => s.toggleDay);
  const memorialDays = useMemorialStore((s) => s.days);
  const moodDays = useMoodStore((s) => s.days);
  const loadMood = useMoodStore((s) => s.load);
  // 睡前提醒开关（设置页「提醒与健康」）：开着才在详情面板显示提醒行
  const [bedReminderOn] = useLocalSwitch('blueberry.bedReminder', false);

  useEffect(() => {
    loadMood();
  }, [loadMood]);

  // 选中的日期（yyyy-mm-dd），null = 未选中
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 月历视图月（对齐设计稿 38:279 月历小组件；稿内无换月 UI，视图恒为当月）
  const [view] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1 };
  });
  // 经期设置弹窗（点详情面板里的「设置」）
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  // 点农历那行 → 小米日历风格的黄历详情页
  const [almanacOpen, setAlmanacOpen] = useState(false);

  // 选中日期解析
  const [sy, sm, sd] = selectedDate ? selectedDate.split('-').map(Number) : [0, 0, 0];
  // 非补零 key（与心情/日记查找、?date= 深链的 YYYY-M-D 一致）
  const selectedKey = selectedDate ? `${sy}-${sm}-${sd}` : null;
  const selectedISO = selectedDate; // 补零 ISO（经期用）
  const selectedRec = selectedKey ? (moodDays[selectedKey] ?? {}) : {};
  const selectedIsToday = selectedDate === todayISODate();
  const selectedMeInfo = moodInfo(selectedRec.me);
  const selectedAiInfo = moodInfo(selectedRec.ai);
  // 是否显示心情区：今天或已填过心情；过去没填则不显示
  const showMood = selectedIsToday || !!selectedMeInfo || !!selectedAiInfo;
  // 选中日期的农历月日（拓展页那一行）
  const lunarText = selectedDate ? lunarTextOf(sy, sm, sd) : null;
  // 选中日期当天的日记（无则显示空态，行本身即记日记入口）
  const diaryOfDay = selectedKey
    ? (entries.find((d) => diaryDayKey(d) === selectedKey) ?? null)
    : null;

  // 经期：选中日是否经期日
  const selectedPeriodIdx = selectedISO ? periodDayIndexOf(selectedISO, records) : null;
  const selectedRecord = selectedISO ? recordFor(selectedISO, records) : null;
  const selectedSymptoms = selectedISO ? (selectedRecord?.symptoms[selectedISO] ?? null) : null;

  // 逐日调整经期：取消 / 延长 / 记入（由 store 按相邻关系决定）
  const toggleMark = () => {
    if (selectedISO) toggleDay(selectedISO);
  };

  // 选中日期：再点一次同一天 = 收回详情
  const handleSelectDate = (date: string | null) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  };

  // 左栏日期信息（默认态）：今天
  const infoDate = (() => {
    if (selectedDate) return { y: sy, m: sm, d: sd };
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  })();
  const infoWeekLabel = `星期${'日一二三四五六'[new Date(infoDate.y, infoDate.m - 1, infoDate.d).getDay()]}`;

  // 日历每天的标注：心情圆点 + 纪念日 + 放假日角标 + 节日/节气名称
  const next = predictNextStart(records, settings);
  const periodSummaryText = periodSummary(records, settings);
  const dayDecoration = (iso: string): CalendarDayDecoration | undefined => {
    const [y, m, d] = iso.split('-').map(Number);
    const key = `${y}-${m}-${d}`;
    const rec = moodDays[key];
    // 日历格上的心情颜色点：我 在前，AI 在后
    const moodColors = [moodColor(rec?.me), moodColor(rec?.ai)].filter((c): c is string => !!c);
    const memorial = !!memorialOnDate(memorialDays, y, m, d);
    const sp = daySpecial(y, m, d);
    const workFlag = dayWorkFlag(y, m, d) ?? undefined;
    const periodIdx = periodDayIndexOf(iso, records);
    const period =
      periodIdx !== null
        ? ('solid' as const)
        : isPredictedDay(iso, next, settings.periodDays)
          ? ('predicted' as const)
          : undefined;
    if (!moodColors.length && !period && !memorial && !workFlag && !sp?.label) return undefined;
    return {
      moodColors,
      period,
      memorial,
      workFlag,
      label: sp?.label,
      labelKind: sp?.kind,
    };
  };

  // 最近一次经期的开始日（设置弹窗只读展示）
  const lastRecord = records.length > 0 ? records[records.length - 1] : null;
  const lastStart = lastRecord?.days[0] ?? null;
  const lastStartLabel = lastStart
    ? `${Number(lastStart.slice(5, 7))}月${Number(lastStart.slice(8, 10))}日`
    : '暂无记录';

  return (
    <div className="paper-card overflow-hidden rounded-3xl relative">
      {/* 黄历详情页浮层（点农历行打开），覆盖整卡 */}
      {almanacOpen && selectedDate && (
        <div className="absolute inset-0 z-10">
          <AlmanacPage y={sy} m={sm} d={sd} onBack={() => setAlmanacOpen(false)} />
        </div>
      )}

      {/* 卡片主体：左栏（默认=日期大字；选中=详情面板）｜右 月历小组件 */}
      <div className="flex items-stretch gap-4 px-4 pb-4 pt-4">
        {selectedDate == null ? (
          /* 左：日期信息 —— 浅灰月份 / 粗体星期 / 60px 大字日期（稿内无换月箭头）。
              宽度与选中态详情面板一致（46%），点日期时左栏不跳宽。 */
          <div className="flex w-[46%] shrink-0 flex-col">
            <div className="text-[16px] leading-none text-muted-foreground">
              {view.y}年{view.m}月
            </div>
            <div className="mt-4 text-[19px] font-bold leading-none text-foreground">{infoWeekLabel}</div>
            <div className="mt-2 text-[60px] font-bold leading-none tracking-tight text-foreground">
              {infoDate.d}
            </div>
          </div>
        ) : (
          /* 左：日期详情面板（对齐设计稿选中态：心情/农历/日记/经期/提醒） */
          <div className="flex w-[46%] min-w-0 shrink-0 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="divide-y divide-border/60">
              {/* 心情：只读展示两个人的心情弧 */}
              {showMood && (
                <div className="flex items-center justify-between py-2.5">
                  <span className={PANEL_TITLE}>心情</span>
                  <div className="flex items-center gap-3">
                    <MoodChip who="我" mood={selectedRec.me} />
                    <MoodChip who="AI" mood={selectedRec.ai} />
                  </div>
                </div>
              )}

              {/* 农历：点开是小米日历风格的黄历详情页 */}
              {lunarText && (
                <button
                  type="button"
                  onClick={() => setAlmanacOpen(true)}
                  aria-label={`查看${lunarText}黄历详情`}
                  className="flex w-full items-center justify-between py-2.5 text-left transition hover:opacity-80"
                >
                  <span className={PANEL_TITLE}>农历</span>
                  <span className="text-[13px] font-medium text-foreground">{lunarText}</span>
                </button>
              )}

              {/* 日记：行本身即入口，无则空态，有则预览 */}
              <button
                type="button"
                onClick={() => selectedKey && navigate(`/diary?date=${selectedKey}${diaryOfDay ? '' : '&new=1'}`)}
                className="block w-full py-2.5 text-left transition hover:opacity-80"
              >
                <span className={PANEL_TITLE}>日记</span>
                {diaryOfDay ? (
                  <>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {diaryOfDay.date} · {AUTHOR_LABEL[diaryOfDay.author]}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-foreground/80">
                      {diaryOfDay.content}
                    </p>
                  </>
                ) : (
                  <div className="mt-0.5 text-[12px] text-muted-foreground">今天还没有记日记</div>
                )}
              </button>

              {/* 经期：关怀语玫瑰红 + 「设置」玫瑰字开弹窗 + 记入经期 */}
              <div className="py-2.5">
                <div className="flex items-center justify-between">
                  <span className={PANEL_TITLE}>经期</span>
                  <button
                    type="button"
                    onClick={() => setPeriodModalOpen(true)}
                    className="text-[13px] font-medium text-rose-500 transition hover:opacity-80"
                  >
                    设置
                  </button>
                </div>
                {periodSummaryText && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">{periodSummaryText}</div>
                )}
                <div className="mt-1 text-[13px] font-medium leading-5 text-rose-500">
                  {selectedISO ? careMessage({ records, settings }, selectedISO) : ''}
                </div>
                <button type="button" onClick={toggleMark} className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition',
                      selectedPeriodIdx !== null ? 'border-rose-400 bg-rose-400' : 'border-rose-300 bg-transparent',
                    )}
                  >
                    {selectedPeriodIdx !== null && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {selectedPeriodIdx !== null ? '已记入经期' : '记入经期'}
                  </span>
                </button>

                {/* 经期日：症状记录 */}
                {selectedPeriodIdx !== null && (
                  <div className="mt-2.5 space-y-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">痛经程度</div>
                      <div className="mt-1 flex gap-1">
                        {CRAMP_LEVELS.map((label, lv) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => selectedISO && setSymptom(selectedISO, { cramps: lv })}
                            className={cn(
                              'flex-1 rounded-lg py-1 text-[11px] transition',
                              (selectedSymptoms?.cramps ?? 0) === lv
                                ? 'bg-rose-400 text-primary-foreground'
                                : 'bg-muted text-foreground/70 hover:bg-foreground/10',
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      value={selectedSymptoms?.discomfort ?? ''}
                      onChange={(e) => selectedISO && setSymptom(selectedISO, { discomfort: e.target.value })}
                      placeholder="其他不适，如腰酸、乏力…"
                      className="h-8 w-full rounded-lg bg-muted px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-surface"
                    />
                  </div>
                )}
              </div>

              {/* 提醒：读设置页「睡前提醒」开关（提醒由系统/AI 侧触发，不由这里手写） */}
              {bedReminderOn && (
                <div className="flex items-center justify-between py-2.5">
                  <span className={PANEL_TITLE}>提醒</span>
                  <span className="text-[12px] text-muted-foreground">22:00 睡前提醒</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 右：月历小组件 —— S M T W T F S 表头（周末蓝）+ 38 高周行 + 选中蓝圆 + 节日标签 + 心情点；中央 ghost 月份水印 */}
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[18%] flex select-none items-start justify-center text-[110px] font-bold leading-none text-foreground/[0.05]"
          >
            {String(view.m).padStart(2, '0')}
          </span>
          <div className="relative grid grid-cols-7">
            {WEEK_LETTERS.map((l, i) => (
              <span
                key={i}
                className={cn(
                  'flex h-7 items-center justify-center text-[11px]',
                  i === 0 || i === 6 ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {l}
              </span>
            ))}
          </div>
          {monthMatrix(view.y, view.m).map((row, ri) => (
            <div key={ri} className="relative grid grid-cols-7">
              {row.map((d, ci) => {
                if (d === null) return <span key={ci} className="h-[38px]" />;
                const iso = `${view.y}-${String(view.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isSelected = selectedDate === iso;
                const isToday = iso === todayISODate();
                const deco = dayDecoration(iso);
                const moodColors = (deco?.moodColors ?? []).slice(0, 2);
                const isWeekend = ci === 0 || ci === 6;
                return (
                  <button
                    key={ci}
                    type="button"
                    onClick={() => handleSelectDate(iso)}
                    aria-pressed={isSelected}
                    aria-label={`${view.y}年${view.m}月${d}日`}
                    className="relative h-[38px]"
                  >
                    {/* 数字槽：所有日期（含选中/今天/带圈）同一位置同一尺寸，圈只衬在数字后面 */}
                    <span className="absolute inset-x-0 top-[5px] flex justify-center">
                      <span
                        className={cn(
                          'relative flex h-6 w-6 items-center justify-center rounded-full text-[13px] leading-none transition',
                          isSelected
                            ? 'bg-primary font-medium text-primary-foreground'
                            : isToday
                              ? cn('ring-1 ring-primary', isWeekend ? 'text-muted-foreground' : 'text-foreground')
                              : isWeekend
                                ? 'text-muted-foreground'
                                : 'text-foreground',
                        )}
                      >
                        {d}
                        {deco?.workFlag === '休' && !isSelected && (
                          <span
                            aria-label="休"
                            className="absolute -right-1.5 -top-1 text-[9px] leading-none text-emerald-500"
                          >
                            ✳
                          </span>
                        )}
                      </span>
                    </span>
                    {/* 节日标签 / 心情点：绝对定位在数字下方，不影响行高与数字位置 */}
                    {deco?.label && (
                      <span className="absolute inset-x-0 bottom-[1px] truncate px-0.5 text-center text-[8px] leading-[10px] text-sky-400/80">
                        {deco.label}
                      </span>
                    )}
                    {moodColors.length > 0 && (
                      <span className="absolute inset-x-0 bottom-[2px] flex justify-center gap-[3px]">
                        {moodColors.map((c, i) => (
                          <span key={i} className="h-1 w-1 rounded-full" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 经期设置弹窗（对齐设计稿：遮罩 + 居中白卡 + 玫瑰步进器） */}
      {periodModalOpen && (
        <PeriodSettingsModal
          settings={settings}
          setSetting={setSetting}
          lastStartLabel={lastStartLabel}
          onClose={() => setPeriodModalOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------- 经期设置弹窗 ---------------------------- */

/** 玫瑰步进行：－ 28天 ＋ */
function StepperRow({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[13px] text-foreground/80">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`减少${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-50"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-[14px] font-medium text-foreground">
          {value} {unit}
        </span>
        <button
          type="button"
          aria-label={`增加${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-rose-400 transition hover:bg-rose-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PeriodSettingsModal({
  settings,
  setSetting,
  lastStartLabel,
  onClose,
}: {
  settings: { periodDays: number; cycleDays: number; regular: boolean };
  setSetting: (s: Partial<{ periodDays: number; cycleDays: number; regular: boolean }>) => void;
  lastStartLabel: string;
  onClose: () => void;
}) {
  // Esc 在 capture 阶段拦下：避免把底下的抽屉/浮层一起关掉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-scrim p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[320px] rounded-[20px] bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="period-settings-modal"
      >
        <h3 className="text-[15px] font-semibold text-foreground">经期设置</h3>
        <div className="mt-3 border-t border-border/70" />

        <StepperRow
          label="周期天数"
          value={settings.cycleDays}
          min={15}
          max={60}
          unit="天"
          onChange={(v) => setSetting({ cycleDays: v })}
        />
        <StepperRow
          label="经期天数"
          value={settings.periodDays}
          min={1}
          max={14}
          unit="天"
          onChange={(v) => setSetting({ periodDays: v })}
        />
        <div className="flex items-center justify-between py-2.5">
          <span className="text-[13px] text-foreground/80">上次经期</span>
          <span className="text-[13px] text-muted-foreground">{lastStartLabel}</span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <span className="text-[13px] text-foreground/80">是否规律</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.regular}
            onClick={() => setSetting({ regular: !settings.regular })}
            className={cn(
              'relative h-6 w-11 rounded-full transition',
              settings.regular ? 'bg-emerald-400' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                settings.regular ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </button>
        </div>
        {!settings.regular && (
          <div className="mt-1 text-[11px] text-muted-foreground/70">
            不规律时按历史记录的平均周期预测
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 w-full rounded-[22px] bg-rose-400 text-sm font-medium text-white transition hover:opacity-90"
        >
          保存
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 一个人的心情（只读）：图案沿用首页 MOOD 那套弧线，颜色即心情色。
 * 没填的日子画一个虚线空圈，不占颜色、也不假装"心情不错"。
 */
function MoodChip({ who, mood }: { who: string; mood?: MoodKey }) {
  const info = moodInfo(mood);
  return (
    <div className="flex items-center gap-1.5">
      {info ? (
        <svg
          viewBox="0 0 32 32"
          className="h-5 w-5"
          fill="none"
          stroke={info.color}
          strokeWidth={2.6}
          strokeLinecap="round"
          role="img"
          aria-label={`${who}的心情：${info.label}`}
        >
          <path d={info.path} />
        </svg>
      ) : (
        <span className="h-5 w-5 rounded-full border border-dashed border-border" />
      )}
      <span className="text-[10px] text-muted-foreground">{who}</span>
    </div>
  );
}

export default CalendarCard;

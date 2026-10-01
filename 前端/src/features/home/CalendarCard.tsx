import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { periodSummary } from '@/lib/cycle';
import { diaryDayKey, AUTHOR_LABEL } from '@/features/diary/diaryData';
import { useDiaryStore } from '@/features/diary/diaryStore';
import { CollapsibleCalendar, type CalendarDayDecoration } from '@/features/calendar/CollapsibleCalendar';
import { daySpecial } from '@/features/calendar/chineseCalendar';
import {
  usePeriodStore,
  periodDayIndexOf,
  recordFor,
  predictNextStart,
  isPredictedDay,
  careMessage,
  CRAMP_LEVELS,
  todayISODate,
  diffDays,
} from './periodStore';
import {
  useMemorialStore,
  memorialOnDate,
  dayStatus,
  statusLabel,
  formatMemorialDate,
  type MemorialDay,
} from './memorialStore';
import happyEmoji from 'emoji-datasource-apple/img/apple/64/1f604.png';
import calmEmoji from 'emoji-datasource-apple/img/apple/64/1f60c.png';
import sadEmoji from 'emoji-datasource-apple/img/apple/64/1f622.png';
import angryEmoji from 'emoji-datasource-apple/img/apple/64/1f620.png';
import loveEmoji from 'emoji-datasource-apple/img/apple/64/1f970.png';

type Mood = 'happy' | 'calm' | 'sad' | 'angry' | 'love';

// 心情选项：Apple 风格 emoji 图片 + 文字标签 + 圆点颜色
const MOODS: { key: Mood; label: string; color: string; emoji: string }[] = [
  { key: 'happy', label: '开心', color: '#f59e0b', emoji: happyEmoji },
  { key: 'calm', label: '平静', color: '#10b981', emoji: calmEmoji },
  { key: 'sad', label: '难过', color: '#3b82f6', emoji: sadEmoji },
  { key: 'angry', label: '生气', color: '#ef4444', emoji: angryEmoji },
  { key: 'love', label: '幸福', color: '#ec4899', emoji: loveEmoji },
];

function moodColor(m?: Mood): string | undefined {
  return m ? MOODS.find((x) => x.key === m)?.color : undefined;
}

interface DayMood {
  me?: Mood; // 我的心情
  partner?: Mood; // 对方的心情（手动填写；AI 每日抓取尚未接入）
}

export function CalendarCard() {
  const navigate = useNavigate();
  const entries = useDiaryStore((s) => s.entries);
  const records = usePeriodStore((s) => s.records);
  const settings = usePeriodStore((s) => s.settings);
  const setSymptom = usePeriodStore((s) => s.setSymptom);
  const setSetting = usePeriodStore((s) => s.setSetting);
  const toggleDay = usePeriodStore((s) => s.toggleDay);
  const memorialDays = useMemorialStore((s) => s.days);

  // 折叠日历选中的日期（yyyy-mm-dd），null = 未选中
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [moods, setMoods] = useState<Record<string, DayMood>>({});
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);

  // 选中日期解析
  const [sy, sm, sd] = selectedDate ? selectedDate.split('-').map(Number) : [0, 0, 0];
  // 非补零 key（与心情/日记查找、?date= 深链的 YYYY-M-D 一致）
  const selectedKey = selectedDate ? `${sy}-${sm}-${sd}` : null;
  const selectedISO = selectedDate; // 补零 ISO（经期用）
  const selectedRec = selectedKey ? (moods[selectedKey] ?? {}) : {};
  const selectedIsToday = selectedDate === todayISODate();
  const selectedMeInfo = selectedRec.me ? MOODS.find((x) => x.key === selectedRec.me) : undefined;
  const selectedPartnerInfo = selectedRec.partner
    ? MOODS.find((x) => x.key === selectedRec.partner)
    : undefined;
  // 是否显示心情区：今天（可填写）或已填过心情；过去没填则不显示
  const showMood = selectedIsToday || !!selectedMeInfo || !!selectedPartnerInfo;
  // 选中日期当天的日记（无则 null → 仅今天显示「去记日记」）
  const diaryOfDay = selectedKey
    ? (entries.find((d) => diaryDayKey(d) === selectedKey) ?? null)
    : null;

  // 选中日期的纪念日/节日/节气
  const selectedSpecial: {
    label: string;
    kind: 'anniversary' | 'holiday' | 'festival';
    memorial?: MemorialDay;
  } | null =
    selectedDate != null
      ? (() => {
          const memorial = memorialOnDate(memorialDays, sy, sm, sd);
          if (memorial) return { label: memorial.title, kind: 'anniversary', memorial };
          const sp = daySpecial(sy, sm, sd);
          if (sp) return { label: sp.label, kind: sp.off ? 'holiday' : 'festival' };
          return null;
        })()
      : null;

  // 选中日期距今多少天（正=未来，负=过去）
  const selectedDiff = selectedDate != null ? diffDays(todayISODate(), selectedDate) : 0;
  // 纪念日展示：倒数日（还有/已过/就是今天）+ 日期文案
  const selectedMemorial = selectedSpecial?.memorial;
  const selectedCount = selectedMemorial
    ? statusLabel(dayStatus(selectedMemorial))
    : selectedDiff === 0
      ? '就是今天'
      : selectedDiff > 0
        ? `还有 ${selectedDiff} 天`
        : `已过 ${-selectedDiff} 天`;
  const selectedDateLabel = selectedMemorial
    ? formatMemorialDate(selectedMemorial)
    : `${sy} 年 ${sm} 月 ${sd} 日`;
  // 经期：选中日是否经期日
  const selectedPeriodIdx = selectedISO ? periodDayIndexOf(selectedISO, records) : null;
  const selectedRecord = selectedISO ? recordFor(selectedISO, records) : null;
  const selectedSymptoms = selectedISO ? (selectedRecord?.symptoms[selectedISO] ?? null) : null;

  const setMood = (mood: Mood) => {
    if (!selectedKey) return;
    setMoods((prev) => ({ ...prev, [selectedKey]: { ...(prev[selectedKey] ?? {}), me: mood } }));
  };

  // 逐日调整经期：取消 / 延长 / 记入（由 store 按相邻关系决定）
  const toggleMark = () => {
    if (selectedISO) toggleDay(selectedISO);
  };

  // 选中日期：再点一次同一天 = 收回详情
  const handleSelectDate = (date: string | null) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  };

  // 日历每天的标注：心情圆点 + 经期圆点 + 纪念日金线 + 放假日绿线 + 节日/节气名称
  const next = predictNextStart(records, settings);
  const periodSummaryText = periodSummary(records, settings);
  const dayDecoration = (iso: string): CalendarDayDecoration | undefined => {
    const [y, m, d] = iso.split('-').map(Number);
    const key = `${y}-${m}-${d}`;
    const rec = moods[key];
    const moodColors = [moodColor(rec?.me), moodColor(rec?.partner)].filter(
      (c): c is string => !!c,
    );
    const memorial = !!memorialOnDate(memorialDays, y, m, d);
    const sp = daySpecial(y, m, d);
    const holiday = !!sp?.off;
    const periodIdx = periodDayIndexOf(iso, records);
    const period =
      periodIdx !== null
        ? ('solid' as const)
        : isPredictedDay(iso, next, settings.periodDays)
          ? ('predicted' as const)
          : undefined;
    if (!moodColors.length && !period && !memorial && !holiday && !sp?.label) return undefined;
    return {
      moodColors,
      period,
      memorial,
      holiday,
      label: sp?.label,
      labelKind: sp?.kind,
    };
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-[#0f172a] shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
      {/* 折叠日历（无外壳，与下方详情同卡相接） */}
      <CollapsibleCalendar
        value={selectedDate}
        onChange={handleSelectDate}
        dayDecoration={dayDecoration}
        onCollapsedChange={() => setSelectedDate(null)} // 展开/收起日历 → 自动关闭日期详情
      />

      {selectedDate != null && (
        <div className="border-t border-[#22304a] p-4">
          {/* 记日记入口（原 X 收起按钮改）：进入当天日记，无则新建 */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                if (selectedKey) navigate(`/diary?date=${selectedKey}${diaryOfDay ? '' : '&new=1'}`);
              }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-[#22304a]"
            >
              <Pencil className="h-3.5 w-3.5" />
              记日记
            </button>
          </div>

          {/* 心情：两人 emoji 并排，今日可填写/修改；过去没填则不显示 */}
          {showMood && (
            <div>
              <div className="font-serif text-xs text-[#64748b]">心情</div>
              <div className="mt-2 flex items-center justify-center gap-8">
                <div className="flex flex-col items-center gap-1">
                  {selectedMeInfo ? (
                    <img src={selectedMeInfo.emoji} alt={selectedMeInfo.label} className="h-8 w-8" />
                  ) : (
                    <span className="h-8 w-8 rounded-full border border-dashed border-[#334155]" />
                  )}
                  <span className="text-[10px] text-[#64748b]">我</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  {selectedPartnerInfo ? (
                    <img
                      src={selectedPartnerInfo.emoji}
                      alt={selectedPartnerInfo.label}
                      className="h-8 w-8"
                    />
                  ) : (
                    <span className="h-8 w-8 rounded-full border border-dashed border-[#334155]" />
                  )}
                  <span className="text-[10px] text-[#64748b]">TA</span>
                </div>
              </div>

              {selectedIsToday && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMood(m.key)}
                      className="flex flex-col items-center gap-1.5 px-2 py-1 text-xs transition"
                    >
                      <img
                        src={m.emoji}
                        alt={m.label}
                        draggable={false}
                        className={cn(
                          'h-7 w-7 select-none transition',
                          selectedRec.me === m.key ? 'scale-110' : 'opacity-60',
                        )}
                      />
                      <span
                        className={cn(selectedRec.me === m.key && 'font-semibold')}
                        style={{ color: m.color }}
                      >
                        {m.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 经期：关怀语 + 症状 / 记入 + 设置 */}
          <div className={cn(showMood && 'mt-3 border-t border-[#22304a] pt-3')}>
            <div className="flex items-center justify-between">
              <span className="font-serif text-xs text-[#64748b]">经期</span>
              <button
                type="button"
                onClick={() => setShowPeriodSettings((v) => !v)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs transition',
                  showPeriodSettings
                    ? 'bg-primary text-primary-foreground'
                    : 'text-[#64748b] hover:bg-[#22304a]',
                )}
              >
                设置
              </button>
            </div>

            {/* 上次经期 / 平均周期摘要 */}
            {periodSummaryText && (
              <div className="mt-0.5 text-xs text-[#64748b]/80">{periodSummaryText}</div>
            )}

            {/* 关怀语（按选中日计算） */}
            <div className="mt-1 text-sm leading-6 text-[#e2e8f0]/90">
              {selectedISO ? careMessage({ records, settings }, selectedISO) : ''}
            </div>

            {/* 记入经期：每天显示，点击打勾 / 再点取消 */}
            <button
              type="button"
              onClick={toggleMark}
              className="mt-2 flex w-full items-center gap-2.5 rounded-xl bg-[#1e293b] px-3 py-2.5 text-sm transition hover:bg-[#22304a]"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition',
                  selectedPeriodIdx !== null
                    ? 'border-rose-400 bg-rose-400'
                    : 'border-[#334155] bg-transparent',
                )}
              >
                {selectedPeriodIdx !== null && <Check className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className={cn(selectedPeriodIdx !== null ? 'text-[#e2e8f0]' : 'text-[#e2e8f0]/80')}>
                {selectedPeriodIdx !== null ? '已记入经期' : '将该日期记入经期'}
              </span>
            </button>

            {/* 经期日：症状记录 */}
            {selectedPeriodIdx !== null && (
              <div className="mt-2 space-y-2.5">
                <div>
                  <div className="font-serif text-xs text-[#64748b]">痛经程度</div>
                  <div className="mt-1.5 flex gap-1.5">
                    {CRAMP_LEVELS.map((label, lv) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => selectedISO && setSymptom(selectedISO, { cramps: lv })}
                        className={cn(
                          'flex-1 rounded-lg py-1.5 text-xs transition',
                          (selectedSymptoms?.cramps ?? 0) === lv
                            ? 'bg-rose-400 text-white'
                            : 'bg-[#1e293b] text-[#e2e8f0]/70 hover:bg-[#22304a]',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-serif text-xs text-[#64748b]">其他不适</div>
                  <input
                    value={selectedSymptoms?.discomfort ?? ''}
                    onChange={(e) =>
                      selectedISO && setSymptom(selectedISO, { discomfort: e.target.value })
                    }
                    placeholder="如腰酸、乏力…"
                    className="mt-1.5 h-9 w-full rounded-xl bg-[#1e293b] px-3 text-sm text-[#e2e8f0] outline-none placeholder:text-[#64748b]/60 focus:bg-white"
                  />
                </div>

                <div>
                  <div className="font-serif text-xs text-[#64748b]">今日心情</div>
                  <div className="mt-1.5 flex items-center justify-between px-1">
                    {MOODS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => selectedISO && setSymptom(selectedISO, { mood: m.key })}
                        className="transition"
                      >
                        <img
                          src={m.emoji}
                          alt={m.label}
                          draggable={false}
                          className={cn(
                            'h-7 w-7 select-none transition',
                            selectedSymptoms?.mood === m.key ? 'scale-110' : 'opacity-40',
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showPeriodSettings && (
              <div className="mt-3 border-t border-[#22304a] pt-3">
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-[#e2e8f0]/80">经期持续天数</span>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={settings.periodDays}
                    onChange={(e) =>
                      setSetting({ periodDays: Math.min(14, Math.max(1, Number(e.target.value) || 1)) })
                    }
                    className="h-8 w-20 rounded-lg bg-[#1e293b] px-2 text-center text-sm text-[#e2e8f0] outline-none focus:bg-white"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-[#e2e8f0]/80">月经周期</span>
                  <input
                    type="number"
                    min={15}
                    max={60}
                    value={settings.cycleDays}
                    onChange={(e) =>
                      setSetting({ cycleDays: Math.min(60, Math.max(15, Number(e.target.value) || 28)) })
                    }
                    className="h-8 w-20 rounded-lg bg-[#1e293b] px-2 text-center text-sm text-[#e2e8f0] outline-none focus:bg-white"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-[#e2e8f0]/80">规律</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.regular}
                    onClick={() => setSetting({ regular: !settings.regular })}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition',
                      settings.regular ? 'bg-primary' : 'bg-[#334155]',
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
                  <div className="mt-1 text-xs text-[#64748b]/70">
                    不规律时按历史记录的平均周期预测
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 节日信息 */}
          {selectedSpecial && (
            <div className="mt-3 flex items-center justify-between border-t border-[#22304a] pt-3">
              <div>
                <div className="text-sm font-medium text-[#e2e8f0]">{selectedSpecial.label}</div>
                <div className="mt-0.5 text-xs text-[#64748b]">{selectedDateLabel}</div>
              </div>
              <div
                className="font-serif text-sm font-medium"
                style={{
                  color:
                    selectedSpecial.kind === 'anniversary'
                      ? '#f59e0b'
                      : selectedSpecial.kind === 'holiday'
                        ? '#10b981'
                        : '#38bdf8',
                }}
              >
                {selectedCount}
              </div>
            </div>
          )}

          {/* 日记：当天有则展示（跳转到日记页对应位置），无则不提示（记日记入口在右上角） */}
          {diaryOfDay && (
            <div className="mt-3 border-t border-[#22304a] pt-3">
              <button
                type="button"
                onClick={() => selectedKey && navigate(`/diary?date=${selectedKey}`)}
                className="block w-full text-left"
              >
                <div className="text-xs text-[#64748b]">{diaryOfDay.date}</div>
                <div
                  className={cn(
                    'mt-1 text-sm font-medium',
                    diaryOfDay.author === 'me' ? 'text-primary' : 'text-rose-400',
                  )}
                >
                  {AUTHOR_LABEL[diaryOfDay.author]}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#e2e8f0]/90">
                  {diaryOfDay.content}
                </p>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

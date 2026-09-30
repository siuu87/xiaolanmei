import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { diaryDayKey, dayKeyToDate, AUTHOR_LABEL, AUTHOR_CLASS } from './diaryData';
import { useDiaryStore } from './diaryStore';
import { DiaryModal } from './DiaryModal';
import { DiaryEditorModal } from './DiaryEditorModal';

/** 今天的 YYYY-MM-DD */
function todayDate(): string {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${n.getFullYear()}-${m}-${d}`;
}

export function DiaryPage() {
  const entries = useDiaryStore((s) => s.entries);
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const newParam = searchParams.get('new');

  // 从日历点「查看日记」：?date=YYYY-M-D，滚动到当天那篇并高亮（不再自动弹窗）
  const [openId, setOpenId] = useState<string | null>(null);
  // 从日历点「去记日记」：?date=...&new=1，自动打开写日记弹窗（锁定日期）
  const [editing, setEditing] = useState<{ date: string } | null>(
    newParam ? { date: dateParam ? dayKeyToDate(dateParam) : todayDate() } : null,
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const targetId =
    dateParam && !newParam
      ? (entries.find((d) => diaryDayKey(d) === dateParam)?.id ?? null)
      : null;

  // 定位并高亮目标日记
  useEffect(() => {
    if (!targetId) return;
    document
      .getElementById(`diary-${targetId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(targetId);
    const t = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(t);
  }, [targetId]);

  const openEntry = entries.find((d) => d.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xs text-muted-foreground">DIARY · 日记本</h1>
        <button
          type="button"
          onClick={() => setEditing({ date: todayDate() })}
          aria-label="写日记"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-4">
        {entries.map((d) => {
          const [y, m, dd] = d.date.split('-').map(Number);
          return (
            <div key={d.id} id={`diary-${d.id}`}>
              {/* 日期写在卡片框外面：月日放大重点，年小字跟在后面 */}
              <div className="flex items-baseline gap-1.5 px-1">
                <span className="font-serif text-2xl font-medium leading-none tracking-tight text-foreground">
                  {m}月{dd}日
                </span>
                <span className="text-xs text-muted-foreground">{y}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(d.id)}
                className={cn(
                  'glass mt-1.5 block w-full p-4 text-left transition hover:bg-muted/20',
                  highlightId === d.id && 'ring-2 ring-primary',
                )}
              >
                {/* 谁写的 → 正文（先只显示几句） */}
                <div className={cn('text-sm font-medium', AUTHOR_CLASS[d.author])}>
                  {AUTHOR_LABEL[d.author]}
                </div>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground/90">{d.content}</p>
              </button>
            </div>
          );
        })}
      </div>

      {openEntry && <DiaryModal entry={openEntry} onClose={() => setOpenId(null)} />}
      {editing && <DiaryEditorModal initialDate={editing.date} onClose={() => setEditing(null)} />}
    </div>
  );
}

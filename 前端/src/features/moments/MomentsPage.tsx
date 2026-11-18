import { useEffect, useMemo, useState } from 'react';
import { Heart, Pin, PinOff, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { cn } from '@/lib/utils';
import { useMomentsStore } from './momentsStore';
import type { MomentItem } from '@/lib/api/moments';

/**
 * 心动收藏（2026-11-18 三十四改，参考小红书「Nid douillet」的 Feel 页）：
 * 聊天里长按消息「收进心动」，这里按日期分组翻看。
 *
 * 比 Feel 收着做：两档筛选（全部 / 置顶）、卡片 = 引号 + 句子 + 日期，
 * 每张卡可 Pin 沉档 / 删除。入口在抽屉「生活小趣味」组 + 聊天长按菜单。
 */

/** 星期几的中文 */
function weekdayCN(ts: number): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(ts).getDay()];
}

/** 时间戳 → 分组标题：今天 / 昨天 / M月D日 周X */
function dayLabel(ts: number, now: Date): string {
  const d = new Date(ts);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  const md = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  if (diff === 0) return `今天 · ${md} ${weekdayCN(ts)}`;
  if (diff === 1) return `昨天 · ${md} ${weekdayCN(ts)}`;
  return `${md} ${weekdayCN(ts)}`;
}

function MomentCard({ m }: { m: MomentItem }) {
  const togglePin = useMomentsStore((s) => s.togglePin);
  const remove = useMomentsStore((s) => s.remove);
  const time = new Date(m.createdAt);
  const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  return (
    <div
      data-testid="moment-card"
      className="paper-card px-4 py-3.5"
    >
      <p className="whitespace-pre-wrap text-[13.5px] leading-7 text-foreground">{m.content}</p>
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-muted-foreground">
        <span className="tabular-nums">{hhmm}</span>
        {m.pinned && (
          <span className="flex items-center gap-0.5 text-primary">
            <Pin className="h-3 w-3" />
            沉档
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label={m.pinned ? '取消沉档' : '沉档'}
          title={m.pinned ? '取消沉档' : '沉档'}
          onClick={() => togglePin(m.id)}
          className="rounded-full p-1.5 transition hover:bg-foreground/10"
        >
          {m.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          aria-label="删除"
          title="删除"
          onClick={() => remove(m.id)}
          className="rounded-full p-1.5 text-muted-foreground transition hover:bg-foreground/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function MomentsPage() {
  const items = useMomentsStore((s) => s.items);
  const loaded = useMomentsStore((s) => s.loaded);
  const load = useMomentsStore((s) => s.load);
  const [tab, setTab] = useState<'all' | 'pinned'>('all');

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), []);
  const filtered = useMemo(
    () => (tab === 'pinned' ? items.filter((m) => m.pinned) : items),
    [items, tab],
  );

  // 按日期分组（store 已按置顶优先 + 时间倒序排好）
  const groups = useMemo(() => {
    const out: { label: string; items: MomentItem[] }[] = [];
    for (const m of filtered) {
      const label = dayLabel(m.createdAt, now);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [filtered, now]);

  return (
    <PageShell title="心动" eyebrow="MOMENTS" className="moments-page">
      <div className="pb-6 pt-1">
        {/* 两档筛选 */}
        <div className="mb-3 flex items-center gap-1.5">
          {(
            [
              { key: 'all', label: '全部' },
              { key: 'pinned', label: '沉档' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              data-testid={`moments-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12px] transition',
                tab === t.key
                  ? 'bg-foreground text-background'
                  : 'border border-border text-muted-foreground hover:bg-foreground/5',
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
            <Heart className="h-3 w-3 text-primary/70" />
            {items.length} 句
          </span>
        </div>

        {/* 卡片流 */}
        {loaded && groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center">
            <Heart className="h-5 w-5 text-primary/50" />
            <p className="text-[13px] text-muted-foreground">
              还没有收进心动——聊天里长按一句话试试
            </p>
          </div>
        ) : (
          <div className="space-y-5" data-testid="moments-list">
            {groups.map((g) => (
              <section key={g.label}>
                <div className="mb-2 flex items-center gap-2 px-0.5">
                  <span className="eyebrow whitespace-nowrap">{g.label}</span>
                  <span className="h-px flex-1 bg-border/70" aria-hidden />
                </div>
                <div className="space-y-2.5">
                  {g.items.map((m) => (
                    <MomentCard key={m.id} m={m} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

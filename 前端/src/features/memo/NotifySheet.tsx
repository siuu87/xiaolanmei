import { useEffect, useState } from 'react';
import { Bell, Loader2, X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { listMemos, type MemoDTO } from '@/lib/api/memo';
import { MemoBullet } from './MemoBullet';

/**
 * 「待提醒」抽屉：把所有 `needNotify` 的备忘录集中列出来。
 *
 * 设置页那个「待提醒」开关 2026-10-18 之前是摆设（只写 localStorage、没人读）。
 * 现在开关打开时，备忘录首页顶部会出现「待提醒 N」条，点开就是这里；
 * 关掉开关这条入口就消失，其他功能不受影响。
 */
export function NotifySheet({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<MemoDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    listMemos()
      .then((all) => {
        if (alive) setItems(all.filter((m) => m.needNotify));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col bg-background sm:w-[420px]">
        <div className="flex items-center gap-2 border-b px-4 pb-3 pt-4">
          <Bell className="h-4 w-4 text-rose-400" />
          <h2 className="flex-1 text-[17px] font-semibold">待提醒</h2>
          <span className="text-[12px] text-muted-foreground">{items.length} 条</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
            className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <p className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 读取中…
            </p>
          ) : items.length ? (
            items.map((m) => <MemoBullet key={m.id} memo={m} onChanged={onChanged} />)
          ) : (
            <p className="py-6 text-center text-[13px] leading-relaxed text-muted-foreground">
              还没有标了提醒的备忘录。
              <br />
              在备忘录详情里点一下铃铛就能标上。
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

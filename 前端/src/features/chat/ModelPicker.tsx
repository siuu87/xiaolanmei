import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStationStore } from '@/stores/stationStore';

interface Props {
  stationId: string | null;
  model: string | null;
  onChange: (stationId: string | null, model: string | null) => void;
}

/** 聊天顶栏的模型选择器：按站子分组列出模型，选中即用该站子的 Key/地址请求。 */
export function ModelPicker({ stationId, model, onChange }: Props) {
  const stations = useStationStore((s) => s.stations);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const enabled = stations.filter((s) => s.enabled);
  const label = model ?? '默认';

  const pick = (sid: string | null, m: string | null) => {
    onChange(sid, m);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="选择模型"
        className="flex h-7 items-center gap-1.5 rounded-full bg-muted px-3 text-xs text-foreground transition hover:bg-secondary"
      >
        <span className="max-w-28 truncate">{label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-border/60 bg-popover/95 p-1 shadow-lg backdrop-blur-xl">
          <button
            type="button"
            onClick={() => pick(null, null)}
            className={cn(
              'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-foreground/80 hover:bg-muted/50',
              !stationId && !model && 'bg-muted/50',
            )}
          >
            默认
          </button>
          {enabled.map((s) => (
            <div key={s.id}>
              <div className="px-2 pb-0.5 pt-1.5 text-[10px] text-muted-foreground">{s.name}</div>
              {s.models.length === 0 ? (
                <div className="px-2 py-1 text-[11px] text-muted-foreground/50">未配置模型</div>
              ) : (
                s.models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pick(s.id, m)}
                    className={cn(
                      'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-foreground/80 hover:bg-muted/50',
                      stationId === s.id && model === m && 'bg-muted/50',
                    )}
                  >
                    <span className="truncate">{m}</span>
                  </button>
                ))
              )}
            </div>
          ))}
          {enabled.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground/50">还没有站子，去设置里添加</div>
          )}
        </div>
      )}
    </div>
  );
}

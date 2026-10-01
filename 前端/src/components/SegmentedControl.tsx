import { cn } from '@/lib/utils';

export interface Segment<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** iOS 风格分段控制器：圆角胶囊底 + 等宽分段，选中项白底阴影 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('flex rounded-full bg-muted p-1', className)}>
      {segments.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={cn(
            'flex-1 rounded-full px-3 py-1.5 text-sm transition',
            value === s.value
              ? 'bg-white text-foreground shadow dark:bg-zinc-700'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {s.label}
          {s.count !== undefined && <span className="ml-1 text-xs opacity-70">{s.count}</span>}
        </button>
      ))}
    </div>
  );
}

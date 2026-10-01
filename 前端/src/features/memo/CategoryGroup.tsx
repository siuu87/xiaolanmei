import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MemoDTO } from '@/lib/api/memo';
import { MemoBullet } from './MemoBullet';

export interface CategoryGroupMeta {
  key: string;
  label: string;
  emoji: string;
  color: string;
}

/** 分类副标题：emoji + 分类名 + 数量，点击折叠/展开，下方是圆点列表。 */
export function CategoryGroup({
  category,
  items,
  onChanged,
}: {
  category: CategoryGroupMeta;
  items: MemoDTO[];
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group mb-2 flex w-full items-center gap-2"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
        )}
        <span className="text-base">{category.emoji}</span>
        <span className="text-sm font-medium" style={{ color: category.color }}>
          {category.label}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
      </button>

      {open && (
        <div className="pl-6">
          {items.length > 0 ? (
            items.map((item) => (
              <MemoBullet key={item.id} memo={item} onChanged={onChanged} />
            ))
          ) : (
            <p className="py-2 text-xs text-muted-foreground">暂无记录</p>
          )}
        </div>
      )}
    </div>
  );
}

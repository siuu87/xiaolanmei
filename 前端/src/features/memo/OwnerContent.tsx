import { useEffect, useMemo, useState } from 'react';
import { listMemos, type MemoDTO } from '@/lib/api/memo';
import { MEMO_CATEGORIES, type OwnerSide } from './types';
import { CategoryGroup, type CategoryGroupMeta } from './CategoryGroup';

/** 某方档案的已归档内容：按分类竖向折叠分组（副标题 + 圆点列表）。 */
export function OwnerContent({
  ownerSide,
  onChanged,
}: {
  ownerSide: OwnerSide;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<MemoDTO[]>([]);

  const reload = () => {
    listMemos({ status: 'archived', ownerSide })
      .then(setItems)
      .catch(() => {});
    onChanged?.();
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerSide]);

  const groups = useMemo(() => {
    const buckets: { category: CategoryGroupMeta; items: MemoDTO[] }[] = MEMO_CATEGORIES.map((c) => ({
      category: c,
      items: [],
    }));
    const leftovers: MemoDTO[] = [];
    for (const item of items) {
      const b = buckets.find((g) => g.category.key === item.category);
      if (b) b.items.push(item);
      else leftovers.push(item);
    }
    if (leftovers.length > 0) {
      buckets.push({ category: { key: 'other', label: '其他', emoji: '📎', color: '#64748b' }, items: leftovers });
    }
    return buckets;
  }, [items]);

  return (
    <div className="px-4 pt-2">
      {groups.map((g) => (
        <CategoryGroup key={g.category.key} category={g.category} items={g.items} onChanged={reload} />
      ))}
    </div>
  );
}

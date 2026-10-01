import { useState } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import type { OwnerSide } from './types';
import { OwnerContent } from './OwnerContent';

/** 第二层：已收录碎片抽屉，按「我/他」分段 + 竖向折叠分类查看。 */
export function ArchivedSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [side, setSide] = useState<OwnerSide>('me');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col bg-background sm:w-[420px]">
        <div className="flex items-center justify-between border-b px-4 pb-3 pt-4">
          <div className="flex-1 pr-3">
            <SegmentedControl<OwnerSide>
              segments={[
                { value: 'me', label: '我' },
                { value: 'partner', label: '他' },
              ]}
              value={side}
              onChange={setSide}
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
            className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <OwnerContent key={side} ownerSide={side} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

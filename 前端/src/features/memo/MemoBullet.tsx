import { useState } from 'react';
import type { MemoDTO } from '@/lib/api/memo';
import { MemoDetailDialog } from './MemoDetailDialog';

/** 圆点列表项：小圆点 + 等宽正文，点击进入编辑。 */
export function MemoBullet({ memo, onChanged }: { memo: MemoDTO; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="py-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-start gap-3 text-left"
        >
          <span className="mt-1.5 shrink-0 text-xs leading-none text-muted-foreground transition-colors group-hover:text-foreground">
            •
          </span>
          <span className="line-clamp-2 flex-1 font-mono text-[15px] leading-relaxed text-foreground">
            {memo.content}
          </span>
        </button>
      </div>
      <MemoDetailDialog
        memo={memo}
        open={open}
        onOpenChange={setOpen}
        onChanged={() => onChanged?.()}
      />
    </>
  );
}

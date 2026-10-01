import { useEffect, useState } from 'react';
import { Inbox, ChevronRight } from 'lucide-react';
import { listMemos, organizeMemos, type MemoDTO } from '@/lib/api/memo';
import { formatRelativeTime } from './types';
import { MemoDetailDialog } from './MemoDetailDialog';

/** 未分类便签：小卡片，点开看详情/编辑/归档/删除。 */
function MemoStickyNote({ memo, onChanged }: { memo: MemoDTO; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[90px] w-[140px] flex-col rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-transform active:scale-95"
      >
        <p className="line-clamp-4 flex-1 text-[13px] leading-snug text-foreground">{memo.content}</p>
        <span className="mt-2 text-[10px] text-muted-foreground">
          {formatRelativeTime(memo.updatedAt)}
        </span>
      </button>
      <MemoDetailDialog memo={memo} open={open} onOpenChange={setOpen} onChanged={onChanged} />
    </>
  );
}

/** 已收录文件夹小卡：始终占位，AI 把未分类整理好后投放到这里（按「我/他」归档）。 */
function ArchiveFolderCard({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-5 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-accent"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 text-xl">
        🗂
      </div>
      <div className="flex-1 text-left">
        <div className="font-semibold text-foreground">已收录</div>
        <div className="text-xs text-muted-foreground">AI 整理好的碎片会投放到这里</div>
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );
}

/** 「未分类」滑块页：未分类便签小卡片 + 已收录文件夹小卡。 */
export function UnfiledSection({
  archivedCount,
  onOpenArchived,
  onArchivedChange,
}: {
  archivedCount: number;
  onOpenArchived: () => void;
  onArchivedChange: () => void;
}) {
  const [unfiled, setUnfiled] = useState<MemoDTO[]>([]);
  const [organizing, setOrganizing] = useState(false);

  const reload = () => {
    listMemos({ status: 'unfiled' })
      .then(setUnfiled)
      .catch(() => {});
  };

  useEffect(() => {
    reload();
  }, []);

  const organize = async () => {
    if (organizing) return;
    setOrganizing(true);
    try {
      await organizeMemos();
      reload();
      onArchivedChange();
    } catch (e) {
      console.error(e);
      window.alert((e as Error).message);
    } finally {
      setOrganizing(false);
    }
  };

  const onItemChanged = () => {
    reload();
    onArchivedChange();
  };

  return (
    <div className="px-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Inbox className="h-4 w-4" /> 未分类
        </h3>
        {unfiled.length > 0 && (
          <button
            type="button"
            onClick={() => void organize()}
            disabled={organizing}
            className="text-sm font-medium text-primary disabled:opacity-50"
          >
            {organizing ? '整理中…' : `整理 (${unfiled.length})`}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {unfiled.map((memo) => (
          <MemoStickyNote key={memo.id} memo={memo} onChanged={onItemChanged} />
        ))}
      </div>
      {unfiled.length === 0 && (
        <p className="text-sm text-muted-foreground">点右下角 + 记点什么，AI 会帮你整理</p>
      )}

      <ArchiveFolderCard count={archivedCount} onOpen={onOpenArchived} />
    </div>
  );
}

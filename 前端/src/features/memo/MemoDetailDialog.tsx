import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { patchMemo, deleteMemo, type MemoDTO } from '@/lib/api/memo';

const inputCls =
  'w-full resize-none rounded-xl border bg-muted p-3 text-sm leading-6 outline-none focus:border-primary';

/** 备忘录条目详情：点击编辑内容 / 删除；未分类的还可一键归档。 */
export function MemoDetailDialog({
  memo,
  open,
  onOpenChange,
  onChanged,
}: {
  memo: MemoDTO;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [content, setContent] = useState(memo.content);
  const [busy, setBusy] = useState(false);
  const isUnfiled = memo.status === 'unfiled';

  useEffect(() => {
    if (open) setContent(memo.content);
  }, [open, memo.content]);

  const save = async () => {
    const c = content.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      await patchMemo(memo.id, { content: c });
      onOpenChange(false);
      onChanged();
    } catch (e) {
      console.error(e);
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await patchMemo(memo.id, { status: 'archived' });
      onOpenChange(false);
      onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteMemo(memo.id);
      onOpenChange(false);
      onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isUnfiled ? '未分类便签' : '已收录碎片'}</DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className={inputCls}
          placeholder="记下要记住的内容…"
        />
        <DialogFooter>
          <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
            删除
          </Button>
          {isUnfiled && (
            <Button variant="outline" onClick={() => void archive()} disabled={busy}>
              归档
            </Button>
          )}
          <Button onClick={() => void save()} disabled={!content.trim() || busy}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

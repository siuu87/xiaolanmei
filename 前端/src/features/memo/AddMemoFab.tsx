import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createMemo } from '@/lib/api/memo';

/** 新建便签：只写内容，标题/分类/归属交给 AI 整理。 */
function NewMemoDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setContent('');
  }, [open]);

  const save = async () => {
    const c = content.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      await createMemo({
        content: c,
        title: c.slice(0, 15),
        status: 'unfiled',
        ownerSide: 'me',
        category: 'general',
      });
      setContent('');
      onOpenChange(false);
      onCreated();
    } catch (e) {
      console.error(e);
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>记点什么</DialogTitle>
        </DialogHeader>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="想到什么就写下来，AI 会帮你整理"
          className="min-h-[100px] w-full resize-none rounded-xl border bg-muted p-3 text-sm leading-6 outline-none focus:border-primary"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={!content.trim() || busy}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 浮动添加按钮：固定在右下角，点开新建便签弹窗。 */
export function AddMemoFab({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="记一条"
        className="fixed bottom-20 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-transform active:scale-95 md:bottom-8"
      >
        <Plus className="h-6 w-6 text-primary-foreground" />
      </button>
      <NewMemoDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

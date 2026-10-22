import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadImage } from '@/lib/api/attachments';
import { DEFAULT_STICKER_CATEGORY } from '@/lib/api/stickers';
import { useStickerStore } from '@/stores/stickerStore';
import { cn } from '@/lib/utils';

/**
 * 自定义表情包：**按分类**管理。
 *
 * - 顶部一排分类胶囊（含固定存在的「默认」），点一下切换；
 * - 「＋ 新建分类」建一个空分类，之后上传的表情就落在当前分类里；
 * - 每条表情右侧有个分类下拉，改一下就把它挪到别的分类；
 * - 删分类**不会删表情**，里面的表情会被后端搬回「默认」。
 *
 * 聊天页表情面板读的是同一份 store，所以这里改完那边立刻一致。
 */
export function StickerSettings() {
  const stickers = useStickerStore((s) => s.stickers);
  const categories = useStickerStore((s) => s.categories);
  const load = useStickerStore((s) => s.load);
  const addSticker = useStickerStore((s) => s.addSticker);
  const removeSticker = useStickerStore((s) => s.removeSticker);
  const moveSticker = useStickerStore((s) => s.moveSticker);
  const addCategory = useStickerStore((s) => s.addCategory);
  const renameCategory = useStickerStore((s) => s.renameCategory);
  const removeCategory = useStickerStore((s) => s.removeCategory);

  const [active, setActive] = useState<string>(DEFAULT_STICKER_CATEGORY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 新建 / 重命名分类共用一个输入弹窗 */
  const [catDialog, setCatDialog] = useState<{ mode: 'create' | 'rename'; id?: string; name: string } | null>(
    null,
  );
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string; count: number } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // 分类被删掉时把选中项拉回「默认」，否则会停在一个不存在的 id 上（列表永远空）
  useEffect(() => {
    if (!categories.length) return;
    if (!categories.some((c) => c.id === active)) setActive(categories[0].id);
  }, [categories, active]);

  const activeCat = categories.find((c) => c.id === active);
  const list = useMemo(() => stickers.filter((s) => s.categoryId === active), [stickers, active]);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await uploadImage(file);
      await addSticker({ name: file.name, url: img.url, categoryId: active });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCategory = async () => {
    const name = catDialog?.name.trim() ?? '';
    if (!catDialog || !name) return;
    setError(null);
    try {
      if (catDialog.mode === 'create') {
        await addCategory(name);
        // 新建完直接切过去，接着就能上传
        const created = useStickerStore.getState().categories.find((c) => c.name === name);
        if (created) setActive(created.id);
      } else if (catDialog.id) {
        await renameCategory(catDialog.id, name);
      }
      setCatDialog(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doDeleteCategory = async () => {
    if (!confirmDel) return;
    const { id } = confirmDel;
    setConfirmDel(null);
    setError(null);
    try {
      await removeCategory(id);
      setActive(DEFAULT_STICKER_CATEGORY);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>表情包</CardTitle>
        <CardDescription>按分类整理：新建分类后把表情传进去，聊天面板里也按分类翻页</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 分类胶囊 */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              aria-pressed={active === c.id}
              data-testid="sticker-cat-chip"
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[13px] transition',
                active === c.id
                  ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {c.name}
              <span className={cn('text-[11px]', active === c.id ? 'opacity-80' : 'opacity-60')}>
                {c.count}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCatDialog({ mode: 'create', name: '' })}
            data-testid="sticker-cat-add"
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-dashed px-2.5 py-1 text-[13px] text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> 新建
          </button>
        </div>

        {/* 当前分类的工具行 */}
        <div className="flex items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
            {activeCat?.name ?? '默认'}
            <span className="ml-1 text-[11px] text-muted-foreground">{list.length} 个</span>
          </span>
          <button
            type="button"
            onClick={() => setCatDialog({ mode: 'rename', id: active, name: activeCat?.name ?? '' })}
            title="重命名分类"
            aria-label="重命名分类"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {active !== DEFAULT_STICKER_CATEGORY && (
            <button
              type="button"
              onClick={() => setConfirmDel({ id: active, name: activeCat?.name ?? '', count: list.length })}
              title="删除分类（表情会回到默认）"
              aria-label="删除分类"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 当前分类下的表情 */}
        {list.length ? (
          <div className="space-y-2">
            {list.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border p-2" data-testid="sticker-row">
                <img
                  src={s.url}
                  alt={s.name}
                  draggable={false}
                  className="h-11 w-11 shrink-0 rounded-lg object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
                <select
                  value={s.categoryId}
                  onChange={(e) => void moveSticker(s.id, e.target.value)}
                  aria-label={`移动 ${s.name} 到分类`}
                  className="h-7 max-w-[86px] shrink-0 rounded-md border bg-background px-1 text-[11px] text-muted-foreground outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void removeSticker(s.id)}
                  title="删除表情"
                  aria-label={`删除表情 ${s.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-[13px] text-muted-foreground/70">
            「{activeCat?.name ?? '默认'}」里还没有表情包
          </div>
        )}

        {error && <div className="text-xs text-destructive">{error}</div>}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          data-testid="sticker-file-input"
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = '';
          }}
        />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          上传到「{activeCat?.name ?? '默认'}」
        </Button>
      </CardContent>

      {/* 新建 / 重命名分类 */}
      <Dialog open={!!catDialog} onOpenChange={(v) => !v && setCatDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catDialog?.mode === 'rename' ? '重命名分类' : '新建分类'}</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={catDialog?.name ?? ''}
            onChange={(e) => setCatDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCategory();
            }}
            placeholder="如：猫猫、日常、表情包 1"
            maxLength={12}
            data-testid="sticker-cat-input"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">最多 12 个字，同名分类会被拒绝。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>
              取消
            </Button>
            <Button onClick={() => void submitCategory()} disabled={!catDialog?.name.trim()}>
              <Check className="h-4 w-4" /> 确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删分类确认：强调表情不会被删 */}
      <Dialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除分类「{confirmDel?.name}」？</DialogTitle>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              里面的 {confirmDel?.count ?? 0} 个表情不会被删，会自动搬回「默认」分类。
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void doDeleteCategory()}>
              删除分类
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { uploadImage } from '@/lib/api/attachments';
import { useStickerStore } from '@/stores/stickerStore';

/** 自定义表情包：上传图片 → 存后端 URL，聊天页表情包面板里就能发 */
export function StickerSettings() {
  const stickers = useStickerStore((s) => s.stickers);
  const addSticker = useStickerStore((s) => s.addSticker);
  const removeSticker = useStickerStore((s) => s.removeSticker);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await uploadImage(file);
      await addSticker({ name: file.name, url: img.url });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>表情包</CardTitle>
        <CardDescription>上传图片作为表情包，聊天页的表情包面板里就能发</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {stickers.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-xl border p-2">
            <img src={s.url} alt={s.name} draggable={false} className="h-12 w-12 shrink-0 rounded-lg object-contain" />
            <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
            <button
              type="button"
              onClick={() => void removeSticker(s.id)}
              title="删除"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {stickers.length === 0 && (
          <div className="text-sm text-muted-foreground/60">还没有自定义表情包，上传一张吧。</div>
        )}

        {error && <div className="text-xs text-destructive">{error}</div>}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = '';
          }}
        />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          添加表情包
        </Button>
      </CardContent>
    </Card>
  );
}

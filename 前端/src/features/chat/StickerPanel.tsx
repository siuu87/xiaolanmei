import { X } from 'lucide-react';
import { STICKERS } from './stickers';
import { useStickerStore } from '@/stores/stickerStore';

/** 表情包面板：底部弹出，点贴图即发送；内置贴图 + 自定义表情包（设置页上传） */
export function StickerPanel({
  onPick,
  onClose,
}: {
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const custom = useStickerStore((s) => s.stickers);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-background p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">表情包</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid max-h-72 grid-cols-6 gap-2 overflow-y-auto">
          {STICKERS.map((s) => (
            <button
              key={s.emoji}
              type="button"
              onClick={() => onPick(s.emoji)}
              aria-label={s.emoji}
              className="flex aspect-square items-center justify-center rounded-xl p-1.5 transition hover:bg-muted"
            >
              <img src={s.img} alt={s.emoji} draggable={false} className="h-full w-full object-contain" />
            </button>
          ))}
          {custom.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.url)}
              aria-label={s.name}
              title={s.name}
              className="flex aspect-square items-center justify-center rounded-xl p-1.5 transition hover:bg-muted"
            >
              <img src={s.url} alt={s.name} draggable={false} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

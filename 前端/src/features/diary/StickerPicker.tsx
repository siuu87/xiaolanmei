import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, X } from 'lucide-react';
import { uploadImage } from '@/lib/api/attachments';
import { DEFAULT_STICKER_CATEGORY } from '@/lib/api/stickers';
import { useStickerStore } from '@/stores/stickerStore';
import { DIARY_STICKERS } from './diaryStickerSet';

interface Props {
  onPick: (src: string) => void;
  onClose: () => void;
}

/**
 * 贴纸面板（2026-11-15）：
 *
 * 「我的表情包」直接复用聊天那套素材（设置页上传 / 分类的那一批），
 * 加上 12 个内置贴图；点一个就贴到当前这页纸上。
 *
 * 整屏不透明（项目硬规则：不许半透明遮罩），从底部升起来。
 */
export function StickerPicker({ onPick, onClose }: Props) {
  const custom = useStickerStore((s) => s.stickers);
  const load = useStickerStore((s) => s.load);
  const addSticker = useStickerStore((s) => s.addSticker);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Esc 收起（window capture，别被下层的书吃掉）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErr('');
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 6)) {
        const up = await uploadImage(f);
        await addSticker({
          name: f.name.replace(/\.[^.]+$/, '').slice(0, 20) || '表情包',
          url: up.url,
          categoryId: DEFAULT_STICKER_CATEGORY,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex flex-col bg-page-bg"
      data-testid="diary-sticker-picker"
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onClose} aria-label="收起" className="icon-btn h-8 w-8">
          <X className="h-[18px] w-[18px]" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="text-[13px] font-semibold text-foreground">贴一张表情</span>
          <span className="text-[10px] text-muted-foreground">贴到这一页纸上，贴完还能拖着挪</span>
        </div>
        <span className="h-8 w-8" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {/* 我的表情包：和聊天共用一份素材 */}
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[12px] font-medium text-foreground">我的表情包</span>
          <span className="text-[10px] text-muted-foreground">聊天里那套，直接贴</span>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-2" data-testid="diary-sticker-mine">
          {custom.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.url)}
              aria-label={s.name}
              className="flex aspect-square items-center justify-center rounded-xl bg-secondary/60 p-1.5 active:scale-95"
            >
              <img src={s.url} alt={s.name} draggable={false} className="h-full w-full object-contain" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            data-testid="diary-sticker-upload"
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-page-line text-muted-foreground active:scale-95"
          >
            <ImagePlus className="h-[18px] w-[18px]" />
            <span className="text-[9px] leading-none">{uploading ? '上传中' : '传一张'}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void pickFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {custom.length === 0 && !uploading && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            还没传过表情包，点「传一张」就能把自己的贴上来。
          </p>
        )}
        {err && <p className="mt-2 text-[11px] text-rose-500">{err}</p>}

        {/* 内置贴图 */}
        <div className="mt-6 flex items-baseline gap-2">
          <span className="text-[12px] font-medium text-foreground">内置贴纸</span>
          <span className="text-[10px] text-muted-foreground">表情 + 手账小物，随手贴</span>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-2" data-testid="diary-sticker-builtin">
          {DIARY_STICKERS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onPick(s.key)}
              aria-label={`贴 ${s.key}`}
              data-testid={`diary-sticker-pick-${s.key}`}
              className="flex aspect-square items-center justify-center rounded-xl bg-secondary/40 p-1.5 active:scale-95"
            >
              <img src={s.img} alt={s.key} draggable={false} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>

        <p className="mt-5 text-[10px] leading-relaxed text-muted-foreground">
          想贴自己的表情包？也可以在「设置 → 表情包」里批量传，聊天和这里共用一套。
        </p>
      </div>
    </div>,
    document.body,
  );
}

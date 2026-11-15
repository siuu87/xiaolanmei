import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, X } from 'lucide-react';
import { uploadImage } from '@/lib/api/attachments';
import { DEFAULT_STICKER_CATEGORY, type Sticker } from '@/lib/api/stickers';
import { useStickerStore } from '@/stores/stickerStore';
import { DIARY_EMOJIS, DIARY_STICKERS } from './diaryStickerSet';

interface Props {
  onPick: (src: string) => void;
  onClose: () => void;
}

type Tab = 'emoji' | 'sticker' | 'mine';

/**
 * 贴纸面板（2026-11-15）：
 *
 * 三类都能贴到当前这页纸上 ——
 * 1. **表情**：60 个常用 emoji，直接存字符（贴纸层按文字渲染，不用为每个 emoji 备图）；
 *    下面还有一格输入框，想贴哪个 emoji 自己打进去就行。
 * 2. **贴纸**：24 个内置贴图（聊天的 12 个表情 + 12 个手账小物），存 emoji 字符当 key。
 * 3. **我的**：设置 → 表情包里那套自定义素材（按分类分组），聊天和日记共用一份。
 *
 * 整屏不透明（项目硬规则：不许半透明遮罩），tab 切内容，不动纸页。
 */
export function StickerPicker({ onPick, onClose }: Props) {
  const custom = useStickerStore((s) => s.stickers);
  const categories = useStickerStore((s) => s.categories);
  const load = useStickerStore((s) => s.load);
  const addSticker = useStickerStore((s) => s.addSticker);
  const [tab, setTab] = useState<Tab>('emoji');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [raw, setRaw] = useState('');
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
      setTab('mine');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  /** 「我的」按分类分组；分类里删空了的不显示，归类不明的塞进最后一组 */
  const groups = useMemo(() => {
    const used = new Set<string>();
    const list = categories.map((c) => {
      const items = custom.filter((s) => (s.categoryId ?? DEFAULT_STICKER_CATEGORY) === c.id);
      if (items.length) used.add(c.id);
      return { id: c.id, name: c.name, items };
    });
    const orphans = custom.filter((s) => !used.has(s.categoryId ?? DEFAULT_STICKER_CATEGORY));
    if (orphans.length) list.push({ id: '__other', name: '其他', items: orphans });
    return list.filter((g) => g.items.length > 0);
  }, [custom, categories]);

  const tabBtn = (key: Tab, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      aria-pressed={tab === key}
      data-testid={`diary-sticker-tab-${key}`}
      className={`relative shrink-0 px-1 pb-2 text-[13px] transition ${
        tab === key ? 'font-semibold text-foreground' : 'text-muted-foreground'
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1 text-[10px] font-normal opacity-60">{count}</span>}
      {tab === key && (
        <span aria-hidden className="absolute inset-x-0 -bottom-px mx-auto block h-[2px] w-5 rounded-full bg-foreground" />
      )}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[1400] flex flex-col bg-page-bg" data-testid="diary-sticker-picker">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onClose} aria-label="收起" className="icon-btn h-8 w-8">
          <X className="h-[18px] w-[18px]" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="text-[13px] font-semibold text-foreground">贴一张</span>
          <span className="text-[10px] text-muted-foreground">贴到这一页纸上，贴完还能拖着挪</span>
        </div>
        <span className="h-8 w-8" />
      </header>

      <div className="flex shrink-0 items-end gap-5 border-b border-page-line px-4">
        {tabBtn('emoji', '表情', 0)}
        {tabBtn('sticker', '贴纸', 0)}
        {tabBtn('mine', '我的', custom.length)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {tab === 'emoji' && (
          <>
            <div className="mt-3 grid grid-cols-6 gap-2" data-testid="diary-sticker-emojis">
              {DIARY_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onPick(e)}
                  aria-label={`贴 ${e}`}
                  data-testid={`diary-sticker-pick-${e}`}
                  className="flex aspect-square items-center justify-center rounded-xl bg-secondary/50 leading-none active:scale-95"
                >
                  <span className="text-[26px] leading-none">{e}</span>
                </button>
              ))}
            </div>

            {/* 想贴的 emoji 不在上面？自己打一个 */}
            <div className="mt-4 flex items-center gap-2">
              <input
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                maxLength={8}
                placeholder="或者自己打一个 😊"
                aria-label="自己打一个 emoji"
                data-testid="diary-sticker-raw"
                className="h-9 min-w-0 flex-1 rounded-lg border border-page-line bg-transparent px-3 text-[15px] text-foreground outline-none placeholder:text-[12px] placeholder:text-muted-foreground"
              />
              <button
                type="button"
                disabled={!raw.trim()}
                onClick={() => {
                  const v = raw.trim();
                  if (!v) return;
                  onPick(v);
                  setRaw('');
                }}
                data-testid="diary-sticker-raw-add"
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 text-[12px] text-page-bg disabled:opacity-35"
              >
                <Check className="h-3.5 w-3.5" />
                贴上去
              </button>
            </div>
          </>
        )}

        {tab === 'sticker' && (
          <div className="mt-3 grid grid-cols-6 gap-2" data-testid="diary-sticker-builtin">
            {DIARY_STICKERS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onPick(s.key)}
                aria-label={`贴 ${s.key}`}
                data-testid={`diary-sticker-pick-${s.key}`}
                className="flex aspect-square items-center justify-center rounded-xl bg-secondary/50 p-1.5 active:scale-95"
              >
                <img src={s.img} alt={s.key} draggable={false} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}

        {tab === 'mine' && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              data-testid="diary-sticker-upload"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-page-line py-2.5 text-[12px] text-muted-foreground active:scale-[0.99]"
            >
              <ImagePlus className="h-[16px] w-[16px]" />
              {uploading ? '上传中…' : '传一张表情包'}
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

            {groups.length === 0 && !uploading && (
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                还没传过表情包。点上面「传一张」，或者在「设置 → 表情包」里批量传 —— 聊天和日记共用一套。
              </p>
            )}

            {groups.map((g) => (
              <div key={g.id} className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-medium text-foreground">{g.name}</span>
                  <span className="text-[10px] text-muted-foreground">{g.items.length}</span>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {g.items.map((s: Sticker) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onPick(s.url)}
                      aria-label={s.name}
                      data-testid={`diary-sticker-mine-${s.id}`}
                      className="flex aspect-square items-center justify-center rounded-xl bg-secondary/50 p-1.5 active:scale-95"
                    >
                      <img src={s.url} alt={s.name} draggable={false} className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {err && <p className="mt-2 text-[11px] text-rose-500">{err}</p>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

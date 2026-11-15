import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { uploadImage } from '@/lib/api/attachments';
import type { DiaryBook, DiaryEntry } from './diaryData';
import { hmNow, prettyDate, prettyTime } from './diaryData';
import { useDiaryStore } from './diaryStore';

interface Props {
  book: DiaryBook;
  date: string;
  /** 传了就是改这一条，不传就是新加一条「时刻」 */
  entry?: DiaryEntry | null;
  onClose: () => void;
}

const MAX_IMAGES = 9;

/**
 * 记录页（D·LOG 的轻记录）：
 * 上面一排照片（可加可删），中间一句话，最后是标签。
 * 时间默认「现在」，不想要就点一下清掉；一天可以记很多条，不覆盖之前的。
 * （表情包不放这儿 —— 贴纸是贴在纸上的，走书页右上那个笑脸入口。）
 */
export function DlogCompose({ book, date, entry, onClose }: Props) {
  const addEntry = useDiaryStore((s) => s.addEntry);
  const patchEntry = useDiaryStore((s) => s.patchEntry);
  const removeEntry = useDiaryStore((s) => s.removeEntry);

  const [content, setContent] = useState(entry?.content ?? '');
  const [images, setImages] = useState<string[]>(entry?.images ?? []);
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [time, setTime] = useState(entry?.time ?? hmNow());
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSave = (content.trim().length > 0 || images.length > 0) && !uploading;

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErr('');
    setUploading(true);
    try {
      const room = MAX_IMAGES - images.length;
      const list = Array.from(files).slice(0, Math.max(0, room));
      const urls: string[] = [];
      for (const f of list) {
        const up = await uploadImage(f);
        urls.push(up.url);
      }
      setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const addTag = () => {
    const t = tagInput.replace(/^#+/, '').trim().slice(0, 12);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 6 ? prev : [...prev, t]));
    setTagInput('');
  };

  const save = () => {
    if (!canSave) return;
    const payload = {
      date,
      content: content.trim(),
      images,
      tags,
      time,
    };
    if (entry) {
      patchEntry(entry.id, payload);
    } else {
      addEntry({
        ...payload,
        author: 'me',
        bookId: book.id,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex flex-col bg-page-bg"
      data-testid="diary-dlog-compose"
    >
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onClose} aria-label="取消" className="icon-btn h-8 w-8">
          <X className="h-[18px] w-[18px]" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="text-[11px] text-muted-foreground">{prettyDate(date)}</span>
          <span className="text-[13px] font-semibold text-foreground">
            {entry ? '改这一条' : '记这一刻'}
          </span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          data-testid="diary-compose-save"
          className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-semibold text-page-bg transition disabled:opacity-30"
        >
          保存
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        {/* 照片：一张张小拍立得，随手歪一点，跟纸页上贴出去的样子一致 */}
        <div className="flex flex-wrap gap-2.5 pt-1" data-testid="diary-compose-images">
          {images.map((src, k) => (
            <div
              key={src}
              className="relative bg-[#fbf8f0] p-[3px] pb-2 dark:bg-[#4a4238]"
              style={{
                transform: `rotate(${k % 2 ? 1.7 : -1.9}deg)`,
                boxShadow: '0 7px 13px -8px rgba(38,32,24,0.6)',
              }}
            >
              <img src={src} alt="" className="h-[78px] w-[78px] object-cover" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((x) => x !== src))}
                aria-label="移除这张图"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              data-testid="diary-compose-add-image"
              className="flex h-[92px] w-[84px] flex-col items-center justify-center gap-1 border border-dashed border-page-line text-muted-foreground"
            >
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">{uploading ? '上传中' : '贴张照片'}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="diary-compose-file"
            onChange={(e) => {
              void pickFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {err && <p className="mt-2 text-[12px] text-rose-500">{err}</p>}

        {/* 时间 */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTime(hmNow())}
            data-testid="diary-compose-time"
            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium tabular-nums text-foreground/80"
          >
            {prettyTime(time) || '不记时间'}
          </button>
          {time ? (
            <button
              type="button"
              onClick={() => setTime('')}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              去掉
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTime(hmNow())}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              用现在
            </button>
          )}
        </div>

        {/* 正文 */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="这一刻，想说什么？"
          data-testid="diary-compose-textarea"
          rows={4}
          className="mt-3 w-full resize-none bg-transparent text-[16px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/60"
        />

        {/* 标签 */}
        <div className="mt-4 border-t border-page-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground/75"
              >
                #{t} ×
              </button>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder={tags.length >= 6 ? '最多 6 个' : '# 标签，空格确认'}
              disabled={tags.length >= 6}
              data-testid="diary-compose-tag"
              className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {entry && (
          <button
            type="button"
            onClick={() => {
              if (!confirmDel) {
                setConfirmDel(true);
                return;
              }
              removeEntry(entry.id);
              onClose();
            }}
            data-testid="diary-compose-delete"
            className="mt-8 w-full rounded-xl border border-page-line py-2.5 text-[13px] text-rose-500"
          >
            {confirmDel ? '再点一次，删掉这一条' : '删掉这一条'}
          </button>
        )}
      </div>
    </div>
  );
}

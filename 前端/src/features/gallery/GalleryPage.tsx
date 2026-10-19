import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, HardDrive, ImagePlus, Loader2, RefreshCw, Tag, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { cn } from '@/lib/utils';
import {
  deleteGalleryItem,
  getRememberMeStatus,
  listGallery,
  listGalleryTags,
  patchGalleryItem,
  uploadToGallery,
  type GalleryItemDTO,
  type GalleryTagCount,
  type RememberMeStatus,
} from '@/lib/api/gallery';

/**
 * 相册（together → gallery）：本地优先的图片墙。
 *
 * 设计取舍：
 * - **图片本体不重存**：上传走 `POST /api/upload`（跟发图同一条通道），这里只存 URL + 元数据，
 *   所以别在这个页面里加第二套上传逻辑。
 * - **瀑布流**用 CSS `columns`（不同长宽比的照片不会被拉成等高），不是 grid。
 * - **看大图是「整页」不是遮罩**：全站硬要求「点开就是新页面、纯色不透明」，
 *   所以查看器铺满屏 + 自己的返回键，不做 `bg-black/70` 那种透出底下的浮层。
 * - 不做 AI 视觉描述（要模型密钥，本机还没有）；`note` 字段留好了，接上多模态直接往那写。
 */
export function GalleryPage() {
  const [items, setItems] = useState<GalleryItemDTO[]>([]);
  const [tags, setTags] = useState<GalleryTagCount[]>([]);
  const [activeTag, setActiveTag] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * 相册视图（2026-10-19）：
   * - `remember` = peanutsuee/Remember-Me 的 Dusk Archive Dashboard（侧车 8787）
   * - `local`    = 原来的本地相册（不动旧数据，随时切回）
   * 侧车没起时默认落回本地相册，并给出启动命令，不假装已接入。
   */
  const [mode, setMode] = useState<'remember' | 'local'>('local');
  const [remember, setRemember] = useState<RememberMeStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const checkRemember = async () => {
    setChecking(true);
    try {
      const s = await getRememberMeStatus();
      setRemember(s);
      setMode(s.up ? 'remember' : 'local');
    } catch {
      setRemember(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkRemember();
  }, []);

  const load = async (tag = activeTag) => {
    try {
      const [list, tagList] = await Promise.all([listGallery(tag || undefined), listGalleryTags()]);
      setItems(list);
      setTags(tagList);
      setErr('');
    } catch (e) {
      setErr((e as Error).message || '加载相册失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(activeTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTag]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ''; // 清掉，否则连着选同一张不会再触发
    if (!files.length) return;
    setBusy(true);
    setErr('');
    let failed = 0;
    for (const f of files) {
      try {
        await uploadToGallery(f);
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (failed) setErr(`${failed} 张上传失败（仅支持 png / jpeg / gif / webp，单张 ≤ 8MB）`);
    await load();
  };

  // 正在看的照片从最新的 items 里取，保证编辑后立刻反映
  const viewing = useMemo(() => items.find((i) => i.id === viewingId) ?? null, [items, viewingId]);

  if (viewing) {
    return (
      <GalleryViewer
        item={viewing}
        onBack={() => setViewingId(null)}
        onSaved={async () => {
          await load();
        }}
        onDeleted={async () => {
          setViewingId(null);
          await load();
        }}
      />
    );
  }

  return (
    <PageShell
      title="相册"
      eyebrow="GALLERY"
      testId="gallery-page"
      right={
        mode === 'local' ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="添加照片"
            title="添加照片"
            data-testid="gallery-upload"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
        ) : null
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        onChange={(e) => void pick(e)}
        data-testid="gallery-file"
        className="hidden"
      />

      {/* 视图切换：Remember-Me 记忆相册 / 本地相册 */}
      <div className="mb-3 flex items-center gap-2" data-testid="gallery-mode">
        <div className="flex rounded-full bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setMode('remember')}
            data-testid="gallery-mode-remember"
            className={cn(
              'rounded-full px-3 py-1 text-[11px] transition',
              mode === 'remember'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground/60 hover:text-foreground',
            )}
          >
            记忆相册
          </button>
          <button
            type="button"
            onClick={() => setMode('local')}
            data-testid="gallery-mode-local"
            className={cn(
              'rounded-full px-3 py-1 text-[11px] transition',
              mode === 'local'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground/60 hover:text-foreground',
            )}
          >
            本地相册
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void checkRemember()}
          aria-label="重新检测 Remember-Me"
          data-testid="gallery-remember-check"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
        </button>
      </div>

      {mode === 'remember' ? (
        remember?.up ? (
          <div
            data-testid="remember-me-frame"
            className="overflow-hidden rounded-2xl border border-page-line bg-white"
          >
            <div className="flex items-center justify-between border-b border-page-line px-3 py-2">
              <span className="text-[11px] text-muted-foreground">Remember-Me · Dusk Archive</span>
              <a
                href={remember.dashboard}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-primary"
              >
                新窗口 <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <iframe
              title="Remember-Me"
              src={remember.dashboard}
              data-testid="remember-me-iframe"
              className="h-[68vh] w-full"
            />
          </div>
        ) : (
          <RememberMeSetup checking={checking} onRetry={() => void checkRemember()} />
        )
      ) : (
        <>
          {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" data-testid="gallery-tags">
          <TagChip active={!activeTag} onClick={() => setActiveTag('')} testid="gallery-tag-all">
            全部
          </TagChip>
          {tags.map((t) => (
            <TagChip
              key={t.tag}
              active={activeTag === t.tag}
              onClick={() => setActiveTag(t.tag)}
              testid={`gallery-tag-${t.tag}`}
            >
              {t.tag}
              <span className="ml-1 opacity-60">{t.count}</span>
            </TagChip>
          ))}
        </div>
      )}

      {err && (
        <p data-testid="gallery-error" className="mb-3 text-xs text-destructive">
          {err}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
      ) : items.length === 0 ? (
        <div data-testid="gallery-empty" className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {activeTag ? '这个标签下还没有照片。' : '相册还是空的。'}
          </p>
          {!activeTag && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition active:scale-95"
            >
              添加第一张
            </button>
          )}
        </div>
      ) : (
        /* 瀑布流：CSS 多列 —— 不同长宽比的照片各按各的高度排，不会被拉成等高 */
        <div className="columns-2 gap-2 sm:columns-3" data-testid="gallery-grid">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setViewingId(it.id)}
              data-testid={`gallery-item-${i}`}
              className="group mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl border border-page-line bg-muted/40 text-left transition active:scale-[0.99]"
            >
              <img src={it.url} alt={it.note || it.name || '照片'} loading="lazy" className="block w-full" />
              {(it.note || it.tags.length > 0) && (
                <span className="block px-2 py-1.5">
                  {it.note && (
                    <span className="line-clamp-2 block text-[11px] leading-4 text-foreground/80">{it.note}</span>
                  )}
                  {it.tags.length > 0 && (
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {it.tags.map((t) => `#${t}`).join(' ')}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
        </>
      )}
    </PageShell>
  );
}

/** Remember-Me 侧车没起时的启动说明（不假装已接入） */
function RememberMeSetup({ checking, onRetry }: { checking: boolean; onRetry: () => void }) {
  return (
    <div
      data-testid="remember-me-setup"
      className="rounded-2xl border border-dashed border-page-line p-5 text-center"
    >
      <HardDrive className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">Remember-Me 还没启动</p>
      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
        相册优先使用 peanutsuee/Remember-Me 的图像记忆库（Dusk Archive）。
        侧车默认在 127.0.0.1:8787，启动后点「重新检测」。
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-left text-[10px] leading-5 text-foreground/70">
        {String.raw`cd remember-me
.venv\Scripts\python.exe -m remember_me serve --data-root .data`}
      </pre>
      <button
        type="button"
        onClick={onRetry}
        disabled={checking}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12px] font-medium text-primary-foreground transition active:scale-95 disabled:opacity-50"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} /> 重新检测
      </button>
      <p className="mt-2 text-[10px] text-muted-foreground">
        侧车没起也可以切回「本地相册」，旧数据不会丢。
      </p>
    </div>
  );
}

/** 标签筛选胶囊 */
function TagChip({
  active,
  onClick,
  testid,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] transition active:scale-95',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70 hover:bg-muted/70',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 看大图 + 编辑说明/标签。**整页**（不是遮罩浮层），铺 `bg-page-bg` 不透明底。
 */
function GalleryViewer({
  item,
  onBack,
  onSaved,
  onDeleted,
}: {
  item: GalleryItemDTO;
  onBack: () => void;
  onSaved: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  const [note, setNote] = useState(item.note ?? '');
  const [tagText, setTagText] = useState(item.tags.join('，'));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = note !== (item.note ?? '') || tagText !== item.tags.join('，');

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await patchGalleryItem(item.id, {
        note,
        tags: tagText.split(/[,，\n]/).map((t) => t.trim()).filter(Boolean),
      });
      await onSaved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteGalleryItem(item.id);
      await onDeleted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="gallery-viewer" className="min-h-full bg-page-bg text-foreground">
      <header className="sticky top-0 z-20 border-b border-page-line bg-page-bg px-4 py-3">
        <div className="mx-auto flex w-full max-w-md items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            data-testid="gallery-viewer-back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">照片</h1>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            aria-label="删除照片"
            title="删除照片"
            data-testid="gallery-viewer-delete"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-4">
        <div className="overflow-hidden rounded-2xl border border-page-line bg-black/5">
          <img src={item.url} alt={item.note || item.name || '照片'} className="block w-full" />
        </div>

        <div className="mt-4">
          <label htmlFor="gv-note" className="mb-1 block text-sm font-medium">
            说明
          </label>
          <textarea
            id="gv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="这张照片记了什么…"
            data-testid="gallery-viewer-note"
            className="w-full resize-y rounded-lg border border-page-line bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary"
          />
        </div>

        <div className="mt-3">
          <label htmlFor="gv-tags" className="mb-1 flex items-center gap-1 text-sm font-medium">
            <Tag className="h-3.5 w-3.5" />
            标签
          </label>
          <input
            id="gv-tags"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="用逗号分隔，如：夜晚，蓝莓，散步"
            data-testid="gallery-viewer-tags"
            className="w-full rounded-lg border border-page-line bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dirty}
            data-testid="gallery-viewer-save"
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition active:scale-95 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
          {saved && (
            <span data-testid="gallery-viewer-saved" className="text-xs text-muted-foreground">
              已保存
            </span>
          )}
          {!dirty && !saved && <span className="text-xs text-muted-foreground">没有改动</span>}
        </div>
      </div>
    </div>
  );
}

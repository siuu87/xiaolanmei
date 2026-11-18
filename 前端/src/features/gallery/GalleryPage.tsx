/**
 * 相册（2026-11-18 三十五改造）＝ 两个标签页：
 *
 * - **照片墙**（默认）：本地相册——复用 `POST /api/upload` 落盘 + `galleryItems` 表存元数据
 *   （后端 /api/gallery 全套 CRUD 早就在，只是页面一度被撤掉）。按天分组照片墙，
 *   多选上传、点开大图、写备注、删除（软删）。
 * - **记忆相册**：Remember-Me 的 Dusk Archive Dashboard（2026-10-20 起的形态保留），
 *   侧车在线给入口卡、离线给启动说明。
 *
 * 图片本体永远只有一条上传通道，这里只存 URL + 元数据。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  HardDrive,
  Images,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ExitButton } from '@/components/ExitButton';
import { cn } from '@/lib/utils';
import { createPortal } from 'react-dom';
import {
  deleteGalleryItem,
  getRememberMeStatus,
  listGallery,
  uploadToGallery,
  type GalleryItemDTO,
  type RememberMeStatus,
} from '@/lib/api/gallery';

type Tab = 'wall' | 'remember';

/** 「今天 / 昨天 / M月D日 / YYYY年M月D日」 */
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function GalleryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('wall');

  return (
    <PageShell
      title="相册"
      eyebrow="GALLERY"
      testId="gallery-page"
      className="bg-page-bg"
      bodyClassName="p-0"
    >
      {/* 标签切换：放内容区顶部（顶栏右侧太窄放不下两个带字的按钮） */}
      <div className="flex gap-1 px-4 pt-2">
        {(
          [
            ['wall', '照片墙', Images],
            ['remember', '记忆相册', HardDrive],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            data-testid={`gallery-tab-${key}`}
            aria-pressed={tab === key}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition',
              tab === key
                ? 'bg-foreground text-background'
                : 'bg-surface-2 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      {tab === 'wall' ? <PhotoWall /> : <RememberMe navigate={navigate} />}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* 照片墙：本地相册（按天分组 + 多选上传 + 大图回看）                    */
/* ------------------------------------------------------------------ */

function PhotoWall() {
  const [items, setItems] = useState<GalleryItemDTO[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [viewing, setViewing] = useState<GalleryItemDTO | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listGallery());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = () => fileRef.current?.click();

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadErr('');
    let failed = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadToGallery(f);
      } catch {
        failed += 1;
      }
    }
    setUploading(false);
    if (failed) setUploadErr(`${failed} 张没传上（仅支持 png/jpg/gif/webp，8MB 内）`);
    if (fileRef.current) fileRef.current.value = '';
    void load();
  };

  /** 按天分组（takenAt 缺了用 createdAt），新的天在前 */
  const groups = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, GalleryItemDTO[]>();
    for (const g of items) {
      const key = dayLabel(g.takenAt ?? g.createdAt);
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [items]);

  const remove = async (id: string) => {
    setItems((prev) => (prev ? prev.filter((g) => g.id !== id) : prev));
    setViewing(null);
    void deleteGalleryItem(id).catch(() => {});
  };

  return (
    <div className="px-4 py-4" data-testid="photo-wall">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />

      {/* 顶部一行：计数 + 上传 */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">
          {items ? `${items.length} 张照片` : '…'}
        </span>
        <button
          type="button"
          onClick={pick}
          data-testid="photo-upload"
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition active:scale-95 disabled:opacity-60"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          {uploading ? '上传中…' : '传照片'}
        </button>
      </div>
      {uploadErr ? <p className="mb-3 text-[11.5px] text-destructive">{uploadErr}</p> : null}

      {!items ? (
        <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> 正在打开相册…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
            <Images size={22} />
          </span>
          <p className="mt-3 text-[13px] text-foreground">还没有照片</p>
          <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
            点右上「传照片」，把想留下的瞬间放进来
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([label, list]) => (
            <section key={label}>
              <h3 className="mb-2 flex items-baseline gap-2 text-[12px] text-muted-foreground">
                {label}
                <span className="text-[10.5px] opacity-70">{list.length} 张</span>
              </h3>
              <div className="grid grid-cols-3 gap-1.5">
                {list.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setViewing(g)}
                    data-testid="photo-cell"
                    className="group relative aspect-square overflow-hidden rounded-[10px] bg-surface-2"
                  >
                    <img
                      src={g.url}
                      alt={g.name ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-active:scale-[1.03]"
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 大图回看：portal 到 body，z 走浮层规矩（>1200） */}
      {viewing &&
        createPortal(
          <div
            data-testid="photo-viewer"
            className="fixed inset-0 z-[1600] flex flex-col bg-black"
            onClick={() => setViewing(null)}
          >
            <div className="flex items-center justify-between p-4">
              <span className="text-[12px] text-white/70">
                {dayLabel(viewing.takenAt ?? viewing.createdAt)}
              </span>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setViewing(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
              >
                <X size={17} />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center px-4 pb-4">
              <img
                src={viewing.url}
                alt={viewing.name ?? ''}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-5" onClick={(e) => e.stopPropagation()}>
              <p className="min-w-0 flex-1 truncate text-[12px] text-white/70">
                {viewing.note || viewing.name || ''}
              </p>
              <button
                type="button"
                aria-label="删除这张照片"
                data-testid="photo-delete"
                onClick={() => void remove(viewing.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-red-300 transition active:scale-95"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 记忆相册：Remember-Me 侧车（原样保留）                                */
/* ------------------------------------------------------------------ */

function RememberMe({ navigate }: { navigate: (to: string) => void }) {
  const [status, setStatus] = useState<RememberMeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // 记忆相册经后端反代挂在同源 3001 的 /dashboard，浏览器走公网 3001 即可，侧车 8787 不必对外暴露
  const galleryUrl = `${window.location.origin}/dashboard`;

  const check = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getRememberMeStatus());
    } catch {
      setStatus({ up: false, base: '', dashboard: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 px-5 py-10 text-[13px] text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> 正在打开记忆相册…
      </div>
    );
  }

  if (status?.up) {
    return (
      <div className="relative min-h-[calc(100dvh-120px)]">
        <ExitButton
          variant="solid"
          label="退出"
          ariaLabel="退出相册"
          onExit={() => navigate('/together')}
          testId="gallery-exit"
          className="top-[54px]"
        />
        {/* Remember-Me 出于安全策略禁止内嵌（X-Frame-Options），给入口卡让用户新标签页打开 */}
        <div className="flex h-[calc(100dvh-140px)] flex-col items-center justify-center px-6 text-center">
          <div className="paper-card w-full max-w-sm p-6" data-testid="remember-me-launch">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Images size={22} />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground">记忆相册 · Dusk Archive</h2>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Remember-Me 的图像记忆库以独立页面运行，出于安全策略不允许内嵌到本应用。
              点击下方按钮在新标签页打开，看完随时可返回。
            </p>
            <a
              href={galleryUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="remember-me-open"
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-[12px] font-medium text-primary-foreground transition active:scale-[0.98]"
            >
              <ExternalLink size={14} /> 打开记忆相册
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5">
      <div data-testid="remember-me-setup" className="paper-card p-5 text-card-foreground">
        <div className="flex items-center gap-2 text-[13px] text-foreground">
          <HardDrive size={15} className="text-gold" /> 记忆相册还没启动
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          侧车监听 8787 端口，启动后点右上角刷新；日常的照片放「照片墙」就够了。
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-[10px] leading-4 text-muted-foreground">
          {String.raw`cd remember-me
.venv\Scripts\python.exe -m remember_me serve --data-root .data`}
        </pre>
        <button
          type="button"
          onClick={() => void check()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground transition active:scale-95"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> 重新检测
        </button>
      </div>
    </div>
  );
}

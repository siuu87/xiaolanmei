import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookText, Users2, User2, Trash2, Lock, Unlock, ImagePlus, Loader2, X } from 'lucide-react';
import type { DiaryBook } from './diaryData';
import { BOOK_KIND_LABEL, KIND_DEFAULT_COVER, COVER_PALETTE, LOCK_CODE_LEN } from './diaryData';
import { BookCover } from './BookCover';
import { InkBorder } from './InkShapes';
import { uploadImage } from '@/lib/api/attachments';

/** kind → 图标（书架与设置弹层共用） */
export function kindIcon(kind: DiaryBook['kind']) {
  if (kind === 'couple') return Users2;
  if (kind === 'partner') return User2;
  return BookText;
}

export interface BookDraft {
  name: string;
  kind: DiaryBook['kind'];
  cover: string;
  /** 封皮图片；空串 = 纯色 */
  coverImage: string;
  locked: boolean;
  lockCode: string;
}

interface Props {
  book: DiaryBook | null; // null = 新建
  onClose: () => void;
  onSave: (patch: BookDraft) => void;
  onDelete?: () => void;
}

/** 只留数字，最多 4 位 */
function digits(v: string): string {
  return v.replace(/\D/g, '').slice(0, LOCK_CODE_LEN);
}

/** 新建 / 编辑本子：名字 + 类型 + 封面色 + 上锁 */
export function BookSheet({ book, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(book?.name ?? '');
  const [kind, setKind] = useState<DiaryBook['kind']>(book?.kind ?? 'me');
  const [cover, setCover] = useState(book?.cover ?? KIND_DEFAULT_COVER[kind]);
  const [coverImage, setCoverImage] = useState(book?.coverImage ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [locked, setLocked] = useState(book?.locked ?? false);
  // 改动已有锁时先验原密码；新建或未上锁时不需要
  const [oldCode, setOldCode] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');

  const wasLocked = book?.locked ?? false;
  const savedCode = book?.lockCode ?? '';
  // 老本子的颜色可能不在莫兰迪色板里 —— 补到最前面，至少能看出当前选的是哪支
  const palette = COVER_PALETTE.includes(cover) ? COVER_PALETTE : [cover, ...COVER_PALETTE];

  const save = () => {
    const n = name.trim();
    if (!n) {
      setErr('先给本子起个名字');
      return;
    }

    let nextCode = locked ? savedCode : '';

    if (wasLocked && locked) {
      if (oldCode !== savedCode) {
        setErr('原密码不对');
        return;
      }
      if (code) {
        if (code.length !== LOCK_CODE_LEN) {
          setErr(`新密码要 ${LOCK_CODE_LEN} 位数字`);
          return;
        }
        if (code !== confirm) {
          setErr('两次输入的新密码不一样');
          return;
        }
        nextCode = code;
      }
    } else if (wasLocked && !locked) {
      if (oldCode !== savedCode) {
        setErr('原密码不对，关不掉锁');
        return;
      }
      nextCode = '';
    } else if (locked) {
      if (code.length !== LOCK_CODE_LEN) {
        setErr(`密码要 ${LOCK_CODE_LEN} 位数字`);
        return;
      }
      if (code !== confirm) {
        setErr('两次输入的密码不一样');
        return;
      }
      nextCode = code;
    }

    onSave({ name: n, kind, cover, coverImage, locked, lockCode: nextCode });
  };

  /** 封皮换成图片：选一张本地图 → 上传拿稳定 URL */
  const onPickCoverImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const up = await uploadImage(file);
      setCoverImage(up.url);
    } catch (err) {
      setErr(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 必须挂到 body：页面容器带 transform，直接渲染的话 fixed 会被它困住，遮罩只盖半屏
  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-page-bg p-3"
      onClick={onClose}
      data-testid="diary-book-sheet"
    >
      <div
        className="relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-page-bg shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 预览封面（与书架同一套 BookCover，所见即所得） */}
        <div className="mx-4 mt-4">
          <BookCover
            book={{ name: name.trim() || '日记本', kind, cover, coverImage, locked }}
            className="h-32 w-full"
          />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* 名字 */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">名字</label>
            <InkBorder
              className="text-ink/20 dark:text-ink/25"
              r={10}
              seed="book-name-field"
              amp={1.1}
              strokeWidth={1.1}
              laps={1}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="给这本日记起个名字"
                maxLength={20}
                data-testid="diary-book-name"
                className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none focus:bg-muted/80"
              />
            </InkBorder>
          </div>

          {/* 类型 */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">类型</label>
            <div className="flex gap-2">
              {(['me', 'partner', 'couple'] as const).map((k) => {
                const KIcon = kindIcon(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setCover((c) => (book ? c : KIND_DEFAULT_COVER[k]));
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition ${
                      kind === k
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-page-line text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <KIcon className="h-3.5 w-3.5" />
                    {BOOK_KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 封皮：莫兰迪纯色，或者换成一张图片 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs text-muted-foreground">封皮</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  data-testid="diary-book-cover-image"
                  className="flex h-7 items-center gap-1 rounded-full border border-page-line px-2.5 text-[11px] font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                  {coverImage ? '换一张图' : '换成图片'}
                </button>
                {coverImage && (
                  <button
                    type="button"
                    onClick={() => setCoverImage('')}
                    aria-label="改回纯色封皮"
                    className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] text-muted-foreground transition hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                    纯色
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickCoverImage}
              data-testid="diary-book-cover-file"
            />
            <div className="flex flex-wrap gap-2">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCover(c);
                    setCoverImage('');
                  }}
                  aria-label={`封皮色 ${c}`}
                  className={`h-7 w-7 rounded-[4px] transition ${
                    !coverImage && cover === c
                      ? 'ring-2 ring-foreground ring-offset-2 ring-offset-page-bg'
                      : 'hover:scale-110'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground/70">
              莫兰迪色布面，也可以换成自己的照片 —— 名字会印在封面那块纸质标签上
            </p>
          </div>

          {/* 上锁 */}
          <div className="rounded-xl border border-page-line p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {locked ? (
                  <Lock className="h-4 w-4 text-foreground" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium text-foreground">上锁</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    上锁后要先输 4 位密码，才能翻开
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={locked}
                aria-label="上锁"
                data-testid="diary-book-lock-toggle"
                onClick={() => {
                  setErr('');
                  setLocked((v) => !v);
                  // 只清新密码；原密码留着 —— 用户常常先输原密码再关开关，别让他白输
                  setCode('');
                  setConfirm('');
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  locked ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    locked ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* 关锁时也要能验原密码，所以条件是「现在锁着 或 本来就锁过」 */}
            {(locked || wasLocked) && (
              <div className="mt-3 space-y-2">
                {wasLocked && (
                  <input
                    value={oldCode}
                    onChange={(e) => setOldCode(digits(e.target.value))}
                    inputMode="numeric"
                    type="password"
                    maxLength={LOCK_CODE_LEN}
                    placeholder={locked ? '原密码（改密码 / 关锁要验）' : '输入原密码才能关掉锁'}
                    aria-label="原密码"
                    data-testid="diary-book-lock-old"
                    className="h-10 w-full rounded-lg bg-muted/60 px-3 text-sm tracking-[0.4em] text-foreground outline-none focus:bg-muted/80"
                  />
                )}
                {locked && (
                  <>
                    <input
                      value={code}
                      onChange={(e) => setCode(digits(e.target.value))}
                      inputMode="numeric"
                      type="password"
                      maxLength={LOCK_CODE_LEN}
                      placeholder={
                        wasLocked ? `新密码（留空＝不改，${LOCK_CODE_LEN} 位）` : `设置 ${LOCK_CODE_LEN} 位数字密码`
                      }
                      aria-label="密码"
                      data-testid="diary-book-lock-code"
                      className="h-10 w-full rounded-lg bg-muted/60 px-3 text-sm tracking-[0.4em] text-foreground outline-none focus:bg-muted/80"
                    />
                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(digits(e.target.value))}
                      inputMode="numeric"
                      type="password"
                      maxLength={LOCK_CODE_LEN}
                      placeholder="再输一次"
                      aria-label="确认密码"
                      data-testid="diary-book-lock-confirm"
                      className="h-10 w-full rounded-lg bg-muted/60 px-3 text-sm tracking-[0.4em] text-foreground outline-none focus:bg-muted/80"
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {err && (
            <p className="text-xs text-rose-500" data-testid="diary-book-sheet-err">
              {err}
            </p>
          )}
        </div>

        {/* 操作 */}
        <div className="flex gap-2 border-t border-page-line px-4 py-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-rose-500 transition hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            data-testid="diary-book-save"
            className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            保存
          </button>
        </div>

        {/* 手画的弹层边 */}
        <InkBorder
          className="pointer-events-none text-ink/20 dark:text-ink/25"
          style={{ position: 'absolute', inset: 0 }}
          r={15}
          seed="book-sheet"
          amp={1.3}
          strokeWidth={1.3}
          laps={1}
        />
      </div>
    </div>,
    document.body,
  );
}

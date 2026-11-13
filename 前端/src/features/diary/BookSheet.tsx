import { useState } from 'react';
import { BookText, Users2, User2, Trash2, Lock, Unlock } from 'lucide-react';
import type { DiaryBook } from './diaryData';
import { BOOK_KIND_LABEL, KIND_DEFAULT_COVER, COVER_PALETTE, LOCK_CODE_LEN } from './diaryData';

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
  const [locked, setLocked] = useState(book?.locked ?? false);
  // 改动已有锁时先验原密码；新建或未上锁时不需要
  const [oldCode, setOldCode] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');

  const wasLocked = book?.locked ?? false;
  const savedCode = book?.lockCode ?? '';
  const Icon = kindIcon(kind);

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

    onSave({ name: n, kind, cover, locked, lockCode: nextCode });
  };

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-page-bg p-3"
      onClick={onClose}
      data-testid="diary-book-sheet"
    >
      <div
        className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-page-line bg-page-bg shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 预览封面 */}
        <div className="relative mx-4 mt-4 h-28 overflow-hidden rounded-lg" style={{ background: cover }}>
          <div
            aria-hidden
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 8px)',
            }}
          />
          <div className="relative flex h-full flex-col justify-between p-4">
            <Icon className="h-5 w-5 text-white/80" />
            <div>
              <div className="truncate text-xl font-semibold text-white drop-shadow">
                {name.trim() || '日记本'}
              </div>
              <div className="mt-0.5 text-[11px] text-white/70">{BOOK_KIND_LABEL[kind]}</div>
            </div>
          </div>
          {locked && (
            <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/25 text-white">
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* 名字 */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">名字</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="给这本日记起个名字"
              maxLength={20}
              data-testid="diary-book-name"
              className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none focus:bg-muted/80"
            />
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

          {/* 封面色 */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">封面颜色</label>
            <div className="flex flex-wrap gap-2">
              {COVER_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCover(c)}
                  aria-label={`封面色 ${c}`}
                  className={`h-8 w-8 rounded-full transition ${
                    cover === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-page-bg' : 'hover:scale-110'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
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
                  setOldCode('');
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
      </div>
    </div>
  );
}

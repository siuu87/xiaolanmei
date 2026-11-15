import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Delete, Lock, LockOpen } from 'lucide-react';
import { HAND_FONT, LOCK_CODE_LEN } from './diaryData';

interface Props {
  /** set = 给这一页上锁（输新密码）；open = 输密码翻开这一页 */
  mode: 'set' | 'open';
  /** 这一页是哪天（已经排版好的「11 月 15 日」） */
  dayLabel: string;
  onClose: () => void;
  /** 返回 null = 通过；返回字符串 = 错误提示（面板不关） */
  onSubmit: (code: string) => Promise<string | null>;
  /** 错了几次之后才给的第三条路：硬撬（会被 TA 发现） */
  onSneak?: (fails: number) => Promise<void>;
}

/**
 * 单页锁的密码面板（2026-11-15）：
 *
 * 跟整本锁那块灰面是两回事 —— 这里只管「这一页」。
 * 整屏不透明（项目硬规则），从右往左铺满，中间一张小纸片：日期 + 4 个圆点 + 数字键盘。
 * 输满 4 位自动提交，错了抖一下清空；Esc / 左上角返回都能退出。
 */
export function PageLockSheet({ mode, dayLabel, onClose, onSubmit, onSneak }: Props) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 错了几次 —— 错够 2 次才把「撬开」这条路放出来 */
  const [fails, setFails] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Esc 关（window capture，别被下层书吃掉）
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

  const fail = (msg: string) => {
    setErr(msg);
    setFails((n) => n + 1);
    setShake(true);
    setCode('');
    window.setTimeout(() => {
      if (alive.current) setShake(false);
    }, 420);
  };

  const submit = async (next: string) => {
    setBusy(true);
    const msg = await onSubmit(next);
    if (!alive.current) return;
    setBusy(false);
    if (msg) fail(msg);
  };

  const press = (d: string) => {
    if (busy || code.length >= LOCK_CODE_LEN) return;
    const next = code + d;
    setCode(next);
    setErr('');
    if (next.length === LOCK_CODE_LEN) window.setTimeout(() => void submit(next), 110);
  };

  const isSet = mode === 'set';

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex flex-col bg-page-bg" data-testid="diary-page-lock">
      <header className="flex shrink-0 items-center gap-2 px-2 pb-1 pt-3">
        <button type="button" onClick={onClose} aria-label="返回" className="icon-btn">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span
          className="truncate text-[11px] tracking-[0.16em] text-muted-foreground/70"
          style={{ fontFamily: HAND_FONT }}
        >
          {isSet ? '锁住这一天' : '打开这一天'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-10">
        {/* 中间那张小纸片：日期 + 锁 + 圆点 + 键盘 */}
        <div
          className="flex w-full max-w-[300px] flex-col items-center rounded-[10px] bg-[#fdfbf6] px-5 py-7 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)] dark:bg-[#262220]"
          data-testid="diary-page-lock-card"
        >
          {isSet ? (
            <Lock className="h-7 w-7 text-ink/35" strokeWidth={1.6} />
          ) : (
            <LockOpen className="h-7 w-7 text-ink/35" strokeWidth={1.6} />
          )}

          <p className="mt-3 text-[14px] font-medium text-ink" data-testid="diary-page-lock-day">
            {dayLabel}
          </p>
          <p className="mt-1 text-center text-[11px] leading-relaxed text-ink/40" style={{ fontFamily: HAND_FONT }}>
            {isSet
              ? '只锁这一天，别的日子照常翻。设一个 4 位数字就好'
              : '输入 4 位密码，这一次就能看；锁还留在这天'}
          </p>

          <div
            className={`mt-5 flex gap-3 ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}
            data-testid="diary-page-lock-dots"
          >
            {Array.from({ length: LOCK_CODE_LEN }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  i < code.length ? 'bg-ink/70' : 'border border-ink/25'
                }`}
              />
            ))}
          </div>
          <p className="mt-1 h-4 text-[11px] text-rose-500" data-testid="diary-page-lock-err">
            {err}
          </p>

          <div className="mt-1 grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => press(d)}
                data-testid={`diary-page-lock-key-${d}`}
                className="h-11 w-11 rounded-full text-[15px] font-medium text-ink/80 transition active:scale-95 active:bg-black/5"
              >
                {d}
              </button>
            ))}
            <span />
            <button
              type="button"
              onClick={() => press('0')}
              data-testid="diary-page-lock-key-0"
              className="h-11 w-11 rounded-full text-[15px] font-medium text-ink/80 transition active:scale-95 active:bg-black/5"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                setCode((c) => c.slice(0, -1));
                setErr('');
              }}
              aria-label="删除一位"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink/40 transition active:scale-95 active:bg-black/5"
            >
              <Delete className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* 错两次之后才出现的第三条路：撬。撬了会被发现 —— 说清楚再给 */}
          {!isSet && fails >= 2 && onSneak && (
            <div className="mt-4 flex flex-col items-center gap-1.5" data-testid="diary-page-lock-sneak-box">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onSneak(fails);
                  if (alive.current) setBusy(false);
                }}
                data-testid="diary-page-lock-sneak"
                className="rounded-full border border-ink/25 px-4 py-2 text-[12px] text-ink/60 active:scale-95 disabled:opacity-50"
              >
                猜不出来，撬开
              </button>
              <span className="text-[10px] text-muted-foreground">撬进去会被他发现</span>
            </div>
          )}
        </div>

        <p className="mt-4 max-w-[320px] text-center text-[10px] leading-relaxed text-muted-foreground">
          忘了也没关系 —— 敲敲门，开不开看他；实在想知道，也可以撬。
        </p>
      </div>
    </div>,
    document.body,
  );
}

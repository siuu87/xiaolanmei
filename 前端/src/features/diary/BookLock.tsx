import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Delete, Lock, Unlock } from 'lucide-react';
import type { DiaryBook } from './diaryData';
import { HAND_FONT, LOCK_CODE_LEN } from './diaryData';

interface Props {
  book: DiaryBook;
  /** 密码正确：正常解锁（本次会话有效） */
  onUnlock: () => void;
  /** 长按锁「撬锁」：偷偷看，本子仍然上锁 */
  onSneak: () => void;
  onClose: () => void;
}

/** 长按多久算撬开 */
const HOLD_MS = 2600;
/** 短按多久内松手算「点一下开键盘」 */
const TAP_MS = 600;

/**
 * 上锁本子的锁面（2026-11-13 按用户「这一面就灰色然后一把锁」重做）：
 * - 就是本子里的**一面灰纸**，正中间一把锁；不再有封面缩略图和 LOCKED 大标题
 * - 点一下锁 → 密码圆点 + 数字键盘浮在灰面上；输满自动校验，错了抖一下清空
 * - 长按锁 2.6 秒 = 撬锁，偷偷进去看，本子依旧保持上锁
 */
export function BookLock({ book, onUnlock, onSneak, onClose }: Props) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const [asking, setAsking] = useState(false);
  const [holding, setHolding] = useState(0); // 0~1 撬锁进度
  const [showHint, setShowHint] = useState(false);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const fail = () => {
    setErr('密码不对，再想想');
    setShake(true);
    setCode('');
    window.setTimeout(() => setShake(false), 420);
  };

  const submit = (next: string) => {
    if (next === book.lockCode) {
      onUnlock();
      return;
    }
    fail();
  };

  const press = (d: string) => {
    if (code.length >= LOCK_CODE_LEN) return;
    const next = code + d;
    setCode(next);
    setErr('');
    if (next.length === LOCK_CODE_LEN) window.setTimeout(() => submit(next), 110);
  };

  const startHold = () => {
    if (rafRef.current != null) return;
    t0Ref.current = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0Ref.current) / HOLD_MS);
      setHolding(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        setHolding(0);
        onSneak();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  /** allowTap：手指/鼠标真的抬起来才算「点一下」；滑出边界不算 */
  const stopHold = (allowTap: boolean) => {
    const held = performance.now() - t0Ref.current;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHolding(0);
    if (allowTap && held < TAP_MS) {
      setErr('');
      setShowHint(false);
      setAsking(true);
    }
  };

  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[1300] flex flex-col bg-page-bg" data-testid="diary-lock">
      {/* 顶栏：只留返回，不铺任何标题 */}
      <header className="flex items-center gap-2 px-2 pb-1 pt-3">
        <button type="button" onClick={onClose} aria-label="回到书架" className="icon-btn">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="truncate text-[11px] tracking-[0.16em] text-muted-foreground/70" style={{ fontFamily: HAND_FONT }}>
          {book.name}
        </span>
      </header>

      {/* 这一面：一整张灰纸 + 一把锁 */}
      <div className="flex flex-1 flex-col px-3 pb-4">
        <div
          className="relative mx-auto flex h-full w-full max-w-sm flex-col items-center justify-center overflow-hidden rounded-[10px] bg-[#e9e7e3] shadow-[0_18px_40px_-26px_rgba(0,0,0,0.45)] dark:bg-[#353230]"
          data-testid="diary-lock-sheet"
        >
          {/* 锁：点一下开键盘，长按 2.6 秒撬锁 */}
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={() => stopHold(true)}
            onPointerLeave={() => stopHold(false)}
            onPointerCancel={() => stopHold(false)}
            aria-label="解锁（长按可以撬锁）"
            data-testid="diary-lock-hold"
            className="relative flex h-28 w-28 select-none items-center justify-center rounded-full [-webkit-touch-callout:none]"
            style={{ touchAction: 'none' }}
          >
            <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-28 w-28 -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={holding > 0 ? 'text-white/40 dark:text-white/20' : 'text-transparent'}
              />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="text-primary transition-[stroke-dashoffset] duration-75"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - holding)}
              />
            </svg>
            {holding >= 1 ? (
              <Unlock className="h-12 w-12 text-primary" />
            ) : (
              <Lock
                className={`h-12 w-12 transition-colors ${holding > 0 ? 'text-primary' : 'text-ink/35'}`}
                strokeWidth={1.6}
              />
            )}
          </button>

          <p
            className="mt-3 text-[13px] text-ink/45"
            style={{ fontFamily: HAND_FONT }}
            data-testid="diary-lock-tip"
          >
            {holding > 0 ? '撬锁中…' : '这本上了锁'}
          </p>
          {holding <= 0 && (
            <p className="mt-1 text-[10px] tracking-wide text-ink/30">点一下锁，输入 4 位密码</p>
          )}

          {/* 密码：点锁之后才出现，浮在灰面下半部 */}
          {asking && (
            <div className="mt-5 flex flex-col items-center" data-testid="diary-lock-pad">
              <div className={`mb-2 flex gap-3 ${shake ? 'animate-[shake_0.4s_ease]' : ''}`} data-testid="diary-lock-dots">
                {Array.from({ length: LOCK_CODE_LEN }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full transition ${
                      i < code.length ? 'bg-ink/70' : 'border border-ink/25'
                    }`}
                  />
                ))}
              </div>
              <p className="h-4 text-[11px] text-rose-500" data-testid="diary-lock-err">
                {err}
              </p>

              <div className="mt-1 grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => press(d)}
                    data-testid={`diary-lock-key-${d}`}
                    className="h-12 w-12 rounded-full text-base font-medium text-ink/80 transition active:scale-95 active:bg-black/5"
                  >
                    {d}
                  </button>
                ))}
                <span />
                <button
                  type="button"
                  onClick={() => press('0')}
                  data-testid="diary-lock-key-0"
                  className="h-12 w-12 rounded-full text-base font-medium text-ink/80 transition active:scale-95 active:bg-black/5"
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
                  className="flex h-12 w-12 items-center justify-center rounded-full text-ink/40 transition active:scale-95 active:bg-black/5"
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* 没在输密码时：给一句轻提示，避免不知道要干嘛；撬锁说明藏在「忘记了？」 */}
          {!asking && (
            <button
              type="button"
              onClick={() => setShowHint((v) => !v)}
              data-testid="diary-lock-forgot"
              className="mt-6 text-[11px] text-ink/35 underline-offset-4 transition hover:text-ink/60 hover:underline"
            >
              忘记了？
            </button>
          )}
          {showHint && !asking && (
            <p className="mt-2 px-8 text-center text-[11px] leading-5 text-ink/40" data-testid="diary-lock-hint">
              别声张，长按这把锁 3 秒，
              <br />
              能撬开——只是这次偷看，锁不会解开。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

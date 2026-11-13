import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Delete, Lock, Unlock } from 'lucide-react';
import type { DiaryBook } from './diaryData';
import { HAND_FONT, LOCK_CODE_LEN } from './diaryData';

interface Props {
  book: DiaryBook;
  /** 密码正确：正常解锁（本次会话有效） */
  onUnlock: () => void;
  /** 长按锁孔「撬锁」：偷偷看，本子仍然上锁 */
  onSneak: () => void;
  onClose: () => void;
}

/** 长按多久算撬开 */
const HOLD_MS = 2600;

/**
 * 上锁本子的锁屏（2026-11-13）：
 * - 4 位数字键盘，输满自动校验；错了抖一下并清空
 * - 长按锁孔 2.6 秒 = 撬锁，偷偷进去看，本子依旧保持上锁
 */
export function BookLock({ book, onUnlock, onSneak, onClose }: Props) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  const [holding, setHolding] = useState(0); // 0~1 撬锁进度
  const [showHint, setShowHint] = useState(false);
  const rafRef = useRef<number | null>(null);

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
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS);
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

  const cancelHold = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHolding(0);
  };

  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[1300] flex flex-col bg-page-bg" data-testid="diary-lock">
      {/* 顶栏 */}
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        <button type="button" onClick={onClose} aria-label="回到书架" className="icon-btn">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-[11px] tracking-[0.2em] text-muted-foreground">LOCKED</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        {/* 本子封面缩略 */}
        <div
          className="mb-5 flex h-24 w-[76px] items-end rounded-md p-2 shadow-[0_14px_28px_-18px_rgba(0,0,0,0.6)]"
          style={{ background: book.cover }}
        >
          <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-white/90" style={{ fontFamily: HAND_FONT }}>
            {book.name}
          </span>
        </div>

        {/* 锁孔：长按撬锁 */}
        <button
          type="button"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          aria-label="长按撬锁"
          data-testid="diary-lock-hold"
          className="relative mb-4 flex h-24 w-24 select-none items-center justify-center rounded-full [-webkit-touch-callout:none]"
          style={{ touchAction: 'none' }}
        >
          <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-24 w-24 -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="2" className="text-page-line" />
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
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full border transition ${
              holding > 0 ? 'border-primary/60 bg-primary/10' : 'border-page-line bg-muted/40'
            }`}
          >
            {holding >= 1 ? <Unlock className="h-7 w-7 text-primary" /> : <Lock className="h-7 w-7 text-foreground/70" />}
          </span>
        </button>

        <p className="mb-1 text-sm font-medium text-foreground" style={{ fontFamily: HAND_FONT }}>
          {holding > 0 ? '撬锁中…' : '这本上了锁'}
        </p>

        {/* 密码格 */}
        <div className={`my-3 flex gap-3 ${shake ? 'animate-[shake_0.4s_ease]' : ''}`} data-testid="diary-lock-dots">
          {Array.from({ length: LOCK_CODE_LEN }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition ${
                i < code.length ? 'bg-foreground' : 'border border-foreground/25'
              }`}
            />
          ))}
        </div>

        <p className="h-4 text-[11px] text-rose-500" data-testid="diary-lock-err">
          {err}
        </p>

        {/* 键盘 */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              data-testid={`diary-lock-key-${d}`}
              className="h-14 w-14 rounded-full text-lg font-medium text-foreground transition active:scale-95 active:bg-muted"
            >
              {d}
            </button>
          ))}
          <span />
          <button
            type="button"
            onClick={() => press('0')}
            data-testid="diary-lock-key-0"
            className="h-14 w-14 rounded-full text-lg font-medium text-foreground transition active:scale-95 active:bg-muted"
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
            className="flex h-14 w-14 items-center justify-center rounded-full text-muted-foreground transition active:scale-95 active:bg-muted"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        {/* 忘记密码 → 撬锁提示 */}
        <button
          type="button"
          onClick={() => setShowHint((v) => !v)}
          data-testid="diary-lock-forgot"
          className="mt-6 text-[11px] text-muted-foreground/60 underline-offset-4 transition hover:text-muted-foreground hover:underline"
        >
          忘记了？
        </button>
        {showHint && (
          <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground/70" data-testid="diary-lock-hint">
            别声张，长按上面的锁孔 3 秒，
            <br />
            能撬开——只是这次偷看，锁不会解开。
          </p>
        )}
      </div>
    </div>
  );
}

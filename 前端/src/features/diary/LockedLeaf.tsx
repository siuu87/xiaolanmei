import { Lock } from 'lucide-react';
import { HAND_FONT, PAGE_LOCK_KNOCKS, weekdayOf } from './diaryData';
import type { PageBox } from './pageLayout';

interface Props {
  /** 这页是哪一天 YYYY-MM-DD */
  date: string;
  /** 纸页尺寸（跟 DlogLeaf 完全一致，锁面就是这页纸本身） */
  box: PageBox;
  /** 已经敲了几下 */
  knocks: number;
  /** TA 最新那一句反应（敲完才出现） */
  line?: string;
  /** 敲敲请求飞着的时候禁掉，免得连点十下 */
  busy?: boolean;
  onAskCode: () => void;
  onKnock: () => void;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 上锁的一页（2026-11-15）：
 *
 * 就是把那一张纸换成灰的 —— 大小、圆角、页眉位置跟 `DlogLeaf` 一模一样，
 * 翻页时看不出是另一套东西。纸上的内容一个字都不渲染（连贴纸也没有），
 * 中间一把锁，下面两条路：**输密码**（这一次能看，锁还在）和 **敲敲**
 * （每敲一下 TA 会收到提醒，敲够 `PAGE_LOCK_KNOCKS` 下 TA 来替你打开）。
 */
export function LockedLeaf({ date, box, knocks, line, busy, onAskCode, onKnock }: Props) {
  const [, m, d] = date.split('-');
  const rows = Math.max(6, Math.floor((box.h - 74 - 40) / 26));

  return (
    <div
      className="relative overflow-hidden rounded-[7px] bg-[#e9e7e3] shadow-[0_18px_34px_-18px_rgba(0,0,0,0.55)] dark:bg-[#353230]"
      style={{ width: box.w, height: box.h }}
      data-testid="diary-leaf-locked"
      data-knocks={knocks}
    >
      {/* 蒙住的那页也有横格，只是很淡 —— 还是同一张纸 */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute left-[30px] right-5 h-px bg-black/[0.045] dark:bg-white/[0.035]"
          style={{ top: 74 + i * 26 + 12 }}
        />
      ))}

      {/* 页眉：日期还在，只是压成灰的 */}
      <div
        className="absolute inset-x-0 top-0 flex items-end justify-between px-[30px] pt-3"
        style={{ height: 62 }}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold leading-none tabular-nums text-ink/40">{d}</span>
          <span className="text-[10px] leading-none tracking-[0.08em] text-ink/25">
            {m} 月 · 星期{WEEK[weekdayOf(date)]}
          </span>
        </div>
        <span className="text-[9px] leading-none tracking-[0.06em] text-ink/30">锁着</span>
      </div>

      {/* 中间：锁 + 两条路 */}
      <div className="absolute inset-x-0 bottom-0 top-[62px] flex flex-col items-center justify-center px-6 pb-8">
        <button
          type="button"
          onClick={onAskCode}
          aria-label="输入密码"
          data-testid="diary-leaf-lock-icon"
          className="flex h-20 w-20 items-center justify-center rounded-full transition active:scale-95"
        >
          <Lock className="h-9 w-9 text-ink/30" strokeWidth={1.5} />
        </button>

        <p className="mt-1 text-[12px] text-ink/45" style={{ fontFamily: HAND_FONT }}>
          这一页锁着
        </p>

        {/* 敲门的进度：三个小点，敲一下就填一个 */}
        <div className="mt-2.5 flex items-center gap-2" data-testid="diary-leaf-knock-dots">
          {Array.from({ length: PAGE_LOCK_KNOCKS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition ${
                i < knocks ? 'bg-ink/55' : 'border border-ink/20'
              }`}
            />
          ))}
        </div>

        {/* TA 那一句反应：高度钉死，免得敲一下整页往下跳 */}
        <p
          className="mt-2 flex h-8 max-w-[240px] items-center justify-center text-center text-[11px] leading-relaxed text-ink/40"
          style={{ fontFamily: HAND_FONT }}
          data-testid="diary-leaf-knock-line"
        >
          {line || '敲敲门，里面的人会听见'}
        </p>

        <div className="mt-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onAskCode}
            data-testid="diary-leaf-ask-code"
            className="rounded-full bg-ink/80 px-4 py-2 text-[12px] text-page-bg active:scale-95"
          >
            输入密码
          </button>
          <button
            type="button"
            onClick={onKnock}
            disabled={busy}
            data-testid="diary-leaf-knock"
            className="flex items-center gap-1.5 rounded-full border border-ink/25 px-4 py-2 text-[12px] text-ink/70 active:scale-95 disabled:opacity-50"
          >
            敲敲
            <span className="text-[10px] text-ink/35">{knocks}/{PAGE_LOCK_KNOCKS}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

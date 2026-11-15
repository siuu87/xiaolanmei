import { Lock, StickyNote } from 'lucide-react';
import type { DiarySlip } from './diaryData';
import { HAND_FONT, weekdayOf } from './diaryData';
import type { PageBox } from './pageLayout';

interface Props {
  /** 这页是哪一天 YYYY-MM-DD */
  date: string;
  /** 纸页尺寸（跟 DlogLeaf 完全一致，锁面就是这页纸本身） */
  box: PageBox;
  /** TA 从门缝塞出来的纸条（只显示最后一张） */
  slip?: DiarySlip;
  /** 这页被撬进来过（页脚留一行小字，提醒「他知道」） */
  sneaked?: boolean;
  onAskCode: () => void;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 上锁的一页（2026-11-15 立，2026-11-16 收成只剩一把锁）：
 *
 * 就是把那一张纸换成灰的 —— 大小、圆角、页眉位置跟 `DlogLeaf` 一模一样，
 * 翻页时看不出是另一套东西。纸上的内容一个字都不渲染（连贴纸也没有），
 * 中间一把锁，点它就是输密码（4 位对了这次就能看，锁还留在这一天）。
 *
 * 2026-11-16 起**撤掉了「敲敲」那条路**：锁页只留「输入密码」一个入口，
 * 不再有「敲一下看他开不开」。忘了密码还有密码面板里输错两次后的「撬开」。
 */
export function LockedLeaf({ date, box, slip, sneaked, onAskCode }: Props) {
  const [, m, d] = date.split('-');
  const rows = Math.max(6, Math.floor((box.h - 74 - 90) / 26));

  return (
    <div
      className="relative overflow-hidden rounded-[7px] bg-[#e9e7e3] shadow-[0_18px_34px_-18px_rgba(0,0,0,0.55)] dark:bg-[#353230]"
      style={{ width: box.w, height: box.h }}
      data-testid="diary-leaf-locked"
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

      {/* 中间：一把锁（点它 / 点下面那个按钮，都是输密码） */}
      <div
        className="absolute inset-x-0 bottom-0 top-[62px] flex flex-col items-center justify-center px-6"
        style={{ paddingBottom: slip ? 112 : 30 }}
      >
        <button
          type="button"
          onClick={onAskCode}
          aria-label="输入密码"
          data-testid="diary-leaf-lock-icon"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:scale-95"
        >
          <Lock className="h-9 w-9 text-ink/30" strokeWidth={1.5} />
        </button>

        <p className="mt-1 text-[12px] text-ink/45" style={{ fontFamily: HAND_FONT }}>
          这一页锁着
        </p>

        {/* 原来这里是 TA 敲完那句话的位置：高度继续钉死，换成一句静态说明 */}
        <p
          className="mt-1 flex h-8 max-w-[240px] items-center justify-center text-center text-[11px] leading-relaxed text-ink/40"
          style={{ fontFamily: HAND_FONT }}
          data-testid="diary-leaf-lock-hint"
        >
          输 4 位密码就能看，锁还留在这一天
        </p>

        <div className="mt-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onAskCode}
            data-testid="diary-leaf-ask-code"
            className="rounded-full bg-ink/80 px-4 py-2 text-[12px] text-page-bg active:scale-95"
          >
            输入密码
          </button>
        </div>
      </div>

      {/* 他从门缝里塞出来的纸条：贴在纸的下沿，像真的从底下推进来的 */}
      {slip && (
        <div
          className="absolute inset-x-5 bottom-6 rotate-[-1.2deg] rounded-[2px] px-3 py-2 shadow-[0_10px_18px_-14px_rgba(0,0,0,0.8)]"
          style={{ background: slip.color }}
          data-testid="diary-leaf-ta-slip"
        >
          <div className="mb-0.5 flex items-center gap-1">
            <StickyNote className="h-3 w-3 text-[#3b3830]/45" />
            <span className="text-[9px] tracking-[0.06em] text-[#3b3830]/50">他塞进来的</span>
          </div>
          <p
            className="max-h-[32px] overflow-hidden whitespace-pre-wrap text-[10px] leading-[16px] text-[#3b3830]"
            style={{ fontFamily: HAND_FONT }}
          >
            {slip.content}
          </p>
        </div>
      )}

      {/* 撬过这页：页脚一行小字，提醒「他知道」 */}
      {sneaked && (
        <span
          className="absolute bottom-1.5 left-[30px] text-[9px] tracking-[0.06em] text-ink/25"
          style={{ fontFamily: HAND_FONT }}
        >
          你撬开过这页
        </span>
      )}
    </div>
  );
}

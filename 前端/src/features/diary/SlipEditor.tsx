import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, Trash2 } from 'lucide-react';
import type { DiarySlip } from './diaryData';
import { HAND_FONT, SLIP_MAX, SLIP_PALETTE } from './diaryData';

interface Props {
  /** 传入 = 编辑已有纸条；不传 = 新夹一张 */
  slip?: DiarySlip | null;
  date: string;
  onSave: (content: string, color: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** 2026.11.13 这种点分日期 */
function dotted(date: string): string {
  return date.replace(/-/g, '.');
}

/**
 * 小纸条编辑器（2026-11-13）：
 * 「TA 的日记」写不了，只能夹一张纸条 —— 一张淡色便条、几行楷体手写，
 * 底下选纸色。整屏纯色不透明（不用半透明遮罩），保存后回本子的翻页页，
 * 纸条就压在那一天的纸面上。
 */
export function SlipEditor({ slip, date, onSave, onDelete, onClose }: Props) {
  const [content, setContent] = useState(slip?.content ?? '');
  const [color, setColor] = useState(slip?.color ?? SLIP_PALETTE[0]);
  const [confirmDel, setConfirmDel] = useState(false);

  // Esc 关（capture 阶段，别让底下的浮层抢）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const canSave = content.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[1360] flex flex-col bg-page-bg" data-testid="diary-slip-editor">
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <button type="button" onClick={onClose} aria-label="返回本子" className="icon-btn">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="eyebrow leading-none">{slip ? 'SLIP' : 'NEW SLIP'}</div>
          <div className="mt-0.5 truncate text-sm font-medium text-foreground">
            {slip ? '改这张纸条' : '夹一张小纸条'} · {dotted(date)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => canSave && onSave(content.trim(), color)}
          disabled={!canSave}
          data-testid="diary-slip-save"
          className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition enabled:hover:opacity-90 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          夹进去
        </button>
      </header>

      <div className="flex flex-1 flex-col justify-center px-5 pb-6">
        {/* 纸条本体：稍微歪一点，像真夹在页间 */}
        <div
          className="-rotate-[1.2deg] rounded-[3px] p-1 shadow-[0_16px_34px_-18px_rgba(0,0,0,0.5)]"
          style={{ background: color }}
          data-testid="diary-slip-paper"
        >
          <div className="relative rounded-[2px] px-4 pb-4 pt-5">
            {/* 顶部胶带 */}
            <span
              aria-hidden
              className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-2 bg-white/65 shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
            />
            <p className="mb-1 text-[10px] tracking-[0.16em] text-[#3a3730]/45" style={{ fontFamily: HAND_FONT }}>
              留给 TA
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, SLIP_MAX))}
              placeholder="写几句就好，别太长……"
              autoFocus
              data-testid="diary-slip-textarea"
              className="h-[38vh] w-full resize-none bg-transparent text-[15px] text-[#3a3730] outline-none placeholder:text-[#3a3730]/30"
              style={{ fontFamily: HAND_FONT, lineHeight: '27px' }}
            />
            <div className="mt-1 text-right text-[10px] tabular-nums text-[#3a3730]/35">
              {content.length} / {SLIP_MAX}
            </div>
          </div>
        </div>

        {/* 纸条颜色 */}
        <div className="mt-5 flex items-center justify-center gap-2.5">
          {SLIP_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`纸条颜色 ${c}`}
              className={`h-7 w-7 rounded-full transition ${
                color === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-page-bg' : 'hover:scale-110'
              }`}
              style={{ background: c, border: '1px solid rgba(0,0,0,0.06)' }}
            />
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
          TA 的日记你写不了，但可以留张纸条压在那一页上
        </p>
      </div>

      {slip && onDelete && (
        <footer className="flex justify-center pb-4">
          <button
            type="button"
            onClick={() => {
              if (!confirmDel) {
                setConfirmDel(true);
                window.setTimeout(() => setConfirmDel(false), 3000);
                return;
              }
              onDelete();
            }}
            data-testid="diary-slip-delete"
            className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDel ? '再点一次，撕掉这张' : '撕掉这张纸条'}
          </button>
        </footer>
      )}
    </div>,
    document.body,
  );
}

import type { DiaryEntry } from './diaryData';
import { AUTHOR_LABEL, AUTHOR_CLASS } from './diaryData';

interface Props {
  entry: DiaryEntry;
  /** 是否可编辑（由上层控制） */
  editing?: boolean;
  /** 编辑值（受控） */
  draftContent?: string;
  onDraftChange?: (v: string) => void;
  /** 编辑态底部操作 */
  footer?: React.ReactNode;
}

/** 把日期「9月28日」格式化 */
function fmtDate(date: string): { md: string; y: string } {
  const [y, m, d] = date.split('-').map(Number);
  return { md: `${m}月${d}日`, y: String(y) };
}

/**
 * 日记本单页（Paper 风）：左侧装订线 + 纸面 + 日期抬头 + 正文。
 * 翻页卡与全屏阅读器共用，保证两边视觉一致。
 */
export function DiaryPageFace({ entry, editing, draftContent, onDraftChange, footer }: Props) {
  const { md, y } = fmtDate(entry.date);
  const content = editing ? (draftContent ?? '') : entry.content;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 纸面 */}
      <div className="relative flex-1 overflow-y-auto px-6 pb-6 pt-4">
        {/* 左侧装订线（书脊） */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-2"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.10), rgba(0,0,0,0.02) 40%, rgba(0,0,0,0.05))',
          }}
        />
        {/* 日期抬头 */}
        <div className="mb-4 flex items-baseline gap-2">
          <span className="font-serif text-2xl font-medium leading-none tracking-tight text-ink">
            {md}
          </span>
          <span className="text-xs text-ink/40">{y}</span>
        </div>
        {/* 谁写的 */}
        <div className={`mb-3 text-sm font-medium ${AUTHOR_CLASS[entry.author]}`}>
          {AUTHOR_LABEL[entry.author]}
        </div>
        {/* 正文 */}
        {editing ? (
          <textarea
            value={content}
            onChange={(e) => onDraftChange?.(e.target.value)}
            placeholder="今天……写点什么吧"
            className="h-full min-h-48 w-full resize-none bg-transparent text-[15px] leading-7 text-ink outline-none placeholder:text-ink/30"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink/90">
            {content || <span className="text-ink/25">（空白页）</span>}
          </p>
        )}
      </div>
      {/* 编辑态底部操作 */}
      {footer && <div className="px-6 pb-4">{footer}</div>}
    </div>
  );
}

/** 纸面底色（Paper 米白纸）——翻页卡与阅读器共用 */
export const PAPER_CLASS =
  'bg-[#fdfbf6] text-[#3d3a35] dark:bg-[#221f1c] dark:text-[#d8d2c7]';

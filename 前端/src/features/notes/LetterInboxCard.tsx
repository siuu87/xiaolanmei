import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShellStore } from '@/stores/shellStore';
import { useNotesStore } from './notesStore';
import { dateKey } from './notesData';

/** 短日期：2026.10.13 */
function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 深夜来信 · 收信匣
 *
 * - 默认展示**今日**的那封信；今天还没来信就退回最近一封（信件按时间新→旧排，
 *   所以默认就是最新那封）。
 * - 左上角「红点 + 第 N 封」：红点 = **今日的信已经到了**，点卡片看过后熄灭
 *   （记在 localStorage 的 readIds 里，只跟这台设备有关）。
 * - 右上角信封 → 收录所有信件的页面（/notes）。
 * - **不再需要点开才看全文**：正文默认全展开。
 * - 换信控件（计数 + ‹ ›）固定在卡片**右下角**，正文区高度写死，
 *   所以它不会随来信长短上下跳；卡片上左右滑也能换信。
 *
 * 手势坑（别删注释）：抽屉的「左滑关闭」在 window 上监听，这里必须打
 * `data-no-drawer-swipe` 把横向手势让给自己；滑动结束浏览器补的 click
 * 要用 `swiped` 标记拦掉，不然「换一封」会被当成「看过」。
 */
export function LetterInboxCard({
  maxLetters = 30,
  className,
}: {
  maxLetters?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const closeDrawer = useShellStore((s) => s.closeDrawer);

  const notes = useNotesStore((s) => s.notes);
  const readIds = useNotesStore((s) => s.readIds);
  const markRead = useNotesStore((s) => s.markRead);

  const [index, setIndex] = useState(0);

  const list = notes.slice(0, maxLetters);
  const i = list.length ? Math.min(index, list.length - 1) : 0;
  const note = list[i] ?? null;

  const todayKey = dateKey();
  const fromToday = note ? dateKey(new Date(note.createdAt)) === todayKey : false;
  const unseen = note ? !readIds.includes(note.id) : false;
  // 红点只在「今天的信到了、你还没看」的时候亮
  const dotOn = fromToday && unseen;

  /* ---------- 左右滑换信 ---------- */
  const start = useRef<{ x: number; y: number } | null>(null);
  /**
   * 滑完浏览器会补一发 click，得拦掉，否则「换一封」会被当成「看过」。
   * 这里记的是**时间戳**而不是布尔标记：布尔标记会粘住 —— 万一那一发
   * click 没来（合成事件、触摸被取消、滑出元素外松手），标记就永远清不掉，
   * 下一记真正的点击也会被误吞，红点就再也点不灭了。
   */
  const lastSwipeAt = useRef(0);
  const SWIPE_CLICK_GRACE_MS = 400;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    start.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 42 && Math.abs(dy) < 48 && list.length > 1) {
      lastSwipeAt.current = Date.now();
      setIndex(Math.max(0, Math.min(list.length - 1, i + (dx < 0 ? 1 : -1))));
    }
  };

  // 点卡片 = 看过这封信 → 红点熄灭
  const onClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-flip]')) return;
    if (Date.now() - lastSwipeAt.current < SWIPE_CLICK_GRACE_MS) return;
    if (note) markRead(note.id);
  };

  const goAll = () => {
    closeDrawer();
    navigate('/notes');
  };

  // 最老的一封 = 1；按**全部**来信算，翻到第 30 封以后编号也不会卡住
  const seq = notes.length - i;
  const stamp = note ? note.createdAt : Date.now();

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 280, damping: 32 }}
      data-testid="letter-inbox"
      data-dot={dotOn ? '1' : '0'}
      data-no-drawer-swipe
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-[18px] border border-border bg-card p-3.5 text-card-foreground',
        'shadow-[0_8px_24px_-18px_hsl(var(--shadow-color)/0.28)] transition-colors duration-300',
        'hover:border-primary/30',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />

      {/* 顶栏：左「红点 + 第 N 封」｜右「换信 + 全部来信」
          换信控件固定挂在顶栏，正文再长再短都不会把它顶下去 */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-label={dotOn ? '今日来信已到' : '今日暂无新信'}
            data-testid="mail-dot"
            className={cn(
              'block h-[7px] w-[7px] shrink-0 rounded-full transition-all duration-500',
              dotOn
                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.75)]'
                : 'bg-border',
            )}
          />
          <span
            data-testid="mail-seq"
            className="font-letter text-[12px] leading-none tracking-[0.08em] text-foreground"
          >
            第 {seq} 封
          </span>
        </span>

        <button
          type="button"
          data-testid="mail-all"
          data-no-flip
          onClick={goAll}
          aria-label="查看全部来信"
          title="全部来信"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          <Mail className="h-4 w-4" />
        </button>
      </div>

      {/* 日期 */}
      <p
        data-testid="mail-date"
        className="mt-2.5 text-[11px] font-light tabular-nums text-muted-foreground"
      >
        {shortDate(stamp)}
      </p>

      {/* 正文：**固定高度**（4 行）。
          卡片不再随来信字数伸缩 —— 换信时上方那排切换键就不会上下跳。
          正文依旧默认全展开（没有点击展开、没有 line-clamp、没有渐隐），
          超出 4 行的长信在块内滚动，内容不丢；没有信时这里放居中的放大信封。 */}
      <div className="mt-1.5 h-[84px]" data-testid="mail-body-box">
        {note ? (
          <p
            data-testid="mail-body"
            className="h-full overflow-y-auto overscroll-contain whitespace-pre-wrap pr-1 text-[13px] leading-[21px] tracking-[0.01em] text-card-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {note.content}
          </p>
        ) : (
          <button
            type="button"
            data-testid="mail-empty-envelope"
            onClick={goAll}
            aria-label="还没有来信，去全部来信看看"
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1.5"
          >
            <Mail className="h-9 w-9 text-muted-foreground/50 transition-colors duration-300 hover:text-muted-foreground" />
            <span className="text-[10px] font-light tracking-wide text-muted-foreground">
              今天还没有信
            </span>
          </button>
        )}
      </div>

      {/* 换信：固定在**右下角**（计数 + ‹ ›，多于一封才出现）。
          正文区是固定高度，所以这一条不会随来信长短上下跳。 */}
      {list.length > 1 && (
        <div className="mt-2 flex items-center justify-end gap-1" data-no-flip>
          <span
            data-testid="mail-counter"
            className="mr-0.5 text-[9px] font-light tabular-nums tracking-wider text-muted-foreground"
          >
            {String(i + 1).padStart(2, '0')} / {String(list.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            data-testid="mail-prev"
            aria-label="上一封"
            disabled={i === 0}
            onClick={() => setIndex(Math.max(0, i - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="mail-next"
            aria-label="下一封"
            disabled={i === list.length - 1}
            onClick={() => setIndex(Math.min(list.length - 1, i + 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

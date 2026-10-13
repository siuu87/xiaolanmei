import { useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNoteDate, type InspirationNote } from './notesData';

/**
 * 堆叠信件文件夹卡片（纯 UI，不读取任何本地真实文件）
 *
 * - 外层卡片：简约文件夹样式，毛玻璃、圆角、低饱和配色；
 * - 卡片内部是**堆叠的信件**：好几张信错落叠在一起，露出边缘层次感；
 * - 点击卡片平滑展开面板，再点收起；
 * - 展开后同一摞信支持左右滑动切换，单张点击放大查看全文；
 * - hover 整卡轻微上浮提亮，柔和过渡；
 * - 多个文件夹按月份归档组成列表，每个文件夹里存多封信。
 *
 * 只服务信箱这一个模块，不依赖页面布局，也不改其他页面。
 */

/* ------------------------------ 归档 ------------------------------ */

export interface FolderGroup {
  key: string; // YYYY-MM
  title: string; // 2026年10月
  notes: InspirationNote[]; // 新→旧
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(key: string): string {
  const [y, m] = key.split('-');
  return `${y}年${Number(m)}月`;
}

/** 按月份归档，新月份在前；同月内新的在前 */
export function groupByMonth(notes: InspirationNote[]): FolderGroup[] {
  const map = new Map<string, InspirationNote[]>();
  for (const n of notes) {
    const k = monthKey(n.createdAt);
    const arr = map.get(k);
    if (arr) arr.push(n);
    else map.set(k, [n]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => ({
      key,
      title: monthTitle(key),
      notes: [...list].sort((a, b) => b.createdAt - a.createdAt),
    }));
}

/* ------------------------------ 一封信 ------------------------------ */

/** 低饱和信封：米白纸片 + 一道 V 形封盖线，干净柔和，不加多余装饰 */
export function EnvelopeFace({
  note,
  showBody,
  className,
}: {
  note: InspirationNote;
  showBody: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden rounded-[7px]',
        'bg-gradient-to-b from-[#f2ece1] to-[#e4dbc9] text-[#4a4034]',
        'shadow-[0_5px_16px_rgba(0,0,0,0.24)] ring-1 ring-black/[0.05]',
        className,
      )}
    >
      {/* V 形封盖线 */}
      <svg
        viewBox="0 0 100 44"
        preserveAspectRatio="none"
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[40%] w-full"
      >
        <path d="M0 0 L50 44 L100 0 Z" fill="#ddd2bc" />
        <path
          d="M0 0 L50 44 L100 0 Z"
          fill="none"
          stroke="#c7bba1"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {showBody ? (
        <div className="relative z-10 flex h-full flex-col p-3 pt-[48%]">
          <p className="line-clamp-3 text-[11px] leading-[17px]">{note.content}</p>
          <span className="mt-auto text-right text-[9px] text-[#8a7f6d]">
            {formatNoteDate(note.createdAt)}
          </span>
        </div>
      ) : (
        <span className="relative z-10 mt-auto block p-2 text-right text-[8px] text-[#9a8f7c]">
          {formatNoteDate(note.createdAt)}
        </span>
      )}
    </div>
  );
}

/* ------------------------------ 堆叠 + 滑动 ------------------------------ */

const SWIPE = 46; // 拖过这个距离算翻一封信
/** 收起态：小尺寸一摞；展开态：变大、当前张显示正文 */
const BOX = { closed: 96, open: 200 };
const CARD = { closedW: 96, closedH: 78, openW: 176, openH: 172 };

/**
 * 一摞信：错落叠放，露出边缘层次。
 * `expanded` 时整摞变大、当前信显示正文、且可以左右拖动 / 点箭头切换。
 */
function LetterStack({
  notes,
  index,
  onIndex,
  expanded,
  onOpen,
  unreadIds,
}: {
  notes: InspirationNote[];
  index: number;
  onIndex: (i: number) => void;
  expanded: boolean;
  onOpen: (id: string) => void;
  unreadIds: string[];
}) {
  const cur = Math.min(index, notes.length - 1);
  const go = (d: number) => onIndex(Math.max(0, Math.min(notes.length - 1, cur + d)));

  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE) go(1);
    else if (info.offset.x > SWIPE) go(-1);
  };

  // 拖完手一松浏览器还会补一个 click，靠「按下→抬起位移」把它和真正的点击分开
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
  };
  const clickOpen = (e: MouseEvent, id: string) => {
    if (!expanded) return;
    const p = down.current;
    // detail === 0 是 element.click() 这类程序化点击，没有按下/抬起的位移可言，直接放行
    const programmatic = e.detail === 0;
    if (!programmatic && p && Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 8) return;
    onOpen(id);
  };

  return (
    <motion.div
      initial={false}
      animate={{ height: expanded ? BOX.open : BOX.closed }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <motion.div
        drag={expanded ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
        className={cn(
          'relative flex h-full items-center justify-center',
          expanded && notes.length > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
        data-testid="letter-stack"
        /* 这里是横向滑动区：抽屉的「左滑关闭」手势会跳过它，
           否则在抽屉里左滑切信会顺手把抽屉一起关掉。 */
        data-no-drawer-swipe
      >
        {notes.map((n, i) => {
          const d = i - cur; // 相对当前张的位置：0=最前，>0=后面
          const active = d === 0;
          const unread = unreadIds.includes(n.id);

          // 错落叠放：后面的依次往右下挪一点、转一点、缩一点、压在下面
          const x = d * 8;
          const y = d * 7;
          const rotate = d * 6;
          const scale = 1 - Math.min(Math.abs(d), 4) * 0.045;
          const opacity = Math.abs(d) > 3 ? 0 : d < 0 ? 0.5 : 1;

          return (
            <motion.div
              key={n.id}
              className="absolute"
              style={{ zIndex: expanded ? 30 - d : notes.length - i }}
              initial={false}
              animate={{ x, y, rotate, scale, opacity }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 28,
                mass: 0.9,
              }}
              data-testid="letter-card"
              data-active={active}
            >
              {active ? (
                <button
                  type="button"
                  onPointerDown={onPointerDown}
                  onClick={expanded ? (e) => clickOpen(e, n.id) : undefined}
                  aria-label={`放大查看 ${formatNoteDate(n.createdAt)} 的来信`}
                  data-testid="letter-card-active"
                  data-note-id={n.id}
                  className="block transition hover:brightness-[1.03]"
                  style={{ width: expanded ? CARD.openW : CARD.closedW, height: expanded ? CARD.openH : CARD.closedH }}
                >
                  <EnvelopeFace note={n} showBody={expanded} />
                  {unread && (
                    <span
                      aria-label="未读"
                      data-testid="letter-card-unread"
                      className="absolute right-1.5 top-1.5 block h-1.5 w-1.5 rounded-full bg-primary"
                    />
                  )}
                </button>
              ) : (
                <div
                  className="pointer-events-none"
                  style={{ width: expanded ? CARD.openW : CARD.closedW, height: expanded ? CARD.openH : CARD.closedH }}
                >
                  <EnvelopeFace note={n} showBody={false} />
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* 展开态：左右切换箭头 + 页码 */}
      {expanded && notes.length > 1 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={cur === 0}
            aria-label="上一封"
            data-testid="stack-prev"
            className="absolute left-1 top-[-118px] z-40 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#141a2b]/80 text-[#dfe4ef] backdrop-blur transition hover:bg-[#1b2338] disabled:opacity-25"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={cur === notes.length - 1}
            aria-label="下一封"
            data-testid="stack-next"
            className="absolute right-1 top-[-118px] z-40 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#141a2b]/80 text-[#dfe4ef] backdrop-blur transition hover:bg-[#1b2338] disabled:opacity-25"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <p className="pt-1 text-center text-[9px] text-[#6b7488]" data-testid="stack-pager">
            {cur + 1} / {notes.length}
          </p>
        </div>
      )}
    </motion.div>
  );
}

/* ------------------------------ 文件夹卡片 ------------------------------ */

export function FolderCard({
  group,
  readIds,
  onOpen,
  maxSlips,
  defaultOpen = false,
}: {
  group: FolderGroup;
  readIds: string[];
  onOpen: (id: string) => void;
  maxSlips?: number;
  defaultOpen?: boolean;
}) {
  // null = 用户还没手动开合过，就按 defaultOpen 走；一旦动过就听用户的
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? defaultOpen;
  const [index, setIndex] = useState(0);

  const notes = maxSlips ? group.notes.slice(0, maxSlips) : group.notes;
  const hidden = group.notes.length - notes.length;
  const unreadIds = notes.filter((n) => !readIds.includes(n.id)).map((n) => n.id);

  const Icon = open ? FolderOpen : Folder;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-white/[0.08]',
        'bg-white/[0.04] backdrop-blur-md transition-all duration-200',
        'hover:-translate-y-[1px] hover:border-white/[0.14] hover:bg-white/[0.07]',
        'hover:shadow-[0_8px_22px_rgba(0,0,0,0.28)]',
      )}
      data-testid="letter-folder"
      data-folder-key={group.key}
      data-open={open}
    >
      {/* 头部：点它展开 / 收起 */}
      <button
        type="button"
        onClick={() => setManual(!open)}
        aria-expanded={open}
        data-testid="letter-folder-head"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-[#9aa3b8] transition-colors group-hover:text-[#c3cade]" />
        <span className="truncate text-[12px] font-medium text-[#dfe4ef]">{group.title}</span>
        <span className="ml-auto shrink-0 text-[10px] text-[#6b7488]">{group.notes.length} 封</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[#6b7488] transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* 堆叠的信件：收起时是一小摞，展开后变大并可滑动切换 */}
      <div
        className="px-3 pb-2.5"
        onClick={!open ? () => setManual(true) : undefined}
        data-testid="letter-stack-wrap"
      >
        <LetterStack
          notes={notes}
          index={index}
          onIndex={setIndex}
          expanded={open}
          onOpen={onOpen}
          unreadIds={unreadIds}
        />
        {open && hidden > 0 && (
          <p className="pt-1 text-center text-[9px] text-[#6b7488]">还有 {hidden} 封，去「全部」里翻</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ 列表 ------------------------------ */

/**
 * 一摞文件夹小卡片（记录列表）。
 * - `maxFolders` 限制显示几个（抽屉里地方小，只放最近两个，其余走「全部」）；
 * - `maxSlips` 限制每个文件夹里堆几张（一个月几百封信全渲染会卡）。
 */
export function FolderCardList({
  notes,
  readIds,
  onOpen,
  maxFolders,
  maxSlips,
  emptyHint = '还没有来信，稍后再来看看吧',
}: {
  notes: InspirationNote[];
  readIds: string[];
  onOpen: (id: string) => void;
  maxFolders?: number;
  maxSlips?: number;
  emptyHint?: string;
}) {
  const groups = useMemo(() => groupByMonth(notes), [notes]);
  const shown = maxFolders ? groups.slice(0, maxFolders) : groups;

  if (groups.length === 0) {
    return (
      <div className="py-4 text-center text-[10px] text-muted-foreground/60" data-testid="folder-empty">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid="letter-folder-list">
      {shown.map((g, i) => (
        <FolderCard
          key={g.key}
          group={g}
          readIds={readIds}
          onOpen={onOpen}
          maxSlips={maxSlips}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  );
}

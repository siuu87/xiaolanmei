import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNoteDate, type InspirationNote } from './notesData';

/**
 * 仿文件夹样式的来信归档（纯展示，无真实文件读取）
 *
 * - 卡片外观 = 文件夹投放框：左上角一个小 tab 凸起 + 下方的框体；
 * - hover 柔和动效：整卡微上浮 1px、底色提亮、阴影加深（200ms）；
 * - 点击平滑展开/收起，展开后里面是 AI 写的小纸条；
 * - 多个文件夹按月份归档，组成记录列表；
 * - 极简毛玻璃：白 3.5% 底 + backdrop-blur-md + 8% 细边，不抢主界面的戏。
 *
 * 只服务信箱这一个模块，不依赖任何页面布局，也不改其他页面。
 */

/* ------------------------------ 归档 ------------------------------ */

interface FolderGroup {
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
function groupByMonth(notes: InspirationNote[]): FolderGroup[] {
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

/* ------------------------------ 小纸条 ------------------------------ */

/** 文件夹里的一张 AI 小纸条：米白纸片，未读的右上角点一个小圆点 */
function NoteSlip({
  note,
  unread,
  onOpen,
}: {
  note: InspirationNote;
  unread: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`打开 ${formatNoteDate(note.createdAt)} 的来信`}
      data-testid="note-slip"
      data-note-id={note.id}
      className={cn(
        'block w-full rounded-[4px] px-2 py-1.5 text-left',
        'bg-gradient-to-b from-[#fbf7ef] to-[#f1e9d7] text-[#4a4034]',
        'shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition duration-200',
        'hover:-translate-y-[1px] hover:shadow-[0_4px_10px_rgba(0,0,0,0.28)] active:scale-[0.99]',
      )}
    >
      <span className="line-clamp-2 block text-[10px] leading-[15px]">{note.content}</span>
      <span className="mt-1 flex items-center justify-end gap-1">
        {unread && (
          <span
            aria-label="未读"
            className="mr-auto block h-1 w-1 rounded-full bg-primary"
            data-testid="note-slip-unread"
          />
        )}
        <span className="text-[8px] text-[#8a7f6d]">{formatNoteDate(note.createdAt)}</span>
      </span>
    </button>
  );
}

/* ------------------------------ 文件夹卡片 ------------------------------ */

function FolderCard({
  group,
  open,
  onToggle,
  readIds,
  onOpenNote,
  hiddenCount = 0,
}: {
  group: FolderGroup;
  open: boolean;
  onToggle: () => void;
  readIds: string[];
  onOpenNote: (id: string) => void;
  hiddenCount?: number;
}) {
  const Icon = open ? FolderOpen : Folder;

  return (
    <div
      className="group relative pt-[7px] transition-transform duration-200 hover:-translate-y-[1px]"
      data-testid="letter-folder"
      data-folder-key={group.key}
    >
      {/* 文件夹的 tab 凸起 */}
      <span
        aria-hidden
        data-testid="folder-tab"
        className={cn(
          'pointer-events-none absolute left-0 top-0 block h-[7px] w-[38%] rounded-t-[8px]',
          'border border-b-0 border-white/[0.08] bg-white/[0.05] transition-colors duration-200',
          'group-hover:bg-white/[0.09]',
        )}
      />

      {/* 框体 */}
      <div
        className={cn(
          'overflow-hidden rounded-b-xl rounded-tr-xl border border-white/[0.08]',
          'bg-white/[0.035] backdrop-blur-md transition-all duration-200',
          'group-hover:bg-white/[0.06] group-hover:shadow-[0_6px_18px_rgba(0,0,0,0.28)]',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          data-testid="letter-folder-head"
          className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-[#9aa3b8] transition-colors group-hover:text-[#c3cade]" />
          <span className="truncate text-[11px] font-medium text-[#dfe4ef]">{group.title}</span>
          <span className="ml-auto shrink-0 text-[9px] text-[#6b7488]">{group.notes.length} 封</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-[#6b7488] transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="overflow-hidden"
              data-testid="letter-folder-body"
            >
              <div className="space-y-1.5 border-t border-white/[0.06] px-2.5 py-2">
                {group.notes.map((n) => (
                  <NoteSlip
                    key={n.id}
                    note={n}
                    unread={!readIds.includes(n.id)}
                    onOpen={() => onOpenNote(n.id)}
                  />
                ))}
                {hiddenCount > 0 && (
                  <p className="pt-0.5 text-center text-[9px] text-[#6b7488]">
                    还有 {hiddenCount} 张，去「全部」里翻
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------ 列表 ------------------------------ */

/**
 * 一摞文件夹（记录列表）。
 * - `maxFolders` 限制显示几个（抽屉里地方小，只放最近两个，其余走「全部」）；
 * - `maxSlips` 限制每个文件夹里露几张纸条（一个月几百封信全渲染会卡）；
 * - 默认展开最新那个月，一眼能看到 AI 写的纸条。
 */
export function LetterFolders({
  notes,
  readIds,
  onOpenNote,
  maxFolders,
  maxSlips,
  emptyHint = '还没有来信，稍后再来看看吧',
}: {
  notes: InspirationNote[];
  readIds: string[];
  onOpenNote: (id: string) => void;
  maxFolders?: number;
  maxSlips?: number;
  emptyHint?: string;
}) {
  const groups = useMemo(() => groupByMonth(notes), [notes]);
  const shown = maxFolders ? groups.slice(0, maxFolders) : groups;

  // 默认展开最新那个月。**不能写成 useState 初始值**——notes 是异步加载的，
  // 首帧 groups 还是空的，初始值就永远停在空数组，之后数据到了也不展开。
  // 所以用「null = 用户没动过，按默认（第一个）算」，用户一动才接管。
  const [manual, setManual] = useState<string[] | null>(null);
  const defaultOpen = useMemo(() => groups.slice(0, 1).map((g) => g.key), [groups]);
  const openKeys = manual ?? defaultOpen;

  const toggle = (key: string) =>
    setManual(() => {
      const base = manual ?? defaultOpen;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });

  if (groups.length === 0) {
    return (
      <div className="py-4 text-center text-[10px] text-muted-foreground/60" data-testid="folder-empty">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="letter-folder-list">
      {shown.map((g) => {
        const slips = maxSlips ? g.notes.slice(0, maxSlips) : g.notes;
        const hidden = g.notes.length - slips.length;
        return (
          <FolderCard
            key={g.key}
            group={{ ...g, notes: slips }}
            hiddenCount={hidden}
            open={openKeys.includes(g.key)}
            onToggle={() => toggle(g.key)}
            readIds={readIds}
            onOpenNote={onOpenNote}
          />
        );
      })}
    </div>
  );
}

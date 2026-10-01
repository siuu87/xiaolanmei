import { useState } from 'react';
import { Pencil, Trash2, Pin, PinOff, ChevronDown, Sparkles, User, Bell, BellRing } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MemoDTO } from '@/lib/api/memo';
import { MemoAvatar } from '@/components/MemoAvatar';

export const CATEGORY_META: Record<string, { label: string; dot: string; cls: string }> = {
  preference: { label: '喜好', dot: '#fb7185', cls: 'bg-rose-400/15 text-rose-300' },
  agreement: { label: '约定', dot: '#fbbf24', cls: 'bg-amber-400/15 text-amber-300' },
  experience: { label: '经历', dot: '#38bdf8', cls: 'bg-sky-400/15 text-sky-300' },
  info: { label: '信息', dot: '#818cf8', cls: 'bg-indigo-400/15 text-indigo-300' },
  inspiration: { label: '灵感', dot: '#a78bfa', cls: 'bg-violet-400/15 text-violet-300' },
  plan: { label: '计划', dot: '#34d399', cls: 'bg-emerald-400/15 text-emerald-300' },
  general: { label: '其他', dot: '#94a3b8', cls: 'bg-muted text-muted-foreground' },
};
export const CATEGORIES = ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'] as const;

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 5 星重要性 */
function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5 text-[11px] leading-none" aria-label={`重要程度 ${value}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? 'text-amber-400' : 'text-muted-foreground/30'}>
          ★
        </span>
      ))}
    </span>
  );
}

export interface MemoCardProps {
  memo: MemoDTO;
  onEdit: (memo: MemoDTO) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleNotify: (id: string) => void;
  highlight?: boolean;
  defaultOpen?: boolean;
}

/** 备忘录卡片：分类圆点 + 标题 + 摘要 + 重要性 + 归属徽章 + 提醒对方 + 置顶。点击展开全文。 */
export function MemoCard({ memo, onEdit, onDelete, onTogglePin, onToggleNotify, highlight, defaultOpen }: MemoCardProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const meta = CATEGORY_META[memo.category] ?? CATEGORY_META.general;
  const summary = memo.content.replace(/\s+/g, ' ').slice(0, 50);

  return (
    <div
      className={cn(
        'glass rounded-2xl p-4 transition',
        memo.pinned && 'ring-1 ring-amber-400/30',
        highlight && 'ring-2 ring-primary',
      )}
    >
      {/* 顶行：分类圆点 + 分类/来源标签 + 置顶 + 编辑删除 */}
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.dot }} />
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', meta.cls)}>{meta.label}</span>
        <span
          className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          title={memo.authorType === 'agent' ? '小蓝莓自动记录' : '手动记录'}
        >
          {memo.authorType === 'agent' ? (
            <>
              <Sparkles className="mr-0.5 inline h-2.5 w-2.5" /> AI
            </>
          ) : (
            <>
              <User className="mr-0.5 inline h-2.5 w-2.5" /> 我
            </>
          )}
        </span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {fmtTime(memo.updatedAt)}
        </span>
      </div>

      {/* 标题 + 重要性 */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{memo.title}</span>
          <Stars value={memo.importance} />
        </div>
        {!open && <p className="mt-1 truncate text-xs text-foreground/70">{summary}</p>}
      </button>

      {open && (
        <div className="mt-2">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{memo.content}</p>
        </div>
      )}

      {/* 归属：谁为谁记的（专属徽章） */}
      {(memo.fromWho || memo.toWho) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {memo.fromWho && memo.fromWho !== memo.toWho ? (
            <>
              <span className="font-medium text-foreground/80">{memo.fromWho}</span>
              <span>为</span>
              <MemoAvatar seed={memo.avatarSeed} emoji={memo.emoji} nickname={memo.toWho} color={memo.avatarColor} size={20} />
              <span className="font-medium text-foreground/80">{memo.toWho}</span>
              <span>记的</span>
            </>
          ) : (
            <>
              <MemoAvatar seed={memo.avatarSeed} emoji={memo.emoji} nickname={memo.toWho} color={memo.avatarColor} size={20} />
              <span className="font-medium text-foreground/80">{memo.toWho}</span>
              <span>记的</span>
            </>
          )}
        </div>
      )}

      {/* 底部：tags + 提醒 + 展开指示 + 操作 */}
      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {memo.tags.map((t) => (
            <span key={t} className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-foreground/70">
              #{t}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onToggleNotify(memo.id)}
          aria-label={memo.needNotify ? '取消提醒' : '提醒对方'}
          title={memo.needNotify ? '已开启提醒，点击取消' : '提醒对方'}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition',
            memo.needNotify
              ? 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {memo.needNotify ? <BellRing className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
          {memo.needNotify ? '已提醒' : '提醒'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '收起' : '展开'}
          className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={() => onTogglePin(memo.id)}
          aria-label={memo.pinned ? '取消置顶' : '置顶'}
          title={memo.pinned ? '取消置顶' : '置顶'}
          className={cn(
            'rounded p-1 transition hover:bg-accent',
            memo.pinned ? 'text-amber-400' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {memo.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => onEdit(memo)}
          aria-label="编辑"
          className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(memo.id)}
          aria-label="删除"
          className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

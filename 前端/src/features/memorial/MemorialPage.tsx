import { useState } from 'react';
import { Plus, X, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMemorialStore,
  dayStatus,
  formatMemorialDate,
  REPEAT_OPTIONS,
  type MemorialDay,
  type Repeat,
} from '../home/memorialStore';

/** 今天的 YYYY-MM-DD（本地时区） */
function todayDate(): string {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${n.getFullYear()}-${m}-${d}`;
}

/** 开关（置顶） */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground/80">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

/** 添加 / 编辑纪念日：小窗（editing 为 null 时是新增） */
function MemorialEditorModal({
  editing,
  onClose,
}: {
  editing: MemorialDay | null;
  onClose: () => void;
}) {
  const addDay = useMemorialStore((s) => s.addDay);
  const updateDay = useMemorialStore((s) => s.updateDay);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(editing?.date ?? todayDate());
  const [repeat, setRepeat] = useState<Repeat>(editing?.repeat ?? 'none');
  const [pinned, setPinned] = useState(editing?.pinned ?? false);

  const save = () => {
    if (!title.trim() || !date) return;
    const patch = { title: title.trim(), date, repeat, pinned };
    if (editing) updateDay(editing.id, patch);
    else addDay(patch);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-background/90 p-4 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xs text-muted-foreground">
            {editing ? '编辑纪念日' : '添加纪念日'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入事件名称"
            className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-muted/80"
          />
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs text-muted-foreground">目标日</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none focus:bg-muted/80"
          />
          <p className="mt-1 text-[10px] text-muted-foreground/60">未来日期为倒数，过去日期为正数</p>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs text-muted-foreground">重复</label>
          <div className="grid grid-cols-4 gap-1.5">
            {REPEAT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setRepeat(o.key)}
                className={cn(
                  'rounded-lg py-1.5 text-xs transition',
                  repeat === o.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-foreground/70',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <Toggle label="置顶" checked={pinned} onChange={() => setPinned((v) => !v)} />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemorialPage() {
  const days = useMemorialStore((s) => s.days);
  const removeDay = useMemorialStore((s) => s.removeDay);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingDay = editingId ? (days.find((d) => d.id === editingId) ?? null) : null;

  const close = () => {
    setAdding(false);
    setEditingId(null);
  };

  // 排序：置顶在前 → 未来倒数（越近越前）→ 今天 → 已过（越近越前）
  const sorted = [...days].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const sa = dayStatus(a);
    const sb = dayStatus(b);
    const rank = (s: ReturnType<typeof dayStatus>) =>
      s.kind === 'future' ? s.count : s.kind === 'today' ? 1e9 : 1e10 + s.count;
    return rank(sa) - rank(sb);
  });

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xs text-muted-foreground">MEMORIAL · 纪念日</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="添加纪念日"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {sorted.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground/60">
            还没有纪念日，点右上角 + 记一个吧
          </div>
        )}

        {sorted.map((d) => {
          const st = dayStatus(d);
          const isToday = st.kind === 'today';
          return (
            <div
              key={d.id}
              role="button"
              tabIndex={0}
              onClick={() => setEditingId(d.id)}
              className="glass cursor-pointer p-4 transition hover:bg-muted/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {d.pinned && <Pin className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                    <div className="truncate text-sm font-medium text-foreground">{d.title}</div>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{formatMemorialDate(d)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDay(d.id);
                  }}
                  aria-label="删除"
                  className="shrink-0 text-muted-foreground/40 transition hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isToday ? (
                <div className="mt-4 text-sm font-medium text-primary">就是今天，纪念一下 🎉</div>
              ) : (
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground">
                    {st.kind === 'future' ? '还有' : '已经'}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-serif text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {st.count}
                    </span>
                    <span className="text-sm text-muted-foreground">天</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(adding || editingDay) && <MemorialEditorModal editing={editingDay} onClose={close} />}
    </div>
  );
}

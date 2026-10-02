import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Repeat, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTodoStore, isTodoDone, type RepeatType } from './todoStore';

const REPEAT_LABEL: Record<RepeatType, string> = {
  none: '',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

export function TodoCard() {
  // 待办抽到共享 store（AI 聊天也能改）；阶段 7 接后端 todos 表
  const todos = useTodoStore((s) => s.todos);
  const toggleTodo = useTodoStore((s) => s.toggleTodo);
  const removeTodo = useTodoStore((s) => s.removeTodo);
  const addTodo = useTodoStore((s) => s.addTodo);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [repeatOn, setRepeatOn] = useState(false);
  const [repeatType, setRepeatType] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const openCreate = () => {
    setText('');
    setNote('');
    setRepeatOn(false);
    setRepeatType('daily');
    setCreating(true);
  };

  const confirmCreate = () => {
    const t = text.trim();
    if (!t) return;
    addTodo({
      text: t,
      note: note.trim() || undefined,
      repeat: repeatOn ? repeatType : 'none',
    });
    setCreating(false);
  };

  return (
    <div className="glass p-4">
      {/* 头部：标题 + 右侧加号 */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xs text-muted-foreground">TO-DO list</h2>
        <button
          type="button"
          onClick={openCreate}
          aria-label="添加待办"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-2 space-y-1">
        {todos.map((t) => {
          const done = isTodoDone(t);
          return (
            <li key={t.id} className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => toggleTodo(t.id)}
                aria-label={done ? '标记未完成' : '标记完成'}
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition',
                  done
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/40 hover:border-primary',
                )}
              >
                {done && <Check className="h-3 w-3 text-primary-foreground" />}
              </button>
              <div className="flex-1">
                <span
                  className={cn(
                    'text-sm leading-6',
                    done ? 'text-muted-foreground/60 line-through' : 'text-foreground/90',
                  )}
                >
                  {t.text}
                </span>
                {t.note && (
                  <div className="text-[10px] leading-4 text-muted-foreground/70">{t.note}</div>
                )}
              </div>
              {t.repeat !== 'none' && (
                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  <Repeat className="h-2.5 w-2.5" />
                  {REPEAT_LABEL[t.repeat]}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeTodo(t.id)}
                aria-label="删除"
                className="text-muted-foreground/40 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* 新建待办弹窗（portal 到 body，避免被毛玻璃卡片的层叠上下文盖住） */}
      {creating &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"
            onClick={() => setCreating(false)}
          >
          <div
            className="w-full max-w-md rounded-2xl bg-background/90 p-5 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-sm font-medium">新建待办</h3>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 是否重复 */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">是否重复</span>
              <button
                type="button"
                role="switch"
                aria-checked={repeatOn}
                onClick={() => setRepeatOn((v) => !v)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition',
                  repeatOn ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                    repeatOn ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            </div>

            {/* 什么时间重复 */}
            {repeatOn && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">什么时间重复</label>
                <div className="flex gap-1.5">
                  {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRepeatType(r)}
                      className={cn(
                        'flex-1 rounded-lg py-1.5 text-xs transition',
                        repeatType === r
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-foreground/70',
                      )}
                    >
                      {REPEAT_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 具体内容 */}
            <div className="mt-3">
              <label className="mb-1 block text-xs text-muted-foreground">具体内容</label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmCreate()}
                placeholder="要做什么？"
                className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-muted/80"
              />
            </div>

            {/* 备注 */}
            <div className="mt-3">
              <label className="mb-1 block text-xs text-muted-foreground">备注</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="备注（可选）"
                className="h-10 w-full rounded-xl bg-muted/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:bg-muted/80"
              />
            </div>

            {/* 取消 + 添加 */}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="h-10 flex-1 rounded-xl bg-muted/60 text-sm font-medium text-foreground/80 transition hover:bg-muted/80"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmCreate}
                className="h-10 flex-1 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                添加
              </button>
            </div>
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

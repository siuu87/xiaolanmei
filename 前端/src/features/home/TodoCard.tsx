import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, Plus, Repeat, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTodoStore, isTodoDone, type RepeatType } from './todoStore';

const REPEAT_LABEL: Record<RepeatType, string> = {
  none: '',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

export function TodoCard() {
  // 待办抽到共享 store（AI 聊天也能改）；已接后端 todos 表
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

  const pending = todos.filter((t) => !isTodoDone(t)).length;

  return (
    <div className="glass rounded-[18px] border border-border/70 p-4">
      {/* 头部：标题 + 右侧加号 */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xs tracking-[0.18em] text-muted-foreground">TO-DO</h2>
        <button
          type="button"
          onClick={openCreate}
          aria-label="添加待办"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* 弹性竖向滚动区：超出后内部滚动，松手回弹 */}
      <div className="mt-2 max-h-[244px] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {todos.length === 0 ? (
          <p className="py-6 text-center text-[12px] font-light tracking-wide text-muted-foreground/60">
            还没有待办，点右上角加一件
          </p>
        ) : pending === 0 ? (
          <p className="py-6 text-center text-[12px] font-light tracking-wide text-muted-foreground/60">
            今天都搞定啦 ✦
          </p>
        ) : (
          <ul>
            {todos.map((t) => {
              const done = isTodoDone(t);
              return (
                <motion.li
                  key={t.id}
                  initial={false}
                  animate={
                    done
                      ? { opacity: 0, height: 0, marginTop: 0 }
                      : { opacity: 1, height: 'auto', marginTop: 0 }
                  }
                  transition={{ duration: 0.34, ease: 'easeInOut' }}
                  className={cn(
                    'flex items-center gap-2.5 overflow-hidden py-2',
                    done && 'line-through',
                  )}
                >
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
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[13px] font-light leading-7 tracking-wide',
                        done ? 'text-muted-foreground/40' : 'text-foreground/90',
                      )}
                    >
                      {t.text}
                    </span>
                    {t.note && (
                      <div className="truncate text-[10px] font-light leading-4 text-muted-foreground/60">
                        {t.note}
                      </div>
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
                    className="text-muted-foreground/30 transition hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 新建待办弹窗（portal 到 body，避免被毛玻璃卡片的层叠上下文盖住） */}
      {creating &&
        createPortal(
          <div
            className="fixed inset-0 z-[1500] flex items-center justify-center bg-scrim p-3 sm:p-4"
            onClick={() => setCreating(false)}
          >
            <div
              className="paper-card w-full max-w-md p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <p className="eyebrow mb-1">New Task</p>
                  <h3 className="display text-[18px] font-semibold text-foreground">新建待办</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  aria-label="关闭"
                  className="icon-btn h-8 w-8"
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
                  className="paper-inset h-10 w-full px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
                />
              </div>

              {/* 备注 */}
              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">备注</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="备注（可选）"
                  className="paper-inset h-10 w-full px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
                />
              </div>

              {/* 取消 + 添加 */}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="h-10 flex-1 rounded-xl border border-border bg-surface-2 text-sm font-medium text-foreground/80 transition hover:bg-surface-3"
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

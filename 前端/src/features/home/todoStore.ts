import { create } from 'zustand';
import { listTodos, createTodo, patchTodo, deleteTodo } from '@/lib/api/home';
import { newId } from '@/lib/id';

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Todo {
  id: string;
  text: string; // 具体内容
  note?: string; // 备注
  repeat: RepeatType; // 重复频率，none 为不重复
  done: boolean; // 一次性待办：是否完成
  doneOn?: string; // 重复待办：最近完成的日期 key
}

/** 今天的日期 key（YYYY-M-D，与日历一致） */
export function todayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`;
}

/** 某待办今天是否算已完成（重复待办看今天是否完成过） */
export function isTodoDone(t: Todo): boolean {
  return t.repeat === 'none' ? t.done : t.doneOn === todayKey();
}

export interface NewTodo {
  text: string;
  note?: string;
  repeat?: RepeatType;
}

interface TodoState {
  todos: Todo[];
  loaded: boolean;
  load: () => Promise<void>;
  addTodo: (input: NewTodo) => void;
  removeTodo: (id: string) => void;
  /** 切换完成态（重复待办按当天语义） */
  toggleTodo: (id: string) => void;
  /** 明确标记完成/未完成（AI 工具调用用） */
  setTodoDone: (id: string, done: boolean) => void;
}

/** 待办共享 store：TodoCard 与 AI 聊天都读写这里；本地乐观更新 + 写穿后端。 */
export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  loaded: false,

  load: async () => {
    try {
      set({ todos: await listTodos(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addTodo: (input) => {
    const todo: Todo = {
      id: newId(),
      text: input.text,
      note: input.note || undefined,
      repeat: input.repeat ?? 'none',
      done: false,
      doneOn: undefined,
    };
    set((s) => ({ todos: [...s.todos, todo] }));
    void createTodo(todo).catch(() => {});
  },

  removeTodo: (id) => {
    set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
    void deleteTodo(id).catch(() => {});
  },

  toggleTodo: (id) => {
    const x = get().todos.find((t) => t.id === id);
    if (!x) return;
    let next: Todo;
    if (x.repeat === 'none') {
      next = { ...x, done: !x.done };
    } else {
      const today = todayKey();
      next = { ...x, doneOn: x.doneOn === today ? undefined : today };
    }
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? next : t)) }));
    void patchTodo(id, { done: next.done, doneOn: next.doneOn }).catch(() => {});
  },

  setTodoDone: (id, done) => {
    const x = get().todos.find((t) => t.id === id);
    if (!x) return;
    let next: Todo;
    if (x.repeat === 'none') {
      next = { ...x, done };
    } else {
      const today = todayKey();
      next = { ...x, doneOn: done ? today : undefined };
    }
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? next : t)) }));
    void patchTodo(id, { done: next.done, doneOn: next.doneOn }).catch(() => {});
  },
}));

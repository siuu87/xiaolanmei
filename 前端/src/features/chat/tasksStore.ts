import { create } from 'zustand';
import { listTasks, setTaskStatus, type TaskItem } from '@/lib/api/tasks';

/**
 * 小任务 store（2026-11-18 三十五改，参考小红书「Nid douillet」的灵动岛指令卡）：
 * 聊天页顶部的灵动岛浮条 + 消息流任务卡共用这一份状态。
 * AI 布置任务时 ChatPage 会 upsert 进来（SSE task_sent），进聊天页时 load 全量。
 */
interface TasksState {
  items: TaskItem[];
  loaded: boolean;
  load: () => Promise<void>;
  /** AI 刚布置的任务（SSE 推来），放进列表头部；已在则原地更新 */
  upsert: (t: Pick<TaskItem, 'id' | 'title' | 'note' | 'dueAt'>) => void;
  /** 完成 / 取消 / 撤回：本地先改，写穿后端 */
  setStatus: (id: string, status: 'pending' | 'done' | 'cancelled') => void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    try {
      set({ items: await listTasks(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  upsert: (t) => {
    const rest = get().items.filter((x) => x.id !== t.id);
    set({
      items: [
        {
          id: t.id,
          title: t.title,
          note: t.note,
          dueAt: t.dueAt,
          status: 'pending',
          completedAt: null,
          createdAt: Date.now(),
        },
        ...rest,
      ],
    });
  },

  setStatus: (id, status) => {
    const completedAt = status === 'pending' ? null : Date.now();
    set((s) => ({
      items: s.items.map((t) => (t.id === id ? { ...t, status, completedAt } : t)),
    }));
    void setTaskStatus(id, status).catch(() => {});
  },
}));

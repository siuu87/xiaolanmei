import { request } from './conversations';

/**
 * 小任务（2026-11-18 三十五改，参考小红书「Nid douillet」的灵动岛指令卡）：
 * TA 在聊天里下达的限时任务。AI 走 assign_task 工具落库；这里给前端查列表 / 改状态用。
 */
export interface TaskItem {
  id: string;
  title: string;
  note: string;
  dueAt: number;
  status: 'pending' | 'done' | 'cancelled';
  completedAt: number | null;
  createdAt: number;
}

export const listTasks = () => request<TaskItem[]>('/api/tasks');

export const setTaskStatus = (id: string, status: 'pending' | 'done' | 'cancelled') =>
  request<TaskItem>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

import { request } from './conversations';
import type { DayMood, MoodKey } from '@/features/home/moodStore';

export type { DayMood, MoodKey };

/** 全量心情映射：key 为日期（非补零 YYYY-M-D），值为那天两人的心情 */
export type MoodDays = Record<string, DayMood>;

export const getMoods = () => request<{ days: MoodDays }>('/api/moods');

/** 整体替换（PUT 全量；本次没出现的日期会在后端打软删墓碑） */
export const putMoods = (days: MoodDays) =>
  request<{ ok: true }>('/api/moods', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DietState {
  /** 忌口食材（食谱与甜品小屋共用） */
  dislikes: string[];
  addDislike: (d: string) => void;
  removeDislike: (d: string) => void;
}

const DEFAULT_DISLIKES = ['洋葱', '姜', '蒜'];

/** 忌口设置（共享），localStorage 持久化 */
export const useDietStore = create<DietState>()(
  persist(
    (set) => ({
      dislikes: DEFAULT_DISLIKES,
      addDislike: (d) => set((s) => (s.dislikes.includes(d) ? s : { dislikes: [...s.dislikes, d] })),
      removeDislike: (d) => set((s) => ({ dislikes: s.dislikes.filter((x) => x !== d) })),
    }),
    { name: 'blueberry.diet.dislikes' },
  ),
);

/** 判断一串食材里是否含忌口，返回命中的忌口词 */
export function matchDislikes(ingredientNames: string[], dislikes: string[]): string[] {
  return dislikes.filter((d) => ingredientNames.some((n) => n.includes(d) || d.includes(n)));
}

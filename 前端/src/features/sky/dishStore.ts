import { create } from 'zustand';
import {
  listDishes,
  createDish,
  updateDish,
  deleteDish,
  type Dish,
  type NewDishInput,
} from '@/lib/api/dishes';
import { seedDishInputs } from './foodData';

interface DishState {
  dishes: Dish[];
  loaded: boolean;
  load: () => Promise<void>;
  addDish: (input: NewDishInput) => Promise<Dish | null>;
  updateDish: (id: string, patch: Partial<NewDishInput>) => Promise<void>;
  removeDish: (id: string) => Promise<void>;
}

/** 进行中的加载（防止 React StrictMode 双挂载并发播种造成重复） */
let loadPromise: Promise<void> | null = null;

/** 今天吃什么共享 store：读后端 dishes 表，本地乐观更新 + 写穿；后端为空时播种内置菜品 */
export const useDishStore = create<DishState>((set, get) => ({
  dishes: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        let list = await listDishes();
        if (list.length === 0) {
          for (const input of seedDishInputs()) {
            await createDish(input);
          }
          list = await listDishes();
        }
        set({ dishes: list, loaded: true });
      } catch {
        set({ loaded: true });
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  },

  addDish: async (input) => {
    try {
      const r = await createDish(input);
      const created: Dish = {
        id: r.id,
        name: input.name,
        type: input.type,
        coverUrl: input.coverUrl,
        description: input.description,
        ingredients: input.ingredients ?? [],
        steps: input.steps ?? [],
        tags: input.tags ?? [],
        difficulty: input.difficulty ?? 1,
        healingIndex: input.healingIndex ?? 3,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
      };
      set((s) => ({ dishes: [created, ...s.dishes] }));
      return created;
    } catch {
      return null;
    }
  },

  updateDish: async (id, patch) => {
    set((s) => ({
      dishes: s.dishes.map((d) => (d.id === id ? { ...d, ...patch, ingredients: patch.ingredients ?? d.ingredients, steps: patch.steps ?? d.steps, tags: patch.tags ?? d.tags } : d)),
    }));
    try {
      await updateDish(id, patch);
    } catch {
      /* ignore */
    }
  },

  removeDish: async (id) => {
    set((s) => ({ dishes: s.dishes.filter((d) => d.id !== id) }));
    try {
      await deleteDish(id);
    } catch {
      /* ignore */
    }
  },
}));

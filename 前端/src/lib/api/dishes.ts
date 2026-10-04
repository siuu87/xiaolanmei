import { request } from './conversations';

// ---- 今天吃什么 类型与 API ----

export type DishType = 'meal' | 'dessert';

export interface DishIngredient {
  name: string;
  amount?: string;
  unit?: string;
}

export interface Dish {
  id: string;
  name: string;
  type: DishType;
  coverUrl?: string;
  description?: string;
  ingredients: DishIngredient[];
  steps: string[];
  tags: string[];
  difficulty: number;
  healingIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface NewDishInput {
  name: string;
  type: DishType;
  coverUrl?: string;
  description?: string;
  ingredients?: DishIngredient[];
  steps?: string[];
  tags?: string[];
  difficulty?: number;
  healingIndex?: number;
}

export const listDishes = (type?: DishType) => {
  const qs = type ? `?type=${type}` : '';
  return request<Dish[]>(`/api/dishes${qs}`);
};
export const getDish = (id: string) => request<Dish>(`/api/dishes/${id}`);
export const createDish = (input: NewDishInput) =>
  request<{ id: string; createdAt: number }>('/api/dishes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateDish = (id: string, patch: Partial<NewDishInput>) =>
  request<{ ok: true }>(`/api/dishes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
export const deleteDish = (id: string) =>
  request<{ ok: true }>(`/api/dishes/${id}`, { method: 'DELETE' });

export const randomDish = (type: DishType) =>
  request<{ dish: Dish | null; recommendation: string }>(`/api/dishes/random?type=${type}`);
export const searchDishes = (q: string) =>
  request<Dish[]>(`/api/dishes/search?q=${encodeURIComponent(q)}`);
export const checkAllergen = (text: string) =>
  request<{ hasMango: boolean }>('/api/dishes/check-allergen', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

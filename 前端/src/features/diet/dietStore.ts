import { create } from 'zustand';
import { getDietProfile, checkDiet } from '@/lib/api/diet';
import { EMPTY_PROFILE, type DietHit, type DietProfile } from './dietHits';

/**
 * 饮食档案 store：忌口 / 过敏源**全部来自后端动态解析**
 * （人设变量 + 备忘录），前端不内置任何食物名。
 *
 * 谁在用：
 * - 聊天页：发消息前 / 收到回复后检测命中 → 弹对应级别的胶囊；
 * - 备忘录「记一笔」：打字时即时提示，记完再刷新一次档案。
 */
interface DietState {
  profile: DietProfile;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useDietStore = create<DietState>((set) => ({
  profile: EMPTY_PROFILE,
  loaded: false,

  load: async () => {
    try {
      const p = await getDietProfile();
      set({
        profile: {
          dislikes: Array.isArray(p.dislikes) ? p.dislikes : [],
          allergies: Array.isArray(p.allergies) ? p.allergies : [],
        },
        loaded: true,
      });
    } catch {
      // 取不到就当没配：**不填充任何内置食物**
      set({ profile: EMPTY_PROFILE, loaded: true });
    }
  },
}));

/** 走后端检测（前端本地匹配用于打字即时反馈，这里用于「以服务端为准」的场景） */
export async function checkDietHits(text: string): Promise<DietHit[]> {
  if (!text.trim()) return [];
  try {
    const r = await checkDiet(text);
    return Array.isArray(r.hits) ? r.hits : [];
  } catch {
    return [];
  }
}

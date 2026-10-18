import { create } from 'zustand';
import { getSettings, updateSettings, type ChatStyleMode } from '@/lib/api/settings';

export type { ChatStyleMode };

export const CHAT_STYLE_META: Record<ChatStyleMode, { short: string; title: string; desc: string }> = {
  improv: {
    short: '即兴',
    title: '即兴聊天',
    desc: '像正握着手机打字：一句一条、多条气泡、口语化，会突然改口也会补一句。',
  },
  immersive: {
    short: '沉浸',
    title: '沉浸陪伴',
    desc: '面对面或贴着耳边说话：整段连贯、只说话不动手，不出现任何括号旁白。',
  },
};

interface ChatStyleState {
  mode: ChatStyleMode;
  loaded: boolean;
  saving: boolean;
  load: () => Promise<void>;
  setMode: (mode: ChatStyleMode) => Promise<void>;
}

/**
 * 说话风格 store（2026-10-18）。
 *
 * 为什么存后端而不是 localStorage：这个档位要**注入 system prompt**，
 * 只有后端读到才有意义；前端这份只是镜像，切完立刻更新，下次进聊天页再 `load()` 对齐。
 *
 * 切换是**乐观更新**：先改本地让气泡立刻变形，失败再回滚并抛错给调用方提示。
 */
export const useChatStyle = create<ChatStyleState>((set, get) => ({
  mode: 'immersive',
  loaded: false,
  saving: false,

  load: async () => {
    try {
      const s = await getSettings();
      set({ mode: s.chatStyleMode === 'improv' ? 'improv' : 'immersive', loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setMode: async (mode) => {
    const prev = get().mode;
    if (prev === mode) return;
    set({ mode, saving: true });
    try {
      await updateSettings({ chatStyleMode: mode });
    } catch (e) {
      set({ mode: prev });
      throw e;
    } finally {
      set({ saving: false });
    }
  },
}));

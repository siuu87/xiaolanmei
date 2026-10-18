import { create } from 'zustand';

/**
 * 对白风格（2026-10-18 需求：💕 / 🩷 双态药丸）
 *
 * - `fragmented` 微信碎片流：一行一句、多条气泡、口语化、打字即兴感
 * - `immersive`  沉浸纯对话流：整段连贯、只写台词、严禁动作/神态/心理/括号
 *
 * **持久化在前端 localStorage**（`blueberry.chatStyle`）：刷新、重开 App 都保持上次的选择。
 * 后端不存这个偏好——每次 `POST /api/chat/stream` 带上 `chatStyle`，让提示词**按请求**拼，
 * 这样同一台后端上两个标签页可以各用各的口吻，互不打架。
 */
export type ChatStyleMode = 'fragmented' | 'immersive';

export const CHAT_STYLE_STORAGE_KEY = 'blueberry.chatStyle';

export const CHAT_STYLE_META: Record<ChatStyleMode, { icon: string; title: string; desc: string }> = {
  fragmented: {
    icon: '💕',
    title: '微信碎片流',
    desc: '像正握着手机打字：一句一条、多条气泡、口语化，会突然改口也会补一句。',
  },
  immersive: {
    icon: '🩷',
    title: '沉浸纯对话流',
    desc: '面对面或贴着耳边说话：整段连贯、只说话不动手，不出现任何括号旁白。',
  },
};

function readStored(): ChatStyleMode {
  try {
    return localStorage.getItem(CHAT_STYLE_STORAGE_KEY) === 'fragmented' ? 'fragmented' : 'immersive';
  } catch {
    // 隐私模式 / 禁用存储：退回默认档，绝不能因为读不到就崩
    return 'immersive';
  }
}

interface ChatStyleState {
  mode: ChatStyleMode;
  setMode: (mode: ChatStyleMode) => void;
  toggle: () => void;
  /** 另一个标签页改了 localStorage 时同步过来（storage 事件只发给「别的」标签页） */
  syncFromStorage: () => void;
}

export const useChatStyle = create<ChatStyleState>((set, get) => ({
  mode: readStored(),

  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem(CHAT_STYLE_STORAGE_KEY, mode);
    } catch {
      /* 存不进去也不影响本次会话 */
    }
  },

  toggle: () => get().setMode(get().mode === 'fragmented' ? 'immersive' : 'fragmented'),

  syncFromStorage: () => set({ mode: readStored() }),
}));

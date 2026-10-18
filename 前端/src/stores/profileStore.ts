import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 头像字段的取值约定：**emoji 或图片 URL 二选一**。
 * 以 `/` 或 `http` 开头的当图片渲染（上传头像返回 `/api/files/xxx`），
 * 其余当 emoji 文本渲染。判断统一走 `components/Avatar.tsx`，别在各处自己写。
 */
interface ProfileState {
  /* ---- 我 ---- */
  name: string; // 名称
  avatar: string; // 头像
  description: string; // 我的描述（介绍自己）
  signature: string; // 签名

  /* ---- TA ---- */
  partnerName: string; // 本名（人设里的名字）
  /**
   * 备注：聊天顶栏 / 「小心思」显示的名字。
   * 优先级 `partnerRemark > partnerName > 会话标题 > 小蓝莓`；
   * 存在后端 `profile.partnerRemark`（AI 也能改），启动时同步到本地。
   */
  partnerRemark: string;
  partnerAvatar: string; // 头像
  persona: string; // 人设 / 人物设定
  voiceId: string; // MiniMax 音色 ID（voice_id）
  voiceSpeed: number; // 语音语速 0.5~2.0，默认 1
  voiceLanguage: string; // 语言设置，'' = 不设置（默认中文普通话）

  setName: (v: string) => void;
  setAvatar: (v: string) => void;
  setDescription: (v: string) => void;
  setSignature: (v: string) => void;
  setPartnerName: (v: string) => void;
  setPartnerRemark: (v: string) => void;
  setPartnerAvatar: (v: string) => void;
  setPersona: (v: string) => void;
  setVoiceId: (v: string) => void;
  setVoiceSpeed: (v: number) => void;
  setVoiceLanguage: (v: string) => void;
}

/** 用户与伴侣的资料 / 人设 / 语音设置，localStorage 持久化 */
export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      avatar: '🫐',
      description: '',
      signature: '',

      partnerName: '',
      partnerRemark: '',
      partnerAvatar: '🐰',
      persona: '',
      voiceId: '',
      voiceSpeed: 1,
      voiceLanguage: '',

      setName: (name) => set({ name }),
      setAvatar: (avatar) => set({ avatar }),
      setDescription: (description) => set({ description }),
      setSignature: (signature) => set({ signature }),
      setPartnerName: (partnerName) => set({ partnerName }),
      setPartnerRemark: (partnerRemark) => set({ partnerRemark }),
      setPartnerAvatar: (partnerAvatar) => set({ partnerAvatar }),
      setPersona: (persona) => set({ persona }),
      setVoiceId: (voiceId) => set({ voiceId }),
      setVoiceSpeed: (voiceSpeed) => set({ voiceSpeed }),
      setVoiceLanguage: (voiceLanguage) => set({ voiceLanguage }),
    }),
    { name: 'blueberry.profile' },
  ),
);

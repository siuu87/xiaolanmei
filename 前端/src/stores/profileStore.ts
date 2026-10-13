import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  name: string; // 昵称
  avatar: string; // 头像（emoji）
  partnerName: string; // TA 的称呼（留空则沿用会话标题「小蓝莓」）
  partnerAvatar: string; // TA 头像（emoji）
  signature: string; // 签名
  setName: (v: string) => void;
  setAvatar: (v: string) => void;
  setPartnerName: (v: string) => void;
  setPartnerAvatar: (v: string) => void;
  setSignature: (v: string) => void;
}

/** 用户资料（昵称/头像/签名 + 伴侣称呼/头像），localStorage 持久化 */
export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      avatar: '🫐',
      partnerName: '',
      partnerAvatar: '🐰',
      signature: '',
      setName: (name) => set({ name }),
      setAvatar: (avatar) => set({ avatar }),
      setPartnerName: (partnerName) => set({ partnerName }),
      setPartnerAvatar: (partnerAvatar) => set({ partnerAvatar }),
      setSignature: (signature) => set({ signature }),
    }),
    { name: 'blueberry.profile' },
  ),
);

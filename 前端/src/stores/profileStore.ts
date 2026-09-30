import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  name: string; // 昵称
  avatar: string; // 头像（emoji）
  partnerAvatar: string; // TA 头像（emoji）
  signature: string; // 签名
  setName: (v: string) => void;
  setAvatar: (v: string) => void;
  setPartnerAvatar: (v: string) => void;
  setSignature: (v: string) => void;
}

/** 用户资料（昵称/头像/签名），localStorage 持久化 */
export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      name: '',
      avatar: '🫐',
      partnerAvatar: '🐰',
      signature: '',
      setName: (name) => set({ name }),
      setAvatar: (avatar) => set({ avatar }),
      setPartnerAvatar: (partnerAvatar) => set({ partnerAvatar }),
      setSignature: (signature) => set({ signature }),
    }),
    { name: 'blueberry.profile' },
  ),
);

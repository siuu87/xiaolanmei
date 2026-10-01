import { request } from './conversations';

export interface ProfileDTO {
  id: string; // 'me' | 'partner'
  nickname: string;
  avatarSeed: string;
  avatarColor: string;
  emoji: string | null;
  isMe: boolean;
}

export const listProfiles = () => request<ProfileDTO[]>('/api/profiles');

export const patchProfile = (
  id: string,
  patch: { nickname?: string; avatarSeed?: string; avatarColor?: string; emoji?: string },
) => request<ProfileDTO>(`/api/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

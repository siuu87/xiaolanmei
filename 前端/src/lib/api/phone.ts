import { request } from './conversations';

/** 酒馆小手机快照（阶段 P2 数据单源化）：联系人 / 会话 / 朋友圈 / 当前人设的整体替换 */
export interface PhoneSnapshot {
  contacts: unknown[];
  sessions: unknown[];
  moments: unknown[];
  activePersonaId: string | null;
}

export const getPhoneSnapshot = () => request<PhoneSnapshot>('/api/phone/snapshot');

/** 整体替换（PUT 全量；本次没出现的条目会在后端打软删墓碑） */
export const putPhoneSnapshot = (snap: PhoneSnapshot) =>
  request<{ ok: true }>('/api/phone/snapshot', {
    method: 'PUT',
    body: JSON.stringify(snap),
  });

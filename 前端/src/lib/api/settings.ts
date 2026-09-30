import { request } from './conversations';

export interface AppSettingsDTO {
  temperature: number;
  /** 识图模型：主模型不会看图时，用它把图片转成文字（空 = 未配置） */
  visionStationId?: string | null;
  visionModel?: string | null;
}

export interface AppSettingsInput {
  temperature?: number;
  visionStationId?: string | null;
  visionModel?: string | null;
}

export const getSettings = () => request<AppSettingsDTO>('/api/settings');

export const updateSettings = (input: AppSettingsInput) =>
  request<{ ok: true }>('/api/settings', { method: 'PUT', body: JSON.stringify(input) });

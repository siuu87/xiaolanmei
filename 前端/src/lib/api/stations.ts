import { request } from './conversations';

/** 一个 API 站子（供应商）。apiKey 绝不下发，只有 apiKeySet 布尔。 */
export interface Station {
  id: string;
  name: string;
  baseUrl: string;
  apiKeySet: boolean;
  models: string[];
  enabled: boolean;
  isDefault: boolean;
}

export interface StationInput {
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  enabled?: boolean;
  isDefault?: boolean;
}

export const listStations = () => request<Station[]>('/api/stations');

export const createStation = (input: StationInput) =>
  request<{ id: string }>('/api/stations', { method: 'POST', body: JSON.stringify(input) });

export const patchStation = (id: string, patch: Partial<StationInput>) =>
  request<{ ok: true }>(`/api/stations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteStation = (id: string) =>
  request<{ ok: true }>(`/api/stations/${id}`, { method: 'DELETE' });

/**
 * 自动拉取站子的模型列表（后端打 {baseUrl}/models，OpenAI 兼容格式）。
 * 传 id 用库里存的 baseUrl+Key；新站子没保存时直接传 baseUrl/apiKey。
 */
export const fetchStationModels = (input: { id?: string; baseUrl?: string; apiKey?: string }) =>
  request<{ models: string[] }>('/api/stations/fetch-models', {
    method: 'POST',
    body: JSON.stringify(input),
  });

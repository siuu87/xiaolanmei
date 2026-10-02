import { request } from './conversations';

export interface BoundaryItem {
  id: string;
  label: string;
  level: 'soft' | 'hard';
  enabled: boolean;
}

export interface SafewordConfig {
  word: string;
  pauseWord: string;
}

export interface PrivateArchiveDTO {
  preferences: string[];
  boundaries: BoundaryItem[];
  safeword: SafewordConfig;
}

export const getArchive = () => request<PrivateArchiveDTO>('/api/archive');

export const saveArchive = (data: PrivateArchiveDTO) =>
  request<PrivateArchiveDTO>('/api/archive', { method: 'PUT', body: JSON.stringify(data) });

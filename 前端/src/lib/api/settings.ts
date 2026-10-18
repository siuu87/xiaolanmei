import { request } from './conversations';

/**
 * 说话风格档位（后端 `chat.styleMode`）。
 * - `improv`    即兴聊天：一行一句、多条气泡、口语化
 * - `immersive` 沉浸陪伴：整段连贯、只写台词、禁止括号旁白
 */
export type ChatStyleMode = 'improv' | 'immersive';

export interface AppSettingsDTO {
  temperature: number;
  /** 识图模型：主模型不会看图时，用它把图片转成文字（空 = 未配置） */
  visionStationId?: string | null;
  visionModel?: string | null;
  /** 说话风格，缺省视作 `immersive` */
  chatStyleMode?: ChatStyleMode;
}

export interface AppSettingsInput {
  temperature?: number;
  visionStationId?: string | null;
  visionModel?: string | null;
  chatStyleMode?: ChatStyleMode;
}

export const getSettings = () => request<AppSettingsDTO>('/api/settings');

export const updateSettings = (input: AppSettingsInput) =>
  request<{ ok: true }>('/api/settings', { method: 'PUT', body: JSON.stringify(input) });

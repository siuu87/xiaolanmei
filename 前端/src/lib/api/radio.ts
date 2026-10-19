/**
 * 深夜电台接口客户端（2026-10-19）。
 * 广播稿的解析在后端 `radio/parse.ts`，这里只收「可执行片段」。
 */
import { request } from './conversations';

export type RadioChannel = 'story' | 'talk' | 'music' | 'pillow';

export type RadioSegment =
  | { type: 'speak'; text: string; tone?: string; ear?: 'left' | 'right' }
  | { type: 'song'; name: string; artist?: string }
  | { type: 'bgm'; mood: string }
  | { type: 'se'; name: string }
  | { type: 'pause'; ms: number }
  | { type: 'outline'; text: string }
  | { type: 'tracks'; text: string }
  | { type: 'summary'; text: string };

export interface RadioChannelMeta {
  id: RadioChannel;
  freq: string;
  name: string;
  subtitle: string;
  accent: string;
  lightsOff?: boolean;
  hidden?: boolean;
}

export interface RadioTurnResult {
  channel: RadioChannel;
  script: string;
  segments: RadioSegment[];
  source: 'llm' | 'local';
  outline?: string;
  tracks?: string;
  summary?: string;
}

export const getRadioChannels = () =>
  request<{ channels: RadioChannelMeta[] }>('/api/radio/channels');

export const fetchRadioTurn = (body: {
  channel: RadioChannel;
  note?: string;
  history?: string;
  bookTitle?: string;
  chapterText?: string;
  mood?: string;
}) =>
  request<RadioTurnResult>('/api/radio/turn', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export interface RadioAssetDTO {
  id: string;
  channel: string;
  kind: string;
  name: string;
  url: string | null;
  meta: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: number;
}

export const listRadioAssets = (channel?: RadioChannel) =>
  request<RadioAssetDTO[]>(`/api/radio/assets${channel ? `?channel=${channel}` : ''}`);

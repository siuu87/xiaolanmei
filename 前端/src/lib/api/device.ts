/**
 * 手机感知（LoverConnect 接入）的接口客户端。
 *
 * 注意：`url` 里带着 LC 每次安装独有的随机令牌，**后端只回脱敏串**
 * （`urlMasked` + `tokenLength`），前端拿不到明文，也不要试图从别处拼出来。
 */
import { request } from './conversations';

export interface DeviceLinkDTO {
  configured: boolean;
  enabled: boolean;
  urlMasked: string;
  tokenLength: number;
}

export interface ProbeResultDTO {
  ok: boolean;
  isLoverConnect: boolean;
  serverName: string | null;
  serverVersion: string | null;
  toolCount: number;
  tools: string[];
  missing: string[];
  error: string | null;
}

export interface BatteryDTO {
  percent: number | null;
  charging: boolean | null;
  temperature: number | null;
}

export interface WeatherDTO {
  city: string;
  desc: string;
  temp: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windKmh: number | null;
  min: number | null;
  max: number | null;
}

export interface AnniversaryDTO {
  name: string;
  kind: 'countdown' | 'countup';
  days: number;
}

export interface ContextRowDTO {
  key: string;
  label: string;
  value: string;
}

export interface ContextDTO {
  enabled: boolean | null;
  status: string | null;
  generatedAt: number | null;
  observations: ContextRowDTO[];
  inferences: string[];
  unknown: string[];
}

export interface DeviceSnapshotDTO {
  configured: boolean;
  reached: boolean;
  fetchedAt: number;
  parts: string[];
  battery: BatteryDTO | null;
  steps: number | null;
  weather: WeatherDTO | null;
  anniversaries: AnniversaryDTO[];
  screenTime: { totalMinutes: number | null; topApps: { name: string; minutes: number }[] } | null;
  context: ContextDTO | null;
  events: ContextRowDTO[];
  errors: { part: string; message: string }[];
  hint: string | null;
}

export const getDeviceLink = () => request<DeviceLinkDTO>('/api/device/link');

export const probeDeviceLink = (url?: string) =>
  request<{ probe: ProbeResultDTO }>('/api/device/link/probe', {
    method: 'POST',
    body: JSON.stringify({ url: url ?? '' }),
  });

export const saveDeviceLink = (input: { url?: string; enabled?: boolean; force?: boolean }) =>
  request<{ link: DeviceLinkDTO; probe: ProbeResultDTO | null }>('/api/device/link', {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const deleteDeviceLink = () => request<DeviceLinkDTO>('/api/device/link', { method: 'DELETE' });

export const getDeviceSnapshot = (opts: { full?: boolean; refresh?: boolean } = {}) => {
  const q = new URLSearchParams();
  if (opts.full) q.set('full', '1');
  if (opts.refresh) q.set('refresh', '1');
  const qs = q.toString();
  return request<{ snapshot: DeviceSnapshotDTO; parts: string[] }>(
    `/api/device/snapshot${qs ? `?${qs}` : ''}`,
  );
};

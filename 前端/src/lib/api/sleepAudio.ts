import { request } from './conversations';

export interface SleepAudioDTO {
  id: string;
  title: string;
  url: string;
  mime: string | null;
  duration: number | null;
  size: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

const AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/flac',
]);
const MAX_BYTES = 50 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取音频失败'));
    reader.readAsDataURL(file);
  });
}

/** 探测音频时长（秒），失败返回 null */
function probeDuration(dataUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.src = dataUrl;
    a.onloadedmetadata = () => {
      const d = Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration) : null;
      resolve(d);
    };
    a.onerror = () => resolve(null);
  });
}

export async function listSleepAudio(): Promise<SleepAudioDTO[]> {
  return request<SleepAudioDTO[]>('/api/sleep-audio', { method: 'GET' });
}

export async function uploadSleepAudio(file: File): Promise<SleepAudioDTO> {
  if (!AUDIO_MIME.has(file.type)) {
    throw new Error('仅支持 mp3 / wav / ogg / webm / aac / m4a / flac 音频');
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    throw new Error(`音频大小需在 1B ~ ${MAX_BYTES / 1024 / 1024}MB 之间`);
  }
  const dataUrl = await readAsDataUrl(file);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const duration = await probeDuration(dataUrl);
  return request<SleepAudioDTO>('/api/sleep-audio', {
    method: 'POST',
    body: JSON.stringify({ name: file.name, mime: file.type, data: base64, duration }),
  });
}

export async function deleteSleepAudio(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/sleep-audio/${id}`, { method: 'DELETE' });
}

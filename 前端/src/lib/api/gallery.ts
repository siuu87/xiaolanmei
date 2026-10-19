import { request } from './conversations';
import { uploadImage } from './attachments';

/**
 * 相册（together → gallery）。
 *
 * 上传**复用发图那条通道**（`uploadImage` → `POST /api/upload` → `data/uploads`），
 * 这里只提交 URL + 元数据。图片本体永远只有一份，所以别在这条路上再加 base64。
 */

export interface GalleryItemDTO {
  id: string;
  url: string;
  name: string | null;
  mime: string | null;
  note: string | null;
  tags: string[];
  takenAt: number | null;
  sortOrder: number;
  createdAt: number;
}

export interface GalleryTagCount {
  tag: string;
  count: number;
}

export const listGallery = (tag?: string) =>
  request<GalleryItemDTO[]>(`/api/gallery${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`);

export const listGalleryTags = () => request<GalleryTagCount[]>('/api/gallery/tags');

export const createGalleryItem = (input: {
  url: string;
  name?: string;
  mime?: string;
  note?: string;
  tags?: string[];
}) =>
  request<{ id: string; createdAt: number }>('/api/gallery', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const patchGalleryItem = (
  id: string,
  patch: Partial<{ name: string; note: string; tags: string[]; takenAt: number; sortOrder: number }>,
) => request<{ ok: true }>(`/api/gallery/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteGalleryItem = (id: string) =>
  request<{ ok: true }>(`/api/gallery/${id}`, { method: 'DELETE' });

/** Remember-Me 侧车状态（2026-10-19）：后端探活 8787，前端不跨域 */
export interface RememberMeStatus {
  up: boolean;
  base: string;
  dashboard: string;
}

export const getRememberMeStatus = () =>
  request<RememberMeStatus>('/api/gallery/remember/status');

/** 一步到位：先上传图片，再建一条相册记录 */
export async function uploadToGallery(
  file: File,
  extra?: { note?: string; tags?: string[] },
): Promise<{ id: string; url: string }> {
  const up = await uploadImage(file);
  const created = await createGalleryItem({
    url: up.url,
    name: up.name ?? file.name,
    mime: file.type,
    note: extra?.note,
    tags: extra?.tags,
  });
  return { id: created.id, url: up.url };
}

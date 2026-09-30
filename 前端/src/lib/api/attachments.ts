import { request } from './conversations';

export interface UploadedImage {
  id: string;
  url: string; // 后端静态地址 /api/files/xxx
  name: string;
  mime: string;
  size: number;
  dataUrl: string; // base64（仅内存，发给模型 / 即时展示）
}

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 上传一张图片：先读 base64（本地展示/发给模型），再落盘后端拿稳定 URL。 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!IMAGE_MIME.has(file.type)) throw new Error('仅支持 png / jpeg / gif / webp 图片');
  if (file.size === 0 || file.size > MAX_BYTES) {
    throw new Error(`图片大小需在 1B ~ ${MAX_BYTES / 1024 / 1024}MB 之间`);
  }

  const dataUrl = await readAsDataUrl(file);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

  const res = await request<{ id: string; url: string; name: string; mime: string; size: number }>(
    '/api/upload',
    {
      method: 'POST',
      body: JSON.stringify({ name: file.name, mime: file.type, data: base64 }),
    },
  );

  return { ...res, dataUrl };
}

/** 把已上传的图片 URL（/api/files/xxx 或 http）拉回并转 base64 data URL（发自定义表情包给模型读图时用） */
export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('读取图片失败');
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

import { request } from './conversations';

/** 用识图模型把一张图（base64 data URL）转成文字描述 */
export const describeImage = (image: string) =>
  request<{ text: string }>('/api/vision/describe', {
    method: 'POST',
    body: JSON.stringify({ image }),
  });

import smile from 'emoji-datasource-apple/img/apple/64/1f60a.png';
import laugh from 'emoji-datasource-apple/img/apple/64/1f602.png';
import kiss from 'emoji-datasource-apple/img/apple/64/1f618.png';
import hearts from 'emoji-datasource-apple/img/apple/64/1f970.png';
import love from 'emoji-datasource-apple/img/apple/64/1f60d.png';
import cry from 'emoji-datasource-apple/img/apple/64/1f62d.png';
import hug from 'emoji-datasource-apple/img/apple/64/1f917.png';
import sleep from 'emoji-datasource-apple/img/apple/64/1f634.png';
import thumb from 'emoji-datasource-apple/img/apple/64/1f44d.png';
import party from 'emoji-datasource-apple/img/apple/64/1f389.png';
import moon from 'emoji-datasource-apple/img/apple/64/1f319.png';
import heart from 'emoji-datasource-apple/img/apple/64/2764-fe0f.png';

export interface Sticker {
  emoji: string; // 用作持久化 key（消息 sticker 字段）
  img: string; // 贴图图片 URL
}

/** 内置贴图包：Apple emoji 大图当占位贴图，后续可换成真正的表情包素材 */
export const STICKERS: Sticker[] = [
  { emoji: '😊', img: smile },
  { emoji: '😂', img: laugh },
  { emoji: '😘', img: kiss },
  { emoji: '🥰', img: hearts },
  { emoji: '😍', img: love },
  { emoji: '😭', img: cry },
  { emoji: '🤗', img: hug },
  { emoji: '😴', img: sleep },
  { emoji: '👍', img: thumb },
  { emoji: '🎉', img: party },
  { emoji: '🌙', img: moon },
  { emoji: '❤️', img: heart },
];

/** 按贴图 key 查图片；未知贴图回退用 emoji 字符渲染 */
export function stickerImg(emoji: string): string | undefined {
  return STICKERS.find((s) => s.emoji === emoji)?.img;
}

/** 解析贴图图片：内置 emoji 优先；否则若 key 本身是图片地址（自定义表情包）直接用 */
export function resolveSticker(key: string): string | undefined {
  const builtin = stickerImg(key);
  if (builtin) return builtin;
  if (key.startsWith('/') || key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:')) {
    return key;
  }
  return undefined;
}

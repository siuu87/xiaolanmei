import flower from 'emoji-datasource-apple/img/apple/64/1f338.png';
import clover from 'emoji-datasource-apple/img/apple/64/1f340.png';
import ribbon from 'emoji-datasource-apple/img/apple/64/1f380.png';
import star from 'emoji-datasource-apple/img/apple/64/2b50.png';
import coffee from 'emoji-datasource-apple/img/apple/64/2615.png';
import cake from 'emoji-datasource-apple/img/apple/64/1f370.png';
import sparkle from 'emoji-datasource-apple/img/apple/64/2728.png';
import rainbow from 'emoji-datasource-apple/img/apple/64/1f308.png';
import pin from 'emoji-datasource-apple/img/apple/64/1f4cc.png';
import teddy from 'emoji-datasource-apple/img/apple/64/1f9f8.png';
import berry from 'emoji-datasource-apple/img/apple/64/1f353.png';
import herb from 'emoji-datasource-apple/img/apple/64/1f33f.png';
import { STICKERS, resolveSticker } from '@/features/chat/stickers';

/** 日记贴纸：key 是贴上去存进库的那个值（内置用 emoji 字符，自定义表情包用图片地址） */
export interface DiaryStickerDef {
  key: string;
  img: string;
}

/**
 * 日记里能直接贴的贴纸（2026-11-15）：
 *
 * 前 12 个跟聊天共用（`STICKERS`），后面这 12 个是手账感的装饰 —— 花、丝带、
 * 咖啡、蛋糕、星星、彩虹…… 贴纸上不放文字，纯靠图和小物把一页撑起来。
 * 24 个正好 6 列 × 4 行。
 */
export const DIARY_STICKERS: DiaryStickerDef[] = [
  ...STICKERS.map((s) => ({ key: s.emoji, img: s.img })),
  { key: '🌸', img: flower },
  { key: '🍀', img: clover },
  { key: '🎀', img: ribbon },
  { key: '⭐', img: star },
  { key: '☕', img: coffee },
  { key: '🍰', img: cake },
  { key: '✨', img: sparkle },
  { key: '🌈', img: rainbow },
  { key: '📌', img: pin },
  { key: '🧸', img: teddy },
  { key: '🍓', img: berry },
  { key: '🌿', img: herb },
];

/**
 * 常用 emoji（2026-11-15）：这些**不打包图片**，直接存字符、用系统 emoji 字体渲染。
 *
 * 为什么要单独一套：贴纸（上面 24 个）是配好图的小物，用一张少一张；
 * 而 emoji 是「随手一个」—— 想贴什么就从这 60 个里挑，或者自己打一个。
 * 走字符的好处是贴纸层天然支持任意 emoji（`StickerLayer` 拿到非图片 src
 * 就按文字渲染），不用为每个 emoji 加一张资源。
 *
 * 6 列 × 10 行。前 12 个跟聊天那套的 key 撞上，会走上面的 Apple 大图。
 */
export const DIARY_EMOJIS: string[] = [
  // 情绪
  '😊', '😄', '😂', '🥹', '😭', '😍', '🥰', '😘', '😳', '🥺', '😴', '😅',
  '🤔', '🙃', '😤', '😌', '🤗', '🤭',
  // 心动
  '❤️', '💛', '💙', '💜', '💕', '💔',
  // 手势
  '👍', '👏', '🙌', '🤝', '🫶', '✌️',
  // 吃的
  '🎂', '🍰', '🍓', '🍜', '☕', '🍦', '🍞', '🍺',
  // 天气 / 自然
  '🌸', '🌿', '🍀', '🌻', '🌈', '☀️', '🌙', '⭐',
  // 玩的
  '🎉', '🎁', '🎈', '🎧', '📖', '📷', '🧸', '🎀',
  // 零碎
  '✨', '🕯️', '🎵', '💤', '🐱', '🐶',
];

/**
 * 解析一张贴纸：日记自带的 24 个 → 聊天那套（含用户上传的表情包地址）→ 都没有就返回 undefined
 * （调用方会退回成 emoji 字符渲染，比如用户手输或未来换素材）。
 */
export function resolveDiarySticker(key: string): string | undefined {
  return DIARY_STICKERS.find((s) => s.key === key)?.img ?? resolveSticker(key);
}

import type { LucideIcon } from 'lucide-react';
import { Grid3x3, Circle, Brain } from 'lucide-react';

/**
 * 游戏屋注册表（2026-11-11）。
 *
 * 每款游戏都是「和 AI 一起玩」的本地对战：AI 用前端算法当对手，
 * 不依赖后端、不花 token。`difficulty` 是默认难度星级（1–3），
 * 对战页里可随时切换。
 */
export interface GameMeta {
  id: string;
  name: string;
  en: string;
  icon: LucideIcon;
  desc: string;
  tag: string;
  /** 卡片左上角装饰色（语义色，浅底深字） */
  accent: string;
  accentText: string;
  /** 默认难度 1–3 */
  difficulty: 1 | 2 | 3;
}

export const GAMES: GameMeta[] = [
  {
    id: 'tictactoe',
    name: '井字棋',
    en: 'TIC-TAC-TOE',
    icon: Grid3x3,
    desc: '三连即胜。AI 会算最优解，小心别被它先连成线。',
    tag: 'AI 对战',
    accent: 'bg-indigo-400/15',
    accentText: 'text-indigo-500',
    difficulty: 2,
  },
  {
    id: 'gomoku',
    name: '五子棋',
    en: 'GOMOKU',
    icon: Circle,
    desc: '五子连珠即赢。AI 会盯着活三活四堵你，也会给自己谋活路。',
    tag: 'AI 对战',
    accent: 'bg-emerald-400/15',
    accentText: 'text-emerald-500',
    difficulty: 2,
  },
  {
    id: 'memory',
    name: '记忆翻牌',
    en: 'MEMORY',
    icon: Brain,
    desc: '翻开两张配对即收走。和 AI 轮流翻，看谁记得更牢、配得更多。',
    tag: 'AI 对战',
    accent: 'bg-rose-400/15',
    accentText: 'text-rose-500',
    difficulty: 2,
  },
];

export function getGame(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

/** 难度等级文案 */
export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '简单',
  2: '普通',
  3: '困难',
};

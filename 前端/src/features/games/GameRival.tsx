import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AvatarContent } from '@/components/AvatarContent';
import { useProfileStore } from '@/stores/profileStore';
import { gameLine, useGameVoice, type GameScene } from './gameVoice';
import type { Difficulty } from './GameRoom';

/**
 * 对战页顶部的「他」（2026-11-12）。
 *
 * 设计约束：
 * - 头像走全站唯一的 `AvatarContent`（只认图片，非图片=中性剪影），名字按顶栏规则
 *   `partnerRemark > partnerName > 小蓝莓`；
 * - **语气跟人设一样**：文案由 `gameVoice.ts` 按聊天那套说话风格档位（💕/🩷）与
 *   用户写的人设/语言风格文本现取，不再是与「他」无关的通用游戏 NPC 短句；
 *   仍是纯本地：不调模型、不花 token、不写库、不编造记忆；
 * - 只用现有主题 token，不换配色、不引字体、不加半透明遮罩。
 *
 * 胜负时机由 `GameRoom` 通过 `result` prop 传入（那边监听比分事件），
 * 所以三款游戏本身一行都不用改。
 */

export interface GameResultSignal {
  kind: 'win' | 'loss' | 'draw';
  /** 自增序号：连续两局同一种结果也要能触发 useEffect */
  seq: number;
}

interface Bubble {
  id: number;
  text: string;
}

/** 气泡停留时长（毫秒） */
const BUBBLE_MS = 4200;
/** 闲聊间隔：9~16 秒随机，别吵也别让人忘了他在 */
const IDLE_MIN_MS = 9000;
const IDLE_MAX_MS = 16000;

export function GameRival({
  gameId,
  difficulty,
  result,
}: {
  gameId: string;
  difficulty: Difficulty;
  result: GameResultSignal | null;
}) {
  const partnerAvatar = useProfileStore((s) => s.partnerAvatar);
  const partnerRemark = useProfileStore((s) => s.partnerRemark);
  const partnerName = useProfileStore((s) => s.partnerName);
  const displayName = partnerRemark || partnerName || '小蓝莓';
  const voice = useGameVoice();

  const [bubble, setBubble] = useState<Bubble | null>(null);
  const seqRef = useRef(0);
  const idleCursor = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstDifficulty = useRef(true);

  /**
   * 语气/游戏 id 放 ref：说话时现取最新值，但 `say` 本身依赖恒为空，
   * 这样人设文本异步读完、或用户切了对白风格药丸，都不会重开定时器重复问候。
   */
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;

  const say = useCallback((scene: GameScene, seed = 0) => {
    const text = gameLine(scene, voiceRef.current, gameIdRef.current, seed);
    if (!text) return;
    seqRef.current += 1;
    setBubble({ id: seqRef.current, text });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

  // 开局问候 + 「时不时」的闲聊循环（随机间隔，组件卸载时全部清掉）
  useEffect(() => {
    let alive = true;
    const startTimer = setTimeout(() => {
      if (alive) say('opening');
    }, 650);

    const scheduleIdle = () => {
      const gap = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
      idleTimer.current = setTimeout(() => {
        if (!alive) return;
        say('idle', idleCursor.current);
        idleCursor.current += 1;
        scheduleIdle();
      }, gap);
    };
    scheduleIdle();

    return () => {
      alive = false;
      clearTimeout(startTimer);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [gameId, say]);

  // 切难度时搭一句话（首次挂载不触发，那是开局不是切换）
  useEffect(() => {
    if (firstDifficulty.current) {
      firstDifficulty.current = false;
      return;
    }
    say(difficulty === 3 ? 'hard' : difficulty === 1 ? 'easy' : 'normal');
  }, [difficulty, say]);

  // 比分变化时接一句胜负对白
  useEffect(() => {
    if (!result) return;
    say(result.kind, result.seq - 1);
  }, [result, say]);

  return (
    <div data-testid="game-rival" className="mb-3 flex items-start gap-3">
      {/* 头像框：气泡冒出来时轻轻弹一下 */}
      <motion.div
        data-testid="game-rival-avatar"
        animate={bubble ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-sm"
      >
        <AvatarContent value={partnerAvatar} />
      </motion.div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            data-testid="game-rival-name"
            className="truncate text-[13px] font-medium text-foreground"
          >
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">正在陪你玩</span>
        </div>

        {/* 固定高度：气泡出现/消失不推着棋盘上下跳 */}
        <div className="relative mt-1 min-h-[34px]">
          <AnimatePresence mode="wait">
            {bubble && (
              <motion.div
                key={bubble.id}
                data-testid="game-rival-bubble"
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="relative inline-block max-w-full whitespace-pre-line rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-1.5 text-[12px] leading-5 text-foreground shadow-sm"
              >
                {/* 小尖角，指向头像 */}
                <span
                  aria-hidden
                  className="absolute -left-[5px] top-[9px] h-2 w-2 rotate-45 border-b border-l border-border bg-card"
                />
                {bubble.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

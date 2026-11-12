import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AvatarContent } from '@/components/AvatarContent';
import { useProfileStore } from '@/stores/profileStore';
import type { Difficulty } from './GameRoom';

/**
 * 对战页顶部的「他」（2026-11-12）。
 *
 * 设计约束：
 * - 头像走全站唯一的 `AvatarContent`（只认图片，非图片=中性剪影），名字按顶栏规则
 *   `partnerRemark > partnerName > 小蓝莓`；
 * - 对话是**本地短句**，按开局 / 定时闲聊 / 切难度 / 胜负四种时机冒出来，
 *   不调模型、不花 token、不写库 —— 保持游戏屋「纯前端本地对战」的约定；
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

/** 开局：按游戏挑一句，别三款游戏说同一句 */
const OPENING: Record<string, string[]> = {
  tictactoe: ['三连就赢，我可不会让着你。', '来一局？我陪你。'],
  gomoku: ['五子连珠，我盯着呢。', '开盘啦，别急着落子。'],
  memory: ['记牌我可不含糊。', '一起翻翻看，看谁记得牢。'],
};

/** 「时不时」冒出来的闲聊：顺序轮播，避免连着两句重复，也别太密 */
const IDLE = [
  '嗯…让我看看。',
  '别急，慢慢想。',
  '这步走得挺稳。',
  '我记着呢。',
  '有点意思。',
  '轮到你啦。',
  '刚那下差点被你看穿。',
  '我在呢。',
  '这局还长着呢。',
  '我可没放水。',
  '手别抖呀。',
  '再来一局也没关系。',
];

const ON_WIN = ['这局算你赢啦。', '厉害，我认了。', '下回我可要认真了。'];
const ON_LOSS = ['嘿嘿，这局我赢了。', '承让啦。', '别急，再来一局？'];
const ON_DRAW = ['打平，谁也没输。', '这局算平手。', '再来一局分个高下？'];

/** 气泡停留时长（毫秒） */
const BUBBLE_MS = 4200;
/** 闲聊间隔：9~16 秒随机，别吵也别让人忘了他在 */
const IDLE_MIN_MS = 9000;
const IDLE_MAX_MS = 16000;

function pick(list: string[], seed: number): string {
  return list[seed % list.length];
}

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

  const [bubble, setBubble] = useState<Bubble | null>(null);
  const seqRef = useRef(0);
  const idleCursor = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstDifficulty = useRef(true);

  const say = useCallback((text: string) => {
    seqRef.current += 1;
    setBubble({ id: seqRef.current, text });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
  }, []);

  // 开局问候 + 「时不时」的闲聊循环（随机间隔，组件卸载时全部清掉）
  useEffect(() => {
    let alive = true;
    const opening = OPENING[gameId] ?? IDLE.slice(0, 2);
    const startTimer = setTimeout(() => {
      if (alive) say(pick(opening, 0));
    }, 650);

    const scheduleIdle = () => {
      const gap = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
      idleTimer.current = setTimeout(() => {
        if (!alive) return;
        say(pick(IDLE, idleCursor.current));
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
    say(
      difficulty === 3
        ? '换到困难了？那我也不客气啦。'
        : difficulty === 1
          ? '简单一点也好，慢慢来。'
          : '好，普通难度，公平较量。',
    );
  }, [difficulty, say]);

  // 比分变化时接一句胜负对白
  useEffect(() => {
    if (!result) return;
    const list = result.kind === 'win' ? ON_WIN : result.kind === 'loss' ? ON_LOSS : ON_DRAW;
    say(pick(list, result.seq - 1));
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
                className="relative inline-block max-w-full rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-1.5 text-[12px] leading-5 text-foreground shadow-sm"
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

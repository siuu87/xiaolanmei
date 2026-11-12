import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/PageShell';
import { DIFFICULTY_LABEL, getGame, type GameMeta } from './gameMeta';
import { GameRival, type GameResultSignal } from './GameRival';

/** 难度档位（1=简单 2=普通 3=困难） */
export type Difficulty = 1 | 2 | 3;

/**
 * 游戏对战页统一外壳（2026-11-11）。
 *
 * 收口四件事，让每款游戏只关心棋盘本身：
 *   1. 顶栏：返回 + 游戏名 + 右侧「难度」胶囊（点开三档）+ 「重开」按钮；
 *   2. 对手条（2026-11-12）：顶部「他」的头像框 + 会时不时冒出来的本地对话气泡；
 *   3. 比分条：胜 / 负 / 平 三个数字（按游戏 id 存 localStorage，换局不清零）；
 *   4. 不透明底（透出底下聊天页会穿帮，和其它二级页一致）。
 *
 * 游戏实现方通过 `useGameScore(gameId)` 拿 `{ score, bump, reset }`，在胜负分晓时调 `bump`。
 * `useGameScore` 在 GameRoom 和游戏组件里各有一个实例，靠 `GAME_SCORE_EVENT` 全局同步，
 * 所以比分条会实时刷新，对手条也能在胜负时接一句话 —— 三款游戏本身不用改。
 */
export interface GameScore {
  win: number;
  loss: number;
  draw: number;
}

function scoreKey(gameId: string) {
  return `blueberry.game.${gameId}.score`;
}

const ZERO_SCORE: GameScore = { win: 0, loss: 0, draw: 0 };

/**
 * 比分事件：`GameRoom` 与游戏组件各自持有一个 `useGameScore` 实例，
 * 以前游戏里 bump 只写 localStorage，外壳那条比分要重进页面才刷新。
 * 现在 bump / reset 都广播一次，所有实例同步 setState，对手条也借它接胜负对白。
 */
const GAME_SCORE_EVENT = 'blueberry:game:score';
interface GameScoreEventDetail {
  gameId: string;
  kind: 'win' | 'loss' | 'draw' | 'reset';
  score: GameScore;
}

function readScore(gameId: string): GameScore {
  try {
    const raw = localStorage.getItem(scoreKey(gameId));
    return raw ? (JSON.parse(raw) as GameScore) : { ...ZERO_SCORE };
  } catch {
    return { ...ZERO_SCORE };
  }
}

function emitScore(detail: GameScoreEventDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<GameScoreEventDetail>(GAME_SCORE_EVENT, { detail }));
}

/** 读取/更新某款游戏的累计比分（localStorage 持久化） */
export function useGameScore(gameId: string) {
  const [score, setScore] = useState<GameScore>(() => readScore(gameId));
  /** 同步镜像：bump 要在 setState updater 之外算下一份值，避免 StrictMode 重复 dispatch */
  const scoreRef = useRef(score);

  const bump = useCallback(
    (kind: 'win' | 'loss' | 'draw') => {
      const next = { ...scoreRef.current, [kind]: scoreRef.current[kind] + 1 };
      scoreRef.current = next;
      setScore(next);
      try {
        localStorage.setItem(scoreKey(gameId), JSON.stringify(next));
      } catch {
        /* 忽略存储异常 */
      }
      emitScore({ gameId, kind, score: next });
    },
    [gameId],
  );

  const reset = useCallback(() => {
    const next = { ...ZERO_SCORE };
    scoreRef.current = next;
    setScore(next);
    try {
      localStorage.removeItem(scoreKey(gameId));
    } catch {
      /* 忽略 */
    }
    emitScore({ gameId, kind: 'reset', score: next });
  }, [gameId]);

  // 别的实例改了比分，同步过来（自己发的那条是同一个值，幂等）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScore = (e: Event) => {
      const d = (e as CustomEvent<GameScoreEventDetail>).detail;
      if (!d || d.gameId !== gameId) return;
      scoreRef.current = d.score;
      setScore(d.score);
    };
    window.addEventListener(GAME_SCORE_EVENT, onScore);
    return () => window.removeEventListener(GAME_SCORE_EVENT, onScore);
  }, [gameId]);

  return { score, bump, reset };
}

export interface GameRoomProps {
  gameId: string;
  /** 当前难度（受控，由本组件内部 state 管理，通过 onDifficultyChange 通知游戏） */
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  /** 顶部状态条（轮到谁 / AI 思考中 / 胜负提示） */
  status: ReactNode;
  /** 棋盘/操作区 */
  children: ReactNode;
}

/** 难度胶囊：三档，点哪个亮哪个 */
function DifficultyPicker({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const levels: Difficulty[] = [1, 2, 3];
  return (
    <div
      className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5"
      data-testid="difficulty-picker"
    >
      {levels.map((lv) => (
        <button
          key={lv}
          type="button"
          onClick={() => onChange(lv)}
          data-testid={`difficulty-${lv}`}
          className={
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition ' +
            (value === lv
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {DIFFICULTY_LABEL[lv]}
        </button>
      ))}
    </div>
  );
}

export function GameRoom({ gameId, difficulty, onDifficultyChange, status, children }: GameRoomProps) {
  const meta = getGame(gameId);
  const { score, reset } = useGameScore(gameId);
  const [lastResult, setLastResult] = useState<GameResultSignal | null>(null);

  // 胜负分晓时通知对手条接一句话；重开/清零不说话
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScore = (e: Event) => {
      const d = (e as CustomEvent<GameScoreEventDetail>).detail;
      if (!d || d.gameId !== gameId || d.kind === 'reset') return;
      const kind = d.kind; // 排除 reset 后收窄成 'win' | 'loss' | 'draw'
      setLastResult((prev) => ({ kind, seq: (prev?.seq ?? 0) + 1 }));
    };
    window.addEventListener(GAME_SCORE_EVENT, onScore);
    return () => window.removeEventListener(GAME_SCORE_EVENT, onScore);
  }, [gameId]);

  return (
    <PageShell
      title={meta?.name ?? '游戏'}
      eyebrow={meta?.en ?? 'GAME'}
      backTo="/games"
      right={
        <DifficultyPicker value={difficulty} onChange={onDifficultyChange} />
      }
    >
      {/* 对手条：他的头像框 + 时不时冒出来的对话 */}
      <GameRival gameId={gameId} difficulty={difficulty} result={lastResult} />

      {/* 比分条 */}
      <div className="mb-4 flex items-center justify-center gap-6 rounded-2xl bg-surface-2/60 px-4 py-2.5">
        <ScoreCell label="胜" value={score.win} tone="text-emerald-500" />
        <ScoreDivider />
        <ScoreCell label="负" value={score.loss} tone="text-rose-500" />
        <ScoreDivider />
        <ScoreCell label="平" value={score.draw} tone="text-muted-foreground" />
        <button
          type="button"
          onClick={reset}
          className="ml-2 rounded-full px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground"
        >
          清零
        </button>
      </div>

      {/* 状态条 */}
      {status}

      {/* 棋盘 */}
      {children}

      <p className="mt-5 text-center text-[10px] text-muted-foreground/50">
        你执黑 · AI 执白 · 随时可点右上角难度调整
      </p>
    </PageShell>
  );
}

function ScoreCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ScoreDivider() {
  return <span aria-hidden className="h-6 w-px bg-border" />;
}

/** 暴露给游戏实现方：从 meta 拿游戏信息 */
export function useGameMeta(gameId: string): GameMeta | undefined {
  return getGame(gameId);
}

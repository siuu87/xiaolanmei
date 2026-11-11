import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/PageShell';
import { DIFFICULTY_LABEL, getGame, type GameMeta } from './gameMeta';

/** 难度档位（1=简单 2=普通 3=困难） */
export type Difficulty = 1 | 2 | 3;

/**
 * 游戏对战页统一外壳（2026-11-11）。
 *
 * 收口三件事，让每款游戏只关心棋盘本身：
 *   1. 顶栏：返回 + 游戏名 + 右侧「难度」胶囊（点开三档）+ 「重开」按钮；
 *   2. 比分条：胜 / 负 / 平 三个数字（按游戏 id 存 localStorage，换局不清零）；
 *   3. 不透明底（透出底下聊天页会穿帮，和其它二级页一致）。
 *
 * 游戏实现方通过 `useGameScore(gameId)` 拿 `[score, recordWin, recordLoss, recordDraw]`，
 * 在胜负分晓时调用对应回调。
 */
export interface GameScore {
  win: number;
  loss: number;
  draw: number;
}

function scoreKey(gameId: string) {
  return `blueberry.game.${gameId}.score`;
}

/** 读取/更新某款游戏的累计比分（localStorage 持久化） */
export function useGameScore(gameId: string) {
  const [score, setScore] = useState<GameScore>(() => {
    try {
      const raw = localStorage.getItem(scoreKey(gameId));
      return raw ? (JSON.parse(raw) as GameScore) : { win: 0, loss: 0, draw: 0 };
    } catch {
      return { win: 0, loss: 0, draw: 0 };
    }
  });

  const bump = useCallback(
    (kind: 'win' | 'loss' | 'draw') => {
      setScore((prev) => {
        const next = { ...prev, [kind]: prev[kind] + 1 };
        try {
          localStorage.setItem(scoreKey(gameId), JSON.stringify(next));
        } catch {
          /* 忽略存储异常 */
        }
        return next;
      });
    },
    [gameId],
  );

  const reset = useCallback(() => {
    setScore({ win: 0, loss: 0, draw: 0 });
    try {
      localStorage.removeItem(scoreKey(gameId));
    } catch {
      /* 忽略 */
    }
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

  return (
    <PageShell
      title={meta?.name ?? '游戏'}
      eyebrow={meta?.en ?? 'GAME'}
      backTo="/games"
      right={
        <DifficultyPicker value={difficulty} onChange={onDifficultyChange} />
      }
    >
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GameRoom, useGameScore, type Difficulty } from './GameRoom';

/**
 * 五子棋（2026-11-11）：玩家执黑先手，AI 执白。15×15 棋盘。
 *
 * AI 用启发式评估：对每个候选点，分别算「AI 在此走能形成多大攻势」和
 * 「玩家在此走能形成多大攻势」，AI 点 = 自身进攻分 + 对手威胁分 × 权重。
 * 评估基于五格窗口的连子数 + 活口数（活四/冲四/活三/活二…）。
 *   - 简单：只看自身进攻，不主动堵（且 25% 随机）
 *   - 普通：进攻 + 堵对手，权重 1.0
 *   - 困难：进攻 + 堵对手，权重 1.3，且优先防对手活四
 */

const N = 15;
const EMPTY = 0;
const BLACK = 1; // 玩家
const WHITE = 2; // AI
type Cell = 0 | 1 | 2;
type Board = Cell[][]; // [row][col]

function emptyBoard(): Board {
  return Array.from({ length: N }, () => Array(N).fill(EMPTY) as Cell[]);
}

/** 判五连：返回获胜方，否则 null */
function judgeWin(board: Board): 1 | 2 | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cell = board[r][c];
      if (cell === EMPTY) continue;
      for (const [dr, dc] of dirs) {
        let count = 1;
        let blocked = 0;
        // 正向
        for (let k = 1; k < 5; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) {
            blocked++;
            break;
          }
          if (board[nr][nc] === cell) count++;
          else if (board[nr][nc] === EMPTY) break;
          else {
            blocked++;
            break;
          }
        }
        // 反向
        for (let k = 1; k < 5; k++) {
          const nr = r - dr * k;
          const nc = c - dc * k;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) {
            blocked++;
            break;
          }
          if (board[nr][nc] === cell) count++;
          else if (board[nr][nc] === EMPTY) break;
          else {
            blocked++;
            break;
          }
        }
        if (count >= 5) return cell as 1 | 2;
      }
    }
  }
  return null;
}

/** 在 (r,c) 放 player 后，向某方向形成的连续数 + 两端活口数 */
function lineInfo(board: Board, r: number, c: number, dr: number, dc: number, player: Cell) {
  let count = 1;
  let openEnds = 0;
  // 正方向
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === player) {
    count++;
    nr += dr;
    nc += dc;
  }
  if (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === EMPTY) openEnds++;
  // 反方向
  nr = r - dr;
  nc = c - dc;
  while (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === player) {
    count++;
    nr -= dr;
    nc -= dc;
  }
  if (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] === EMPTY) openEnds++;
  return { count, openEnds };
}

/** 评估在 (r,c) 落 player 的得分（各方向加权） */
function evalPoint(board: Board, r: number, c: number, player: Cell): number {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let total = 0;
  for (const [dr, dc] of dirs) {
    const { count, openEnds } = lineInfo(board, r, c, dr, dc, player);
    total += scoreShape(count, openEnds);
  }
  return total;
}

/** 连子数 + 活口 → 分值（活四 > 冲四 > 活三 > 活二…） */
function scoreShape(count: number, openEnds: number): number {
  if (count >= 5) return 100000;
  if (count === 4) return openEnds === 2 ? 10000 : openEnds === 1 ? 1000 : 0;
  if (count === 3) return openEnds === 2 ? 1000 : openEnds === 1 ? 100 : 0;
  if (count === 2) return openEnds === 2 ? 100 : openEnds === 1 ? 10 : 0;
  if (count === 1) return openEnds === 2 ? 10 : openEnds === 1 ? 1 : 0;
  return 0;
}

/** AI 选点：返回 {r, c} */
function pickAiMove(board: Board, difficulty: Difficulty): { r: number; c: number } | null {
  // 收集所有落子点附近的候选（有棋子的邻居 + 空位）
  const candidates = new Set<number>();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r][c] === EMPTY) {
        let near = false;
        for (let dr = -2; dr <= 2 && !near; dr++) {
          for (let dc = -2; dc <= 2 && !near; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < N && nc >= 0 && nc < N && board[nr][nc] !== EMPTY) near = true;
          }
        }
        if (near) candidates.add(r * N + c);
      }
    }
  }
  if (candidates.size === 0) return { r: 7, c: 7 };

  // 简单难度：25% 随机
  if (difficulty === 1 && Math.random() < 0.25) {
    const arr = [...candidates];
    const idx = arr[Math.floor(Math.random() * arr.length)];
    return { r: Math.floor(idx / N), c: idx % N };
  }

  const threatWeight = difficulty === 1 ? 0 : difficulty === 3 ? 1.3 : 1.0;
  let bestScore = -Infinity;
  let best: { r: number; c: number } | null = null;

  for (const key of candidates) {
    const r = Math.floor(key / N);
    const c = key % N;
    // 先检查 AI 自己走这能直接赢
    board[r][c] = WHITE;
    const selfWin = judgeWin(board);
    const selfScore = selfWin === WHITE ? 1e9 : evalPoint(board, r, c, WHITE);
    board[r][c] = EMPTY;

    // 再检查对手走这的威胁
    board[r][c] = BLACK;
    const oppWin = judgeWin(board);
    const oppScore = oppWin === BLACK ? 1e8 : evalPoint(board, r, c, BLACK);
    board[r][c] = EMPTY;

    const score = selfScore + oppScore * threatWeight;
    if (score > bestScore) {
      bestScore = score;
      best = { r, c };
    }
  }
  return best;
}

type Status =
  | { kind: 'playing'; turn: 1 | 2 }
  | { kind: 'over'; winner: 1 | 2 };

type Move = { r: number; c: number; color: 1 | 2 };

export function Gomoku({ difficulty, onDifficultyChange }: { difficulty: Difficulty; onDifficultyChange: (d: Difficulty) => void }) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [status, setStatus] = useState<Status>({ kind: 'playing', turn: 1 });
  const [aiThinking, setAiThinking] = useState(false);
  const [moves, setMoves] = useState<Move[]>([]);
  const { bump } = useGameScore('gomoku');

  const winner = judgeWin(board);

  useEffect(() => {
    if (status.kind === 'over') {
      if (status.winner === 1) bump('win');
      else bump('loss');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // AI 落子
  useEffect(() => {
    if (status.kind === 'playing' && status.turn === 2 && !aiThinking && winner === null) {
      setAiThinking(true);
      const timer = setTimeout(() => {
        const move = pickAiMove(board, difficulty);
        if (move) {
          const next = board.map((row) => [...row]);
          next[move.r][move.c] = WHITE;
          setBoard(next);
          setMoves((m) => [...m, { r: move.r, c: move.c, color: WHITE }]);
          const w = judgeWin(next);
          if (w === WHITE) setStatus({ kind: 'over', winner: 2 });
          else setStatus({ kind: 'playing', turn: 1 });
        }
        setAiThinking(false);
      }, 450);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, status, difficulty]);

  const onCell = useCallback(
    (r: number, c: number) => {
      if (status.kind !== 'playing' || status.turn !== 1 || board[r][c] !== EMPTY || aiThinking) return;
      const next = board.map((row) => [...row]);
      next[r][c] = BLACK;
      setBoard(next);
      setMoves((m) => [...m, { r, c, color: BLACK }]);
      const w = judgeWin(next);
      if (w === BLACK) setStatus({ kind: 'over', winner: 1 });
      else setStatus({ kind: 'playing', turn: 2 });
    },
    [board, status, aiThinking],
  );

  const undo = useCallback(() => {
    if (moves.length === 0 || aiThinking) return;
    // 悔到玩家上一次出手前：撤掉 AI 的最后一手 + 玩家的最后一手
    setBoard((prev) => {
      const next = prev.map((row) => [...row]);
      setMoves((m) => {
        const copy = [...m];
        // 先撤最后一个（应该是 AI 白，因为玩家刚走完 AI 才走）
        if (copy.length >= 2) {
          const last = copy.pop()!;
          next[last.r][last.c] = EMPTY;
          const prevLast = copy.pop()!;
          next[prevLast.r][prevLast.c] = EMPTY;
        } else {
          const last = copy.pop()!;
          next[last.r][last.c] = EMPTY;
        }
        return copy;
      });
      return next;
    });
    setStatus({ kind: 'playing', turn: 1 });
  }, [moves, aiThinking]);

  const restart = useCallback(() => {
    setBoard(emptyBoard());
    setStatus({ kind: 'playing', turn: 1 });
    setMoves([]);
    setAiThinking(false);
  }, []);

  const statusBar = useMemo(() => {
    if (status.kind === 'over') {
      const msg = status.winner === 1 ? '五子连珠，你赢了！🎉' : 'AI 连成五子，再来一局';
      return (
        <div className="mb-4 rounded-2xl bg-surface-2/60 px-4 py-3 text-center text-[13px] font-medium text-foreground">
          {msg}
          <button onClick={restart} className="ml-3 text-[11px] font-normal text-primary underline-offset-2 hover:underline">
            再来一局
          </button>
        </div>
      );
    }
    if (aiThinking) {
      return (
        <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-surface-2/60 px-4 py-3 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI 正在想…
        </div>
      );
    }
    return (
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-surface-2/60 px-4 py-2.5">
        <span className="text-[12px] text-muted-foreground">轮到你落子（执黑）</span>
        <button
          onClick={undo}
          disabled={moves.length === 0}
          className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-40"
        >
          悔棋
        </button>
      </div>
    );
  }, [status, aiThinking, moves.length, restart, undo]);

  return (
    <GameRoom gameId="gomoku" difficulty={difficulty} onDifficultyChange={onDifficultyChange} status={statusBar}>
      {/* 棋盘：15×15 网格，星位标记 */}
      <div className="overflow-x-auto">
        <div className="mx-auto inline-block select-none">
          <div
            className="grid gap-0.5 bg-surface-2 p-1.5 rounded-2xl"
            style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
          >
            {Array.from({ length: N * N }).map((_, idx) => {
              const r = Math.floor(idx / N);
              const c = idx % N;
              const cell = board[r][c];
              const isStar = (r === 7 && (c === 7 || c === 3 || c === 11)) || (c === 7 && (r === 3 || r === 11));
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onCell(r, c)}
                  disabled={cell !== EMPTY || status.kind === 'over' || aiThinking || status.turn !== 1}
                  data-testid={`gomoku-cell-${r}-${c}`}
                  className="relative aspect-square w-7 h-7 sm:w-8 sm:h-8 rounded-[3px] border border-border/40 transition hover:bg-surface-3 active:scale-90 disabled:opacity-60"
                >
                  {cell === BLACK && (
                    <span className="absolute inset-[18%] rounded-full bg-foreground" />
                  )}
                  {cell === WHITE && (
                    <span className="absolute inset-[18%] rounded-full border-2 border-foreground bg-page-bg" />
                  )}
                  {isStar && cell === EMPTY && (
                    <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={undo}
          disabled={moves.length === 0 || aiThinking}
          className="flex-1 rounded-2xl bg-surface-2 py-3 text-[13px] font-medium text-foreground transition hover:bg-surface-2/80 active:scale-[0.99] disabled:opacity-40"
        >
          悔棋
        </button>
        <button
          type="button"
          onClick={restart}
          className="flex-1 rounded-2xl bg-surface-2 py-3 text-[13px] font-medium text-foreground transition hover:bg-surface-2/80 active:scale-[0.99]"
        >
          重新开始
        </button>
      </div>
    </GameRoom>
  );
}

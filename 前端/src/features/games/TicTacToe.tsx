import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GameRoom, useGameScore, type Difficulty } from './GameRoom';

/**
 * 井字棋（2026-11-11）：玩家执 X 先手，AI 执 O。
 *
 * AI 用 minimax 极小化极大搜索：
 *   - 简单：随机走 + 偶尔堵（30% 随机）
 *   - 普通：minimax 深度 2（看两步），带 20% 随机扰动
 *   - 困难：完整 minimax（看到底，不可战胜）
 * 棋盘用 0/1/2 表示 空/X/O，winLine 判定三连。
 */

type Cell = 0 | 1 | 2; // 0 空 / 1 X(玩家) / 2 O(AI)
type Board = Cell[]; // 长度 9

const EMPTY: Board = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** 判定胜负：返回获胜玩家的编号，或平局返回 0，未结束返回 null */
function judge(board: Board): 1 | 2 | 0 | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as 1 | 2;
    }
  }
  if (board.every((c) => c !== 0)) return 0; // 平局
  return null; // 未结束
}

/** minimax：返回该局面对 player 的最优分值（1 胜 / -1 负 / 0 平） */
function minimax(
  board: Board,
  player: 1 | 2,
  depth: number,
): number {
  const result = judge(board);
  if (result === player) return 10 - depth;
  if (result !== null && result !== 0) return depth - 10; // 对手赢
  if (result === 0) return 0;

  const me = player;
  let best = player === 1 ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] === 0) {
      const next = [...board] as Board;
      next[i] = me;
      const score = minimax(next, player === 1 ? 2 : 1, depth + 1);
      if (player === 1) best = Math.max(best, score);
      else best = Math.min(best, score);
    }
  }
  return best;
}

/** AI 选点：返回落子位置 0–8 */
function pickAiMove(board: Board, difficulty: Difficulty): number {
  const emptyIdx = board.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
  if (emptyIdx.length === 0) return -1;

  // 简单：随机走
  if (difficulty === 1) {
    // 30% 概率随机，其余尝试找最优
    if (Math.random() < 0.3) return emptyIdx[Math.floor(Math.random() * emptyIdx.length)];
  }

  // 先找能直接赢的位置
  for (const i of emptyIdx) {
    const trial = [...board] as Board;
    trial[i] = 2;
    if (judge(trial) === 2) return i;
  }
  // 再找必须堵的位置（对手再走一步就赢）
  for (const i of emptyIdx) {
    const trial = [...board] as Board;
    trial[i] = 1;
    if (judge(trial) === 1) return i;
  }

  // 困难：完整 minimax 选最优
  if (difficulty === 3) {
    let bestScore = -Infinity;
    let bestMove = emptyIdx[0];
    for (const i of emptyIdx) {
      const trial = [...board] as Board;
      trial[i] = 2;
      const score = minimax(trial, 1, 1); // 对手视角
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
    return bestMove;
  }

  // 普通：minimax 深度 2 + 随机扰动
  let scored: { idx: number; score: number }[] = [];
  for (const i of emptyIdx) {
    const trial = [...board] as Board;
    trial[i] = 2;
    const score = minimax(trial, 1, 1);
    scored.push({ idx: i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // 从最优的 2 个里随机挑一个，制造波动
  const top = scored.slice(0, Math.min(2, scored.length));
  return top[Math.floor(Math.random() * top.length)].idx;
}

type Status =
  | { kind: 'playing'; turn: 1 | 2 }
  | { kind: 'over'; winner: 1 | 2 | 0 };

export function TicTacToe({ difficulty, onDifficultyChange }: { difficulty: Difficulty; onDifficultyChange: (d: Difficulty) => void }) {
  const [board, setBoard] = useState<Board>(EMPTY);
  const [status, setStatus] = useState<Status>({ kind: 'playing', turn: 1 });
  const [aiThinking, setAiThinking] = useState(false);
  const { bump } = useGameScore('tictactoe');

  // 胜负变化时记录比分
  const result = judge(board);
  useEffect(() => {
    if (status.kind === 'over') {
      if (status.winner === 1) bump('win');
      else if (status.winner === 2) bump('loss');
      else bump('draw');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // AI 落子：轮到 AI 且未结束时，延迟一点模拟思考
  useEffect(() => {
    if (status.kind === 'playing' && status.turn === 2 && !aiThinking && result === null) {
      setAiThinking(true);
      const timer = setTimeout(() => {
        const move = pickAiMove(board, difficulty);
        if (move >= 0) {
          const next = [...board] as Board;
          next[move] = 2;
          setBoard(next);
          setStatus({ kind: 'playing', turn: 1 });
        }
        setAiThinking(false);
      }, 420);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, status, difficulty]);

  const onCell = useCallback(
    (i: number) => {
      if (status.kind !== 'playing' || status.turn !== 1 || board[i] !== 0 || aiThinking) return;
      const next = [...board] as Board;
      next[i] = 1;
      setBoard(next);
      const r = judge(next);
      if (r === 1) setStatus({ kind: 'over', winner: 1 });
      else if (r === 2) setStatus({ kind: 'over', winner: 2 });
      else if (r === 0) setStatus({ kind: 'over', winner: 0 });
      else setStatus({ kind: 'playing', turn: 2 });
    },
    [board, status, aiThinking],
  );

  const restart = useCallback(() => {
    setBoard(EMPTY);
    setStatus({ kind: 'playing', turn: 1 });
    setAiThinking(false);
  }, []);

  const statusBar = useMemo(() => {
    if (status.kind === 'over') {
      const msg =
        status.winner === 1 ? '你赢了！🎉' : status.winner === 2 ? 'AI 赢了，再来一局' : '平局，势均力敌';
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
      <div className="mb-4 rounded-2xl bg-surface-2/60 px-4 py-2.5 text-center text-[12px] text-muted-foreground">
        轮到你落子（你执 X）
      </div>
    );
  }, [status, aiThinking, restart]);

  return (
    <GameRoom gameId="tictactoe" difficulty={difficulty} onDifficultyChange={onDifficultyChange} status={statusBar}>
      {/* 棋盘 3x3 */}
      <div className="grid grid-cols-3 gap-2.5">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onCell(i)}
            disabled={cell !== 0 || status.kind === 'over' || aiThinking || status.turn !== 1}
            data-testid={`ttt-cell-${i}`}
            className="aspect-square w-full rounded-2xl border border-border bg-surface-2/50 text-[40px] font-bold leading-none transition hover:bg-surface-2 active:scale-95 disabled:cursor-default disabled:opacity-60"
          >
            {cell === 1 ? '✕' : cell === 2 ? '◯' : ''}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={restart}
        className="mt-5 w-full rounded-2xl bg-surface-2 py-3 text-[13px] font-medium text-foreground transition hover:bg-surface-2/80 active:scale-[0.99]"
      >
        重新开始
      </button>
    </GameRoom>
  );
}

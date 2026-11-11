import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getGame } from './gameMeta';
import { TicTacToe } from './TicTacToe';
import { Gomoku } from './Gomoku';
import { Memory } from './Memory';
import type { Difficulty } from './GameRoom';

/**
 * 游戏对战入口（/games/:gameId）：
 * 根据路由参数分发到具体游戏，并把难度状态提升到这里统一管理
 * （难度切换时无需重开，直接传给游戏组件响应）。
 */
export function GameEntry() {
  const { gameId } = useParams<{ gameId: string }>();
  const meta = getGame(gameId ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(meta?.difficulty ?? 2);

  // 从一个游戏切到另一个（同组件、不同 gameId）时，难度重置为目标游戏的默认值
  useEffect(() => {
    setDifficulty(meta?.difficulty ?? 2);
  }, [gameId, meta?.difficulty]);

  if (!meta) {
    return null;
  }

  const onDifficultyChange = (d: Difficulty) => {
    setDifficulty(d);
  };

  switch (meta.id) {
    case 'tictactoe':
      return <TicTacToe difficulty={difficulty} onDifficultyChange={onDifficultyChange} />;
    case 'gomoku':
      return <Gomoku difficulty={difficulty} onDifficultyChange={onDifficultyChange} />;
    case 'memory':
      return <Memory difficulty={difficulty} onDifficultyChange={onDifficultyChange} />;
    default:
      return null;
  }
}

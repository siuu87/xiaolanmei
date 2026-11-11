import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';
import { GameRoom, useGameScore, type Difficulty } from './GameRoom';

/**
 * 记忆翻牌（2026-11-11）：4×4 共 8 对，玩家与 AI 轮流翻两张配对。
 *
 * 核心是「AI 有记忆」：凡是被翻开过的牌（无论谁翻的、是否又盖回去），
 * AI 都记在 `seen` 里。轮到 AI 时：
 *   - 已知配对 → 直接翻两张收走；
 *   - 没有已知配对 → 困难难度先翻一张「已知单牌」去找配，否则翻未知牌扩充记忆。
 * 简单难度有概率「健忘」随机翻，制造输赢波动。
 * 谁配对多谁赢，平局也算一种结果。
 */

const EMOJIS = ['🫐', '🍓', '🍒', '🍋', '🍇', '🍑', '🥝', '🌸'];
const TOTAL_PAIRS = EMOJIS.length;

interface Card {
  id: number;
  emoji: string;
  matched: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newBoard(): Card[] {
  const pairs = EMOJIS.flatMap((e) => [e, e]);
  return shuffle(pairs).map((emoji, id) => ({ id, emoji, matched: false }));
}

/** 已翻开过的牌记忆：index -> emoji */
type Seen = Record<number, string>;

/** 找出已知可配对的（两张都见过且同 emoji） */
function findKnownPairs(seen: Seen, unmatched: number[]): [number, number][] {
  const map = new Map<string, number[]>();
  for (const i of unmatched) {
    const e = seen[i];
    if (e) {
      if (!map.has(e)) map.set(e, []);
      map.get(e)!.push(i);
    }
  }
  const pairs: [number, number][] = [];
  for (const arr of map.values()) if (arr.length >= 2) pairs.push([arr[0], arr[1]]);
  return pairs;
}

/** AI 第一张：优先已知配对，困难会去翻已知单牌找配，否则翻未知 */
function aiChooseFirst(seen: Seen, unmatched: number[], difficulty: Difficulty): number {
  const pairs = findKnownPairs(seen, unmatched);
  if (pairs.length) {
    if (difficulty === 1 && Math.random() < 0.4) {
      return unmatched[Math.floor(Math.random() * unmatched.length)];
    }
    return pairs[0][0];
  }
  if (difficulty === 3) {
    const singles = unmatched.filter((i) => seen[i]);
    if (singles.length) return singles[Math.floor(Math.random() * singles.length)];
  }
  const unknown = unmatched.filter((i) => !seen[i]);
  return unknown.length ? unknown[Math.floor(Math.random() * unknown.length)] : unmatched[0];
}

/** AI 第二张：若第一张有已知配对则收走，否则翻未知扩充记忆 */
function aiChooseSecond(board: Card[], seen: Seen, first: number, unmatched: number[]): number {
  const firstEmoji = seen[first] ?? board[first].emoji;
  const partner = unmatched.find((i) => i !== first && seen[i] === firstEmoji);
  if (partner !== undefined) return partner;
  const unknown = unmatched.filter((i) => i !== first && !seen[i]);
  if (unknown.length) return unknown[Math.floor(Math.random() * unknown.length)];
  return unmatched.find((i) => i !== first) ?? first;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function Memory({ difficulty, onDifficultyChange }: { difficulty: Difficulty; onDifficultyChange: (d: Difficulty) => void }) {
  const [board, setBoard] = useState<Card[]>(newBoard);
  const [faceUp, setFaceUp] = useState<number[]>([]);
  const [seen, setSeen] = useState<Seen>({});
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [busy, setBusy] = useState(false);
  const [playerPairs, setPlayerPairs] = useState(0);
  const [aiPairs, setAiPairs] = useState(0);
  const { bump } = useGameScore('memory');

  // refs 供 AI 异步流程读取最新状态
  const boardRef = useRef(board);
  const seenRef = useRef(seen);
  boardRef.current = board;
  seenRef.current = seen;

  // 谁赢：全部配完时比较
  const over =
    playerPairs + aiPairs >= TOTAL_PAIRS
      ? playerPairs > aiPairs
        ? 'win'
        : playerPairs < aiPairs
          ? 'loss'
          : 'draw'
      : null;

  // 结束时记比分
  useEffect(() => {
    if (over === 'win') bump('win');
    else if (over === 'loss') bump('loss');
    else if (over === 'draw') bump('draw');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  const goAiTurn = useCallback(() => {
    setTurn('ai');
  }, []);

  // 玩家翻牌
  const onPlayerFlip = useCallback(
    (idx: number) => {
      if (turn !== 'player' || busy || over) return;
      if (faceUp.length >= 2) return;
      const card = board[idx];
      if (card.matched || faceUp.includes(idx)) return;
      const next = [...faceUp, idx];
      setFaceUp(next);
      setSeen((s) => (s[idx] ? s : { ...s, [idx]: card.emoji }));

      if (next.length === 2) {
        const [a, b] = next;
        if (board[a].emoji === board[b].emoji) {
          // 配对成功
          setTimeout(() => {
            setBoard((bs) => bs.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)));
            setPlayerPairs((p) => p + 1);
            setFaceUp([]);
            goAiTurn();
          }, 380);
        } else {
          // 失败，盖回去，交给 AI
          setBusy(true);
          setTimeout(() => {
            setFaceUp([]);
            setBusy(false);
            goAiTurn();
          }, 780);
        }
      }
    },
    [turn, busy, over, faceUp, board, goAiTurn],
  );

  // AI 回合
  useEffect(() => {
    if (turn !== 'ai' || busy || faceUp.length > 0 || over) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      const b = boardRef.current;
      const s = seenRef.current;
      const unmatched = b.map((c, i) => (c.matched ? -1 : i)).filter((i) => i >= 0);

      // 第一张
      let first = aiChooseFirst(s, unmatched, difficulty);
      setFaceUp([first]);
      setSeen((prev) => (prev[first] ? prev : { ...prev, [first]: b[first].emoji }));
      await delay(340);
      if (cancelled) return;

      // 第二张（基于看到第一张后的知识）
      const b2 = boardRef.current;
      const s2 = { ...seenRef.current, [first]: b2[first].emoji };
      let second = aiChooseSecond(b2, s2, first, unmatched);
      setFaceUp([first, second]);
      setSeen((prev) => ({ ...prev, [second]: b2[second].emoji }));
      await delay(420);
      if (cancelled) return;

      const b3 = boardRef.current;
      if (b3[first].emoji === b3[second].emoji) {
        // AI 配对成功
        setBoard((bs) => bs.map((c, i) => (i === first || i === second ? { ...c, matched: true } : c)));
        setAiPairs((p) => p + 1);
        setFaceUp([]);
        await delay(220);
      } else {
        await delay(620);
        setFaceUp([]);
      }
      if (cancelled) return;
      setTurn('player');
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [turn, busy, faceUp.length, over, difficulty]);

  const restart = useCallback(() => {
    setBoard(newBoard());
    setFaceUp([]);
    setSeen({});
    setTurn('player');
    setBusy(false);
    setPlayerPairs(0);
    setAiPairs(0);
  }, []);

  const statusBar = (
    <div className="mb-4">
      {over ? (
        <div className="rounded-2xl bg-surface-2/60 px-4 py-3 text-center text-[13px] font-medium text-foreground">
          {over === 'win' ? `你 ${playerPairs} : ${aiPairs} AI，赢了！🎉` : over === 'loss' ? `你 ${playerPairs} : ${aiPairs} AI，AI 记得更牢` : `${playerPairs} : ${aiPairs} 平局`}
          <button onClick={restart} className="ml-3 inline-flex items-center gap-1 text-[11px] font-normal text-primary underline-offset-2 hover:underline">
            <RefreshCw className="h-3 w-3" /> 再来一局
          </button>
        </div>
      ) : turn === 'ai' ? (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2/60 px-4 py-3">
          <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI 正在翻牌…
          </span>
          <Score label="你" value={playerPairs} tone="text-emerald-500" />
          <span className="text-[11px] text-muted-foreground">:</span>
          <Score label="AI" value={aiPairs} tone="text-rose-500" />
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-2xl bg-surface-2/60 px-4 py-3">
          <span className="text-[12px] text-muted-foreground">轮到你翻两张</span>
          <Score label="你" value={playerPairs} tone="text-emerald-500" />
          <span className="text-[11px] text-muted-foreground">:</span>
          <Score label="AI" value={aiPairs} tone="text-rose-500" />
        </div>
      )}
    </div>
  );

  return (
    <GameRoom gameId="memory" difficulty={difficulty} onDifficultyChange={onDifficultyChange} status={statusBar}>
      {/* 4×4 棋盘，带 3D 翻牌动画 */}
      <div
        className="grid grid-cols-4 gap-2.5"
        style={{ perspective: '700px' }}
      >
        {board.map((card, idx) => {
          const flipped = card.matched || faceUp.includes(idx);
          const clickable = turn === 'player' && !busy && !over && !card.matched && !faceUp.includes(idx) && faceUp.length < 2;
          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => onPlayerFlip(idx)}
              disabled={!clickable}
              data-testid={`memory-cell-${idx}`}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ transformStyle: 'preserve-3d' }}
              className={
                'relative aspect-square w-full rounded-xl border transition disabled:cursor-default ' +
                (card.matched
                  ? 'border-transparent bg-surface-2/40 opacity-60'
                  : 'border-border bg-surface-2/60 hover:bg-surface-2 active:scale-95')
              }
            >
              {/* 背面 */}
              <span className="absolute inset-0 flex items-center justify-center text-[22px] [backface-visibility:hidden]">
                🫐
              </span>
              {/* 正面 */}
              <span className="absolute inset-0 flex items-center justify-center text-[26px] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                {card.emoji}
              </span>
            </motion.button>
          );
        })}
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

function Score({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`text-base font-semibold tabular-nums ${tone}`}>
      {value}
      <span className="ml-1 text-[10px] font-normal text-muted-foreground">{label}</span>
    </span>
  );
}

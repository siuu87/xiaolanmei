import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { aiGameFileUrl, listAiGames, type AiGame } from '@/lib/api/games';
import { useGameScore } from './GameRoom';

/**
 * 游戏屋首页（/games，2026-11-13 改版：童趣 + 一物一形）
 *
 * 用户：「游戏屋改成童趣活泼一点的风格，不要光是卡片，可以变变形式」。
 * 所以这页不再是三张一模一样的卡片，而是三种「摆件」：
 *   1. 五子棋 = 一条横着的木棋盘（棋子已经在上面了）；
 *   2. 井字棋 = 一块挂在墙上的磁贴板（画了 × 和 ○）；
 *   3. 记忆翻牌 = 桌上摊开的一叠牌（最上面那张翻开了一半）。
 * 三种尺寸、三种材质、各自轻微歪一点，看起来像儿童房的玩具角。
 *
 * 三款游戏本身没动（TicTacToe / Gomoku / Memory 仍是原来的实现），
 * 这页只负责「挑一个」。
 */
export function GamesPage() {
  const navigate = useNavigate();
  const go = (id: string) => navigate(`/games/${id}`);
  const [aiGames, setAiGames] = useState<AiGame[]>([]);
  const [openGame, setOpenGame] = useState<AiGame | null>(null);

  useEffect(() => {
    let alive = true;
    void listAiGames().then((list) => { if (alive) setAiGames(list); });
    return () => { alive = false; };
  }, []);

  // Esc 走 capture，别让游戏 iframe / 页面里的其他监听先吃掉
  useEffect(() => {
    if (!openGame) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpenGame(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openGame]);

  return (
    <PageShell title="游戏屋" eyebrow="PLAYROOM" className="games-page">
      {/* 点阵纸底：儿童房的方格纸，铺在最下面一层 */}
      <div aria-hidden className="games-dots pointer-events-none absolute inset-0" />

      <div className="relative">
        {/* 一句话：像门口挂着的小木牌 */}
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[17px] font-semibold leading-tight text-foreground">
              今天想玩哪个？
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              他就在对面等着，本地对战，不花 token
            </p>
          </div>
          <Doodle className="-mb-1 h-8 w-12 text-[#F0A868]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* ---------------- 五子棋：一条木棋盘 ---------------- */}
          <motion.button
            type="button"
            onClick={() => go('gomoku')}
            data-testid="game-card-gomoku"
            whileTap={{ scale: 0.985 }}
            className="col-span-2 relative overflow-hidden rounded-[22px] border border-[#E0C79B] bg-gradient-to-b from-[#F2E0BE] to-[#E7CFA6] p-0 text-left shadow-[0_10px_22px_-16px_rgba(120,84,40,.7)] transition hover:-translate-y-0.5 dark:border-[#3B2F22] dark:from-[#33291C] dark:to-[#2A2217]"
          >
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold leading-tight text-[#5A4227] dark:text-[#EADCC4]">
                  五子棋
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[#8A6C46] dark:text-[#B79E7C]">
                  五子连珠。他会堵你的活三，也会偷偷给自己留一手。
                </p>
                <ScoreLine gameId="gomoku" className="mt-1 block text-[#9A7B52] dark:text-[#9E8768]" />
              </div>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#5A4227] px-2.5 py-1.5 text-[11px] font-medium text-[#F7EAD3] dark:bg-[#EADCC4] dark:text-[#3A2C1B]">
                开局
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>
            {/* 棋盘面：木纹 + 格线 + 已经落下的五颗子 */}
            <GomokuStrip />
          </motion.button>

          {/* ---------------- 井字棋：墙上的磁贴板 ---------------- */}
          <motion.button
            type="button"
            onClick={() => go('tictactoe')}
            data-testid="game-card-tictactoe"
            whileTap={{ scale: 0.97 }}
            className="group flex flex-col items-center gap-2 transition"
          >
            <span className="flex h-[196px] w-full items-center justify-center">
              <span className="relative block w-full -rotate-[1.6deg] rounded-[18px] border-[3px] border-[#D9C6A6] bg-[#FBF3E4] p-2 shadow-[0_8px_18px_-12px_rgba(120,84,40,.75)] transition group-hover:-rotate-[0.6deg] dark:border-[#3E3327] dark:bg-[#241E17]">
                <span className="block rounded-[10px] bg-[#EAF2EA] p-[6px] dark:bg-[#1D2622]">
                  <span className="grid grid-cols-3 gap-[5px]">
                    {TTT_CELLS.map((c, i) => (
                      <span
                        key={i}
                        className="flex aspect-square items-center justify-center rounded-[6px] bg-white/75 text-[21px] font-bold leading-none shadow-[inset_0_-1px_0_rgba(120,140,130,.12)] dark:bg-white/10 dark:shadow-none"
                        style={{ color: c === 'x' ? '#E4807A' : c === 'o' ? '#5E9BBF' : undefined }}
                      >
                        {c === 'x' ? '✕' : c === 'o' ? '◯' : ''}
                      </span>
                    ))}
                  </span>
                </span>
              </span>
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[12.5px] font-medium text-[#5A4227] dark:text-[#EADCC4]">
                井字棋
              </span>
              <ScoreLine gameId="tictactoe" />
            </span>
          </motion.button>

          {/* ---------------- 记忆翻牌：摊开的一叠牌 ---------------- */}
          <motion.button
            type="button"
            onClick={() => go('memory')}
            data-testid="game-card-memory"
            whileTap={{ scale: 0.97 }}
            className="group flex flex-col items-center gap-2 transition"
          >
            <span className="relative flex h-[196px] w-full items-end justify-center pb-1">
              {[
                { rot: -14, x: -40, z: 1, face: false },
                { rot: 12, x: 40, z: 2, face: false },
                { rot: -2, x: 0, z: 3, face: true },
              ].map((c, i) => (
                <span
                  key={i}
                  className="absolute bottom-1 left-1/2 h-[118px] w-[84px] rounded-[11px] border border-[#DAB9C6] bg-[#FDF1F4] shadow-[0_8px_16px_-10px_rgba(140,90,100,.75)] transition group-hover:-translate-y-0.5 dark:border-[#4A343C] dark:bg-[#2A2024]"
                  style={{
                    transform: `translateX(calc(-50% + ${c.x}px)) rotate(${c.rot}deg)`,
                    zIndex: c.z,
                  }}
                >
                  {c.face ? (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1">
                      <span className="text-[28px] leading-none">🫐</span>
                      <span className="text-[9px] tracking-[0.18em] text-[#C68C9E] dark:text-[#A87C8A]">
                        BLUEBERRY
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="absolute inset-[6px] rounded-[6px] border border-dashed border-[#E3C1CD] dark:border-[#5A4048]" />
                      <span className="absolute inset-0 flex items-center justify-center text-[24px] font-semibold text-[#C68C9E] dark:text-[#A87C8A]">
                        ?
                      </span>
                    </>
                  )}
                </span>
              ))}
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[12.5px] font-medium text-[#5A4227] dark:text-[#EADCC4]">
                记忆翻牌
              </span>
              <ScoreLine gameId="memory" />
            </span>
          </motion.button>
        </div>

        {/* AI 现画的小游戏：他说一声就会多一个 */}
        <div className="mt-4 rounded-[18px] border border-dashed border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              还想玩什么？在聊天里说一声，他就现画一个放这儿
            </p>
          </div>
          {aiGames.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {aiGames.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  data-testid={`ai-game-${g.id}`}
                  onClick={() => setOpenGame(g)}
                  className="rounded-[14px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:-translate-y-0.5"
                >
                  <span className="block truncate text-[12.5px] font-medium text-foreground">{g.title}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                    {g.description || '点开就能玩'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {openGame && createPortal(
          <div
            className="fixed inset-0 z-[1500] flex flex-col bg-black/85"
            role="dialog"
            aria-modal="true"
            aria-label={openGame.title}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenGame(null); }}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-white">{openGame.title}</p>
                <p className="truncate text-[10.5px] text-white/60">他现画的小游戏</p>
              </div>
              <button
                type="button"
                aria-label="关闭游戏"
                onClick={() => setOpenGame(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe
              title={openGame.title}
              src={aiGameFileUrl(openGame.id)}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          </div>,
          document.body,
        )}

        {/* 页脚：一句铅笔写的悄悄话 */}
        <p className="mt-7 text-center">
          <span className="inline-block -rotate-[0.8deg] border-b border-dashed border-border pb-0.5 text-[11.5px] text-muted-foreground/70">
            赢了他会夸你，输了也会哄你
          </span>
        </p>
      </div>
    </PageShell>
  );
}

/** 井字棋板面上的局面（x / o / 空） */
const TTT_CELLS: string[] = ['x', 'o', '', '', 'x', 'o', '', '', 'x'];

/** 战绩：读本地比分，没打过就说「还没交过手」 */
function ScoreLine({ gameId, className }: { gameId: string; className?: string }) {
  const { score } = useGameScore(gameId);
  const played = score.win + score.loss + score.draw;
  const text =
    played === 0
      ? '还没交过手'
      : `${score.win} 胜 · ${score.loss} 负${score.draw ? ` · ${score.draw} 平` : ''}`;
  return <span className={`text-[10.5px] text-muted-foreground/90 ${className ?? ''}`}>{text}</span>;
}

/** 五子棋：木纹棋盘上斜着一串已落的子 */
function GomokuStrip() {
  // 棋子按「交叉点」坐标摆（left / bottom 都是交叉点的位置），斜着连成一线
  const stones = [
    { x: 158, y: 14, dark: true },
    { x: 176, y: 32, dark: true },
    { x: 194, y: 50, dark: true },
    { x: 212, y: 68, dark: true },
    { x: 230, y: 86, dark: true },
    { x: 194, y: 86, dark: false },
    { x: 230, y: 32, dark: false },
  ];
  return (
    <span className="relative block h-[92px] w-full overflow-hidden bg-[#E9CFA4] dark:bg-[#2A2116]">
      {/* 格线 */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.55] dark:opacity-[0.3]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to right, #B99866 0 1px, transparent 1px 18px), repeating-linear-gradient(to bottom, #B99866 0 1px, transparent 1px 18px)',
        }}
      />
      {stones.map((s, i) => (
        <span
          key={i}
          className="absolute h-[13px] w-[13px] rounded-full"
          style={{
            left: s.x,
            bottom: s.y,
            transform: 'translate(-50%, 50%)',
            background: s.dark
              ? 'radial-gradient(circle at 32% 28%, #8C8C95, #26262E 66%)'
              : 'radial-gradient(circle at 32% 28%, #FFFFFF, #DED8CE 62%)',
            boxShadow:
              '0 0 0 0.5px rgba(255,255,255,.22), 0 1.5px 3px rgba(40,26,12,.45)',
          }}
        />
      ))}
    </span>
  );
}

/** 手绘感的小装饰（门口那支歪歪扭扭的箭头） */
function Doodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 32" fill="none" className={className} aria-hidden>
      <path
        d="M3 26c6-9 16-14 27-13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="3 3.5"
      />
      <path
        d="M25 8l7 4.5-7 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

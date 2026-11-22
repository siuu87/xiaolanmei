/**
 * AsciiFishTank —— 桌宠位的全息 ASCII 鱼缸（2026-11-19 晚重做）
 *
 * 用户参考「赛博电子宠物 · 全息 ASCII 桌宠鱼缸」：上一版 `ElectronicFish`
 * 是纯 SVG 静态动画，不能互动。现在改成 ASCII 字符画的全息鱼缸：
 *   - 深底 + 青色辉光 + 扫描线，一块小全息屏的观感
 *   - ASCII 小鱼在缸里巡游，到边掉头
 *   - **点击 = 投喂**：食物从水面落下，鱼游过去吃掉，冒一串泡、小跳一下
 *   - **长按 = 冒泡**：缸里涌起一串气泡
 *   - 平时气泡缓缓上浮、水面波浪轻晃
 *
 * 实现：固定字符网格（16 列 × 11 行）+ 定时刷新，纯字符与 CSS，不依赖外部资源。
 * 尊重「减少动态」偏好：动画放慢，不再有长按冒泡的密集气泡。
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const COLS = 16;
const ROWS = 11;
/** 朝向右的鱼：圆身 + 眼睛 + 尾巴；6 字符宽，在小缸里也认得出来 */
const FISH_R = '(o)))>';
/** 朝向左的鱼（镜像） */
const FISH_L = '>)))o(';
const FISH_W = FISH_R.length;

interface FishState {
  x: number;
  y: number;
  baseY: number;
  dir: 1 | -1;
  /** 吃到食物时的小跳高度（0 = 不跳），逐帧衰减 */
  hop: number;
}
interface Food {
  id: number;
  x: number;
  y: number;
}
interface Bubble {
  id: number;
  x: number;
  y: number;
}

let uid = 0;
const nextId = () => ++uid;

/** 把鱼、食物、气泡、波浪拼成字符网格，返回每行字符串 */
function buildGrid(
  fish: FishState,
  foods: Food[],
  bubbles: Bubble[],
  wave: number,
): string[] {
  const g: string[][] = Array.from({ length: ROWS }, () => Array<string>(COLS).fill(' '));

  // 边框
  for (let c = 0; c < COLS; c++) {
    g[0][c] = c === 0 ? '┌' : c === COLS - 1 ? '┐' : '─';
    g[ROWS - 1][c] = c === 0 ? '└' : c === COLS - 1 ? '┘' : '─';
  }
  for (let r = 1; r < ROWS - 1; r++) {
    g[r][0] = '│';
    g[r][COLS - 1] = '│';
  }

  // 水面波浪（第 1 行内部，随时间平移）
  for (let c = 1; c < COLS - 1; c++) {
    if ((c + Math.round(wave)) % 5 < 3) g[1][c] = '~';
  }

  // 气泡（后画，浮在鱼前面也无妨，字符不重叠即可）
  for (const b of bubbles) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    if (x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1) g[y][x] = 'o';
  }

  // 食物
  for (const f of foods) {
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    if (x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1) g[y][x] = '*';
  }

  // 鱼（先画，让气泡/食物能盖住它，像在水里游）
  const sprite = fish.dir === 1 ? FISH_R : FISH_L;
  const fx = Math.round(fish.x);
  const fy = Math.round(fish.y);
  for (let j = 0; j < sprite.length; j++) {
    const x = fx + j;
    if (x > 0 && x < COLS - 1 && fy > 0 && fy < ROWS - 1) g[fy][x] = sprite[j];
  }

  return g.map((row) => row.join(''));
}

export function AsciiFishTank({ className = '' }: { className?: string }) {
  // 画面状态全放 ref，定时器每帧只触发一次轻量重渲染
  const [, setTick] = useState(0);
  const fishRef = useRef<FishState>({ x: 3, y: 5, baseY: 5, dir: 1, hop: 0 });
  const foodsRef = useRef<Food[]>([]);
  const bubblesRef = useRef<Bubble[]>([]);
  const waveRef = useRef(0);
  const spawnRef = useRef(0);
  const longTimerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const interval = reduce ? 380 : 100;
    const timer = window.setInterval(() => {
      const fish = fishRef.current;

      // 气泡上浮、出界移除
      bubblesRef.current = bubblesRef.current
        .map((b) => ({ ...b, y: b.y - 0.12, x: b.x + Math.sin(b.y * 0.9) * 0.03 }))
        .filter((b) => b.y > 1.2);

      // 鱼：有食物游向最近的一个，没有就左右巡游
      const foods = foodsRef.current;
      if (foods.length > 0) {
        const target = foods.reduce((a, b) =>
          Math.abs(b.x - fish.x) < Math.abs(a.x - fish.x) ? b : a,
        );
        if (target.x > fish.x + 0.05) fish.dir = 1;
        else if (target.x < fish.x - 0.05) fish.dir = -1;
        fish.x += fish.dir * 0.22;
        if (Math.abs(target.x - fish.x) < 0.7) {
          // 吃到：食物消失、鱼小跳、原地冒泡
          foodsRef.current = foodsRef.current.filter((f) => f.id !== target.id);
          fish.hop = 1;
          for (let i = 0; i < 2; i++) {
            bubblesRef.current.push({
              id: nextId(),
              x: target.x + (i - 0.5) * 1.2,
              y: target.y - 0.4,
            });
          }
        }
      } else {
        // 巡游速度 2026-11-21 用户觉得游得太快，从 0.16 放慢到 0.10（每 100ms 一格的 1/10）
        fish.x += fish.dir * 0.10;
        const minX = 0.5;
        const maxX = COLS - 2 - FISH_W - 0.3;
        if (fish.x <= minX) {
          fish.x = minX;
          fish.dir = 1;
        }
        if (fish.x >= maxX) {
          fish.x = maxX;
          fish.dir = -1;
        }
      }

      // 吃到的小跳：向基准行回弹
      if (fish.hop > 0) {
        fish.y = fish.baseY - fish.hop * 1.1;
        fish.hop = Math.max(0, fish.hop - 0.12);
        if (fish.hop === 0) fish.y = fish.baseY;
      }

      // 空闲冒泡：水面下随机冒一个，缸里气泡不堆太多
      spawnRef.current += 1;
      if (spawnRef.current >= (reduce ? 14 : 22) && bubblesRef.current.length < 7) {
        spawnRef.current = 0;
        bubblesRef.current.push({
          id: nextId(),
          x: 2 + Math.random() * (COLS - 5),
          y: ROWS - 3,
        });
      }

      waveRef.current += 0.35;
      setTick((t) => t + 1);
    }, interval);
    return () => window.clearInterval(timer);
  }, []);

  // 点击投喂；长按（400ms）改为冒泡，避免误触
  const clearLong = () => {
    if (longTimerRef.current != null) window.clearTimeout(longTimerRef.current);
    longTimerRef.current = null;
  };
  const onPointerDown = () => {
    longFiredRef.current = false;
    longTimerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      for (let i = 0; i < 5; i++) {
        bubblesRef.current.push({
          id: nextId(),
          x: 1 + Math.random() * (COLS - 3),
          y: ROWS - 3,
        });
      }
      setTick((t) => t + 1);
    }, 400);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    clearLong();
    if (longFiredRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * COLS;
    foodsRef.current.push({ id: nextId(), x: Math.min(Math.max(x, 1.5), COLS - 2.5), y: 2 });
    setTick((t) => t + 1);
  };

  const lines = buildGrid(fishRef.current, foodsRef.current, bubblesRef.current, waveRef.current);

  return (
    <div
      data-testid="ascii-fish-tank"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clearLong}
      onPointerCancel={clearLong}
      aria-label="全息 ASCII 鱼缸桌宠：点击投喂，长按冒泡"
      role="img"
      className={cn(
        'relative h-full w-full overflow-hidden rounded-2xl bg-[#0a151c] text-[#67e8f9]',
        'cursor-pointer select-none touch-manipulation active:scale-[0.97] transition',
        'shadow-[0_0_24px_-8px_rgba(103,232,249,0.45)]',
        className,
      )}
    >
      {/* 扫描线：全息屏的味道 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: 'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,0.28) 3px 4px)',
        }}
      />
      <pre
        className="relative flex h-full w-full items-center justify-center overflow-hidden whitespace-pre p-1.5 font-mono text-[8px] leading-[0.92] tracking-tight"
        style={{ textShadow: '0 0 6px rgba(103,232,249,0.55)' }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
}

export default AsciiFishTank;

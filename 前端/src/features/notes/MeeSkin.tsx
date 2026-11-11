import { cn } from '@/lib/utils';

/**
 * 「奶油手帐」皮肤层（2026-11-11）
 *
 * 参照 Mee 那封冬日回信的视觉：整屏是**一张微微发暖的米白纸**，
 * 上面只有三样装饰——细手写体、空心蓝色小星星、蓝色手写英文，
 * 外加一点点奶油黄做点缀。**没有阴影堆叠、没有深色描边、没有玻璃质感**。
 *
 * 这里只放「皮肤零件」：色板、纸纹、星星、字标、抬头药丸。
 * 信件业务组件（信封 / 卡片 / 弹窗 / 收信匣）各自来取，不互相复制颜色值。
 *
 * 为什么写死色而不走双主题 token：信件是「一张真实存在的纸」，
 * 纸在暗房间里也还是米白的；项目里 notes 模块本来就是写死色的语义模块
 * （见 MEMORY.md 主题速查），这里沿用同一个约定。
 */

export const MEE = {
  /** 舞台 / 页面底：极淡奶油，顶部比底部更暖一点 */
  page: '#FAF8F0',
  pageWarm: '#FFFDF5',
  /** 信纸：比舞台亮一档 */
  paper: '#FCFAF3',
  paperEdge: '#F0ECDE',
  /** 信封：略灰一档的米白，才分得出「纸」和「信封」 */
  envelope: '#F1EEE3',
  envelopeShade: '#E6E1D2',
  /** 墨色：近黑但不纯黑，手写体配纯黑会太硬 */
  ink: '#3E3D38',
  inkSoft: '#6B685E',
  meta: '#9C988B',
  /** 蓝色手绘星星 */
  blue: '#5B8DDE',
  blueLight: '#A9C6EE',
  /** 奶油黄：只用在抬头药丸 / 小按钮 */
  yellow: '#FFE48C',
  yellowDeep: '#F4CD63',
} as const;

/* ------------------------------ 纸纹 ------------------------------ */

/**
 * 极淡的纸张颗粒。铺满父容器，**必须**配合 `pointer-events-none` 与 `absolute inset-0`。
 * .mee-grain 的具体纹理在 index.css 里（用点阵模拟，不加载图片，离线也有质感）。
 */
export function MeeGrain({ className }: { className?: string }) {
  return <span aria-hidden className={cn('mee-grain pointer-events-none absolute inset-0', className)} />;
}

/* ------------------------------ 星星 ------------------------------ */

type StarKind = 'sparkle' | 'star' | 'cross' | 'dot';
type StarSpec = {
  /** 百分比坐标 */
  x: number;
  y: number;
  /** 直径 px */
  s: number;
  k: StarKind;
  /** 旋转角 */
  r?: number;
  /** 不透明度 0~1 */
  o?: number;
};

/**
 * 星星坐标是**写死的**，不是 Math.random：
 * 随机会让每次渲染 / 深浅主题切换时星星乱跳，手帐是要摆好位置的。
 * 四芒星（sparkle）、空心五芒星（star）、小十字（cross）、点（dot）混着来，
 * 才像手绘而不是贴图。
 */
const PAGE_STARS: StarSpec[] = [
  { x: 6, y: 7, s: 15, k: 'star', r: -12, o: 0.42 },
  { x: 88, y: 5, s: 13, k: 'sparkle', o: 0.4 },
  { x: 17, y: 15, s: 9, k: 'cross', o: 0.35 },
  { x: 94, y: 18, s: 11, k: 'star', r: 14, o: 0.36 },
  { x: 4, y: 27, s: 12, k: 'sparkle', o: 0.34 },
  { x: 79, y: 29, s: 8, k: 'dot', o: 0.3 },
  { x: 11, y: 39, s: 10, k: 'cross', o: 0.3 },
  { x: 92, y: 42, s: 14, k: 'sparkle', o: 0.38 },
  { x: 3, y: 55, s: 9, k: 'star', r: 8, o: 0.32 },
  { x: 86, y: 57, s: 10, k: 'cross', o: 0.32 },
  { x: 20, y: 66, s: 12, k: 'sparkle', o: 0.3 },
  { x: 96, y: 70, s: 9, k: 'dot', o: 0.28 },
  { x: 7, y: 78, s: 13, k: 'star', r: -8, o: 0.34 },
  { x: 76, y: 84, s: 11, k: 'sparkle', o: 0.32 },
  { x: 30, y: 92, s: 8, k: 'cross', o: 0.28 },
  { x: 91, y: 94, s: 12, k: 'star', o: 0.3 },
];

/** 信封上的星星：更蓝、更实、更集中在封盖三角内 */
const ENVELOPE_STARS: StarSpec[] = [
  { x: 22, y: 16, s: 13, k: 'sparkle', o: 0.95 },
  { x: 44, y: 11, s: 11, k: 'star', r: -8, o: 0.9 },
  { x: 72, y: 15, s: 15, k: 'sparkle', o: 0.95 },
  { x: 14, y: 34, s: 12, k: 'star', o: 0.9 },
  { x: 85, y: 33, s: 11, k: 'sparkle', o: 0.9 },
  { x: 31, y: 51, s: 9, k: 'cross', o: 0.75 },
  { x: 66, y: 49, s: 12, k: 'sparkle', o: 0.9 },
  { x: 12, y: 69, s: 13, k: 'star', r: 10, o: 0.85 },
  { x: 48, y: 72, s: 10, k: 'sparkle', o: 0.85 },
  { x: 82, y: 68, s: 12, k: 'star', o: 0.85 },
  { x: 26, y: 86, s: 9, k: 'dot', o: 0.6 },
  { x: 70, y: 89, s: 10, k: 'cross', o: 0.65 },
];

/** 单颗星星的路径（24×24 画布，线描空心，跟参考图的手绘感一致） */
const STAR_PATH: Record<StarKind, string> = {
  // 四芒星：中间胖、四头尖
  sparkle: 'M12 1.5 C12.7 8.2 15.8 11.3 22.5 12 C15.8 12.7 12.7 15.8 12 22.5 C11.3 15.8 8.2 12.7 1.5 12 C8.2 11.3 11.3 8.2 12 1.5 Z',
  // 空心五芒星
  star: 'M12 2.2 L14.8 8.7 L21.9 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2.1 9.3 L9.2 8.7 Z',
  // 小十字
  cross: 'M12 4.5 L12 19.5 M4.5 12 L19.5 12',
  dot: '',
};

function Star({ spec, color }: { spec: StarSpec; color: string }) {
  const { x, y, s, k, r = 0, o = 1 } = spec;
  if (k === 'dot') {
    return (
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: s * 0.32,
          height: s * 0.32,
          background: color,
          opacity: o,
          transform: 'translate(-50%, -50%)',
        }}
      />
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={s}
      height={s}
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        color,
        opacity: o,
        transform: `translate(-50%, -50%) rotate(${r}deg)`,
      }}
    >
      <path
        d={STAR_PATH[k]}
        fill="none"
        stroke="currentColor"
        strokeWidth={k === 'star' ? 1.35 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 散落星星层。父容器要 `relative`；本层 `absolute inset-0`，不吃点击。
 * - `preset="page"`：稀疏、很淡，铺在整屏 / 整页底上
 * - `preset="envelope"`：蓝色实心感、密一点，铺在信封纸面上
 */
export function StarSprinkles({
  preset = 'page',
  sparse = false,
  offset = 0,
  className,
}: {
  preset?: 'page' | 'envelope';
  /** 只取一半星星：信封的封盖和前面板各铺一层时用，避免两层叠太密 */
  sparse?: boolean;
  /** 配合 sparse 取另一半，让两层的星星错开 */
  offset?: 0 | 1;
  className?: string;
}) {
  const all = preset === 'envelope' ? ENVELOPE_STARS : PAGE_STARS;
  const specs = sparse ? all.filter((_, i) => i % 2 === offset) : all;
  const color = preset === 'envelope' ? MEE.blue : MEE.blueLight;
  return (
    <span aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {specs.map((s, i) => (
        <Star key={i} spec={s} color={color} />
      ))}
    </span>
  );
}

/* ------------------------------ 字标 / 抬头 ------------------------------ */

/**
 * 信封正中那行蓝色手写英文（参考图里是 "NowMee, Know me"）。
 * 小蓝莓版保留同一个句式，用 Caveat 手写花体。
 */
export function MeeWordmark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none block text-center font-script italic leading-[1.05]',
        className,
      )}
      style={{ color: MEE.blue }}
    >
      Blueberry,
      <br />
      Know you
    </span>
  );
}

/** 奶油黄药丸抬头：「一封来自小蓝莓的信」 */
export function MeeRibbon({
  children = '一封来自小蓝莓的信',
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 font-hand text-[11px] tracking-wide',
        className,
      )}
      style={{ background: MEE.yellow, color: MEE.ink }}
    >
      {children}
    </span>
  );
}

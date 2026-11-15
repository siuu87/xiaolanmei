import { cn } from '@/lib/utils';
import { letterParts, WaxSeal, type LetterTheme } from './LetterArt';

/**
 * 信封零件（2026-11-13 重做：从「翻盖」改成「撕开」）
 *
 * 用户的原话：「拆开的信件就保持拆开的样子，没拆开的就没有撕开的那个样子，
 * 然后信封可以编辑不同颜色，火漆印章也是……」——参考的是撕信封的手工教程。
 *
 * 所以这里只有两种形态，**不是动画的两帧，而是两个稳定状态**：
 *
 *   ● 未拆（opened=false）：完整信封。V 形封盖盖着上口，火漆完整压在封盖尖上，
 *     信纸藏在里面，只在口子里隐约看到一点。
 *   ● 已拆（opened=true）：**封盖已经被撕走了**。信封上沿留下一道不规则撕口，
 *     撕口边缘有毛边和一小块残留的蜡（火漆跟着封盖被撕掉一半），
 *     信纸从缺口里露出来一截。这个状态会一直保持——拆过的信不会自己长回去。
 *
 * 撕口用 CSS `clipPath: polygon()` 剪出来（十几个抖动点，写死不随机，两端渲染一致）；
 * 撕口那条深色毛边单独用 SVG 描，clip 之后还能看见纸的厚度。
 *
 * 父容器只管给宽高（**5:3** 横版长方形），内部全部按比例定位。
 */

/**
 * 撕口的抖动点（百分比对），从左上角一路走到中间、再走回右上角 ——
 * **沿着信封口那条 V 线**，这才是"把封盖整片撕掉"的轨迹：
 * 撕掉的就是那枚 V 形封盖，剩下一道带毛边的口子，纸从口子里露出来。
 * 抖动幅度控制在 1~2%，再多就成雪山了。
 */
const TEAR_POINTS = [
  [0, 3.2],
  [6, 9],
  [12, 12.4],
  [18, 19.2],
  [25, 22.8],
  [31, 30.2],
  [38, 36.2],
  [44, 39.4],
  [50, 45.2],
  [56, 43.6],
  [62, 35.6],
  [69, 29.4],
  [75, 23.6],
  [82, 17.4],
  [88, 12.8],
  [94, 8.6],
  [100, 3.6],
] as const;

/** 已拆状态的裁剪轮廓：上沿是撕口，其余三边是直角 */
const TORN_CLIP = `polygon(${TEAR_POINTS.map(([x, y]) => `${x}% ${y}%`).join(', ')}, 100% 100%, 0 100%)`;

/** 撕口那条线（SVG 用，viewBox 100×60 与信封同比例） */
const TEAR_LINE = TEAR_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${(y * 0.6).toFixed(2)}`).join(' ');

export function EnvelopeSeal({
  theme = 'default',
  className,
  size = 22,
  cracked = false,
}: {
  theme?: LetterTheme;
  className?: string;
  size?: number;
  cracked?: boolean;
}) {
  const p = letterParts(theme);
  return (
    <span
      data-testid="envelope-seal"
      aria-hidden
      className={cn('pointer-events-none inline-flex items-center justify-center', className)}
    >
      <WaxSeal parts={p} size={size} cracked={cracked} />
    </span>
  );
}

/** 信封背面（封盖翻开后看到的那一面）：比正面浅一档，像纸的背面 */
function backOf(theme: LetterTheme): string {
  switch (theme) {
    case 'memorial':
      return 'bg-gradient-to-t from-[#f7e3db] to-[#fbeae3]';
    case 'night':
      return 'bg-gradient-to-t from-[#161d31] to-[#202840]';
    case 'kraft':
      return 'bg-gradient-to-t from-[#e2c8a2] to-[#eed9b8]';
    case 'sage':
      return 'bg-gradient-to-t from-[#dfe6d3] to-[#eef1e4]';
    case 'lilac':
      return 'bg-gradient-to-t from-[#e9dff4] to-[#f5eefb]';
    default:
      return 'bg-gradient-to-t from-[#e8ddc9] to-[#f3ecdd]';
  }
}

export function EnvelopeArt({
  theme = 'default',
  opened = false,
  seal = true,
  sealSize,
  ribbon = true,
  className,
  children,
}: {
  theme?: LetterTheme;
  opened?: boolean;
  seal?: boolean;
  sealSize?: number;
  ribbon?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const p = letterParts(theme);

  return (
    <div
      data-testid="envelope-art"
      data-opened={opened ? '1' : '0'}
      data-letter-theme={theme}
      className={cn('relative isolate', className)}
    >
      {/* ============ 信封主体（已拆时上沿被撕掉一块） ============ */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: opened ? TORN_CLIP : undefined,
          transition: 'clip-path .38s ease-out',
        }}
      >
        {/* ① 背板：完整的矩形纸面 */}
        <div
          aria-hidden
          data-testid="envelope-body"
          className={cn(
            'absolute inset-0 rounded-[3px] ring-1 ring-inset',
            ringOf(theme),
            p.envelope,
            'shadow-[0_6px_16px_-6px_rgba(0,0,0,0.5)]',
          )}
        />

        {/* 纸纹：很淡的横向纤维，让平涂的色块像纸而不是塑料 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, rgba(255,255,255,.35) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.03) 0 1px, transparent 1px 4px)',
          }}
        />

        {/* ③ 前面板：顶边一道浅 V 缺口（到 45%），剩下 55% 是完整矩形纸面 */}
        <svg
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path d="M0 0 L50 27 L100 0 L100 60 L0 60 Z" fill={p.flapFill} />
          <path
            d="M0 0 L50 27 L100 0"
            fill="none"
            stroke={p.flapStroke}
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* 丝带：信封下半截那条细带 */}
        {ribbon && (
          <span
            aria-hidden
            className={cn('pointer-events-none absolute inset-x-0 bottom-[26%] h-px', ribbonOf(theme))}
          />
        )}
      </div>

      {/* ============ 信封口里的那一层：内壁 + 信纸 ============
          封着的时候被 V 形封盖整个盖住，撕开后才露出来。
          形状剪成 V 三角（上边全宽、下尖在中间），正好对着撕口 ——
          所以撕掉封盖后看到的不是卡片底色，而是信封里的纸。 */}
      <div
        aria-hidden={false}
        data-testid="envelope-pocket"
        className="pointer-events-none absolute inset-0"
        style={{ clipPath: 'polygon(0 0, 100% 0, 50% 46%)' }}
      >
        {/* 内壁：比信封深一档，纸和信封之间那道阴影 */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${p.flapStroke} 0%, ${p.envSolid} 60%)`,
            opacity: 0.9,
          }}
        />
        {/* 信纸 */}
        <div
          data-testid="envelope-paper-slot"
          className={cn('absolute inset-x-[7%] top-[1%] overflow-hidden rounded-t-[2px]', p.paper)}
          style={{
            height: opened ? '42%' : '38%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.14)',
            transition: 'height .45s ease-out',
          }}
        >
          {children}
        </div>
      </div>

      {/* ============ 未拆时：V 形封盖盖着上口 ============ */}
      {!opened && (
        <div
          data-testid="envelope-flap"
          className="pointer-events-none absolute inset-x-0 top-0 h-[45%] [perspective:400px]"
        >
          <div
            className="h-full w-full"
            style={{
              transformOrigin: 'top center',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.62s cubic-bezier(0.34,1.56,0.64,1) 0.16s',
              transform: 'rotateX(0deg)',
            }}
          >
            <div className="absolute inset-0 [backface-visibility:hidden]">
              <svg viewBox="0 0 100 27" preserveAspectRatio="none" aria-hidden className="h-full w-full">
                <path d="M0 0 L50 27 L100 0 Z" fill={p.flapFill} />
                <path
                  d="M0 0 L50 27 L100 0"
                  fill="none"
                  stroke={p.flapStroke}
                  strokeWidth="0.8"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <div
              aria-hidden
              className={cn('absolute inset-0 [backface-visibility:hidden]', backOf(theme))}
              style={{ transform: 'rotateX(180deg)' }}
            />
          </div>
        </div>
      )}

      {/* ============ 撕口：已拆时上沿那道毛边 + 残留的蜡 ============ */}
      {opened && (
        <>
          <svg
            viewBox="0 0 100 60"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            data-testid="envelope-tear"
          >
            {/* 撕口的深色毛边：比信封深一档，看着有厚度 */}
            <path
              d={TEAR_LINE}
              fill="none"
              stroke={p.flapStroke}
              strokeWidth="1.1"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.9"
            />
            {/* 毛边上的一点纤维：短小的浅色挑线 */}
            <path
              d="M14.6 8.1 l2.5 -1.7 M30.4 13.2 l2.4 -1.6 M60.8 13.8 l2.3 1.5 M81.2 8.8 l2.2 1.5"
              fill="none"
              stroke={p.paperSolid}
              strokeWidth="0.9"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.75"
            />
          </svg>

          {/* 残留的蜡：封盖被撕走时，火漆在信封上留了一小片 */}
          <svg
            aria-hidden
            viewBox="0 0 100 60"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <ellipse
              cx="34.2"
              cy="18.4"
              rx="3.6"
              ry="2.2"
              fill={p.sealBase}
              opacity="0.95"
              transform="rotate(-19 34.2 18.4)"
            />
            <ellipse
              cx="37.4"
              cy="20.6"
              rx="1.9"
              ry="1.2"
              fill={p.sealBase}
              opacity="0.82"
              transform="rotate(-14 37.4 20.6)"
            />
            <ellipse
              cx="34.6"
              cy="18.2"
              rx="2.3"
              ry="1.1"
              fill={p.sealDark}
              opacity="0.3"
              transform="rotate(-19 34.6 18.2)"
            />
            <circle cx="30.2" cy="16.4" r="0.85" fill={p.sealBase} opacity="0.8" />
            <circle cx="40.6" cy="21.8" r="0.6" fill={p.sealBase} opacity="0.62" />
          </svg>
        </>
      )}

      {/* ============ 火漆：未拆是完整一枚，已拆只剩撕口边那一小片（上面已画） ============ */}
      {seal && !opened && (
        <EnvelopeSeal
          theme={theme}
          size={sealSize ?? 22}
          className="absolute left-1/2 top-[22.5%] -translate-x-1/2 -translate-y-1/2"
        />
      )}
    </div>
  );
}

/** 信封那圈细描边：跟着主题走，暖色主题用金、夜色主题用银蓝 */
function ringOf(theme: LetterTheme): string {
  switch (theme) {
    case 'memorial':
      return 'ring-[#d9b53a]/45';
    case 'night':
      return 'ring-[#8fa6d8]/30';
    case 'kraft':
      return 'ring-[#8a6a44]/35';
    case 'sage':
      return 'ring-[#8a9b78]/40';
    case 'lilac':
      return 'ring-[#9b7fb8]/35';
    default:
      return 'ring-[#c9a227]/30';
  }
}

/** 丝带颜色：同理 */
function ribbonOf(theme: LetterTheme): string {
  switch (theme) {
    case 'memorial':
      return 'bg-[#d9b53a]/40';
    case 'night':
      return 'bg-[#8fa6d8]/25';
    case 'kraft':
      return 'bg-[#8a6a44]/30';
    case 'sage':
      return 'bg-[#8a9b78]/35';
    case 'lilac':
      return 'bg-[#9b7fb8]/30';
    default:
      return 'bg-[#b99a4e]/30';
  }
}

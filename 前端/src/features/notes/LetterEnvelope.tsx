import { cn } from '@/lib/utils';
import { letterParts, type LetterTheme } from './LetterArt';

/**
 * 信封零件（2026-10-20 新增）
 *
 * 参考《恋与制作人》「心动邀约」的信封：一封信 = **一枚能看出形状的实体信封**，
 * 而不是一张带封面图的卡片。所以这里画的是真正的信封结构，四层从下往上叠：
 *
 *   1. 背板   —— 信封的底（矩形，纸质渐变）
 *   2. 信纸   —— 夹在中间，平时藏在信封里，拆封时从口子里升出来
 *   3. 前面板 —— 遮住下半截，顶边是一个倒 V 缺口（露出信封口）
 *   4. 封盖   —— 就是那片三角（flap），**闭合**时盖住缺口、**拆封**时绕顶边向上翻开
 *
 * 拆封动作 = 封盖翻开 + 信纸升高，两件事一起做才像「拆信」；
 * 只做其中一个都会像「弹出一张图」。
 *
 * 配色沿用 `LetterArt.tsx` 的 `LETTER_THEME_PARTS`（default 米白纸 / memorial 玫瑰金 /
 * night 深蓝星空），新增主题只改那张表。
 */

/** 火漆印：封盖尖上那颗蜡封。拆封后跟着封盖走，所以由调用方决定露不露 */
export function EnvelopeSeal({
  theme = 'default',
  className,
  glow = true,
  children = '🫐',
}: {
  theme?: LetterTheme;
  className?: string;
  glow?: boolean;
  children?: React.ReactNode;
}) {
  const p = letterParts(theme);
  return (
    <span
      aria-hidden
      data-testid="envelope-seal"
      className={cn(
        'pointer-events-none flex items-center justify-center rounded-full',
        'shadow-[0_1px_2px_rgba(0,0,0,0.35)]',
        p.seal,
        glow && p.sealGlow,
        className,
      )}
    >
      {children}
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
    default:
      return 'bg-gradient-to-t from-[#e8ddc9] to-[#f3ecdd]';
  }
}

/**
 * 信封本体。`opened` 控制拆封：封盖翻开、信纸从口子里升出一小截。
 *
 * 父容器只管给宽高（**建议 5:3**，规整长方形），内部全部按比例定位。
 *
 * 2026-10-20 改长方形：原来封盖三角占了 52% 高、缺口深到中线，
 * 上半部看着是一整个大三角，整枚信封像「房子 / 五边形」而不是信封。
 * 现在缺口与封盖都收到 **45%**，剩下的 55% 是完整的矩形纸面，
 * 轮廓才是一个清爽的长方形。
 *
 * `children` 是**信纸内容**（一般是正文摘要或空），不传就只画一枚封好的信封。
 */
export function EnvelopeArt({
  theme = 'default',
  opened = false,
  seal = true,
  sealClass = 'h-4 w-4 text-[8px]',
  ribbon = true,
  /** 封盖掀开的角度。卡片里空间小，掀到底会顶出卡片被裁掉 → 卡片传的小一点 */
  flapAngle = 150,
  className,
  children,
}: {
  theme?: LetterTheme;
  opened?: boolean;
  seal?: boolean;
  sealClass?: string;
  ribbon?: boolean;
  flapAngle?: number;
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
      {/*
        ① 背板：这就是那枚**横版长方形信封**的本体 —— 一个完整的矩形纸面。
        `rounded-[3px]` 只留一点点圆角（纸的切口），外圈 `ring` 是恋与制作人那道细描边，
        两样一起把"长方形"的轮廓钉死，免得被上面的三角抢了注意力。
      */}
      <div
        aria-hidden
        data-testid="envelope-body"
        className={cn(
          'absolute inset-0 rounded-[3px] ring-1 ring-inset',
          ringOf(theme),
          p.envelope,
          'shadow-[0_6px_16px_-6px_rgba(0,0,0,0.55)]',
        )}
      />

      {/*
        ② 信纸：只露出信封口那一小截，不能整张浮出来 ——
           这是**卡片**，不是阅读器；整张露出来会盖住封盖翻开的动作，也会把卡片撑破。
           阅读器里信纸是另一套（从弹窗底部抽出来）。
      */}
      <div
        data-testid="envelope-paper-slot"
        className={cn(
          'absolute inset-x-[10%] top-[9%] h-[38%] overflow-hidden rounded-t-[2px]',
          'transition-transform duration-[450ms] ease-out',
          // 未读藏到缺口(45%)以下、已读升到缺口以上 —— 差值就是"露出一角"的量
          opened ? 'translate-y-[6%]' : 'translate-y-[30%]',
          p.paper,
        )}
      >
        {children}
      </div>

      {/*
        ③ 前面板：顶边一道浅 V 缺口（只到 45%）露出信封口，剩下 55% 是完整矩形纸面。
        viewBox 100×60 = 5:3 的横版长方形。
      */}
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

      {/* 丝带：信封下半截那条细带（心动邀约的装饰带） */}
      {ribbon && (
        <span
          aria-hidden
          className={cn('pointer-events-none absolute inset-x-0 bottom-[26%] h-px', ribbonOf(theme))}
        />
      )}

      {/*
        ④ 封盖：绕顶边向上翻。未拆 = 盖住信封口；已拆 = 立起来露出纸的背面。
        翻上去那一面要给浅色（backOf），否则翻开会是一块深色，看着像封盖凭空消失了。
      */}
      <div
        data-testid="envelope-flap"
        className="pointer-events-none absolute inset-x-0 top-0 h-[45%] [perspective:400px]"
      >
        <div
          className="h-full w-full transition-transform duration-500 ease-out"
          style={{
            transformOrigin: 'top center',
            transformStyle: 'preserve-3d',
            // 只翻到 flapAngle（默认 150°）：翻太多（180°）封盖会完全贴在信封背面看不见，
            // 翻太少又还挡着信纸。150° 时它斜立在信封后上方，像被随手掀开的盖子。
            transform: opened ? `rotateX(-${flapAngle}deg)` : 'rotateX(0deg)',
          }}
        >
          {/* 正面：V 形封盖 + 火漆（火漆压在尖端稍上，跟真实信封一样） */}
          <div className="absolute inset-0 [backface-visibility:hidden]">
            <svg
              viewBox="0 0 100 27"
              preserveAspectRatio="none"
              aria-hidden
              className="h-full w-full"
            >
              <path d="M0 0 L50 27 L100 0 Z" fill={p.flapFill} />
              <path
                d="M0 0 L50 27 L100 0"
                fill="none"
                stroke={p.flapStroke}
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {seal && (
              <EnvelopeSeal
                theme={theme}
                className={cn(
                  'absolute left-1/2 top-[74%] -translate-x-1/2 -translate-y-1/2',
                  sealClass,
                )}
              />
            )}
          </div>

          {/* 背面：翻上去之后看到的是纸的背面 */}
          <div
            aria-hidden
            className={cn('absolute inset-0 [backface-visibility:hidden]', backOf(theme))}
            style={{ transform: 'rotateX(180deg)' }}
          >
            <svg
              viewBox="0 0 100 27"
              preserveAspectRatio="none"
              className="h-full w-full"
            >
              <path
                d="M0 0 L50 27 L100 0"
                fill="none"
                stroke={p.flapStroke}
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>
      </div>
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
    default:
      return 'bg-[#b99a4e]/30';
  }
}

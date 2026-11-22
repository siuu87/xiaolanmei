import { useId } from 'react';
import { cn } from '@/lib/utils';
import { letterParts, WaxSeal, type LetterTheme } from './LetterArt';
import type { LetterCharm, LetterLook, LetterTexture } from './notesData';

/**
 * 一封信 · **常规信封**（2026-11-18 第五次改：外面看信封，里面才撕）
 *
 * 前四改都在纠结「怎么在一张 70 像素高的卡上把『撕过』画出来」，全部失败：
 * 撕条、锯齿、打孔线、邮票，缩到那个尺寸都糊成噪点。用户最后一句话把职责分清了：
 *
 *   ① **外面 = 常规信件**：一枚有火漆印章的信封 —— 合着是封完好，掀开是拆过；
 *   ② **里面 = 撕**：没拆过的信点开，才是那条撕条（`TearOpen`），
 *      撕开落地后回到原来那张信纸（`LetterSheetModal`）。
 *
 * 所以这里只画信封，**没有撕条、没有锯齿、没有毛边**：
 *
 *   - 合着（`opened=false`）：矩形信封，上沿压着一枚 V 形封盖，封盖尖端盖着火漆，
 *     两道侧折痕从下角收到中间 —— 一眼是「一封还没拆的信」。
 *   - 掀开（`opened=true`）：火漆掰开、封盖被掀下来搭在正面（露出**纸背**，比信封壳亮一档），
 *     信封口开着：顶边一道暗缝 + 一条亮纸边，火漆裂成两半还粘在盖尖上。
 *
 * 判据是「**一整块大三角的明暗 + 蜡裂没裂 + 口子开没开**」，不是轮廓 ——
 * 卡片自己还有一层卡片底色，靠剪影在相近的底色上根本读不出来（试过了，白改）。
 *
 * ★ 尺寸约束（用户定的）：外框一格不动，只换里头画的东西。
 *
 * 开关：
 *   `opened` —— 掀开（= 看过了）；合着（= 还没拆）。**没有调用方用它**：掀开那套
 *               只在弹窗（`TearOpen`）里演一次。参数留着，别处想掀开再说。
 *   `torn`   —— **撕开过**：顶边连撕条一起没了，露出一条米白信纸边 + 一排参差毛边，
 *               火漆裂成两半还粘在口上，干花/棉线/胶带跟着撕条走了。
 *               `/notes` 那一沓拿它表示「这封拆过了」（2026-11-18 晚第四版）。
 *   `stamped` —— 右上贴一枚邮票（= 这封还没看 / 有新信）。票面**写死浅色**：
 *               跟 `/d/tmp` 里那张参考图一样是米白票纸 + 鼠尾草绿图案，
 *               night 主题下也读得出「这里贴了东西」。
 *   `lite`   —— 首页 / 抽屉那一格（约 118×71）：地址只留一行、火漆与邮票都小一号。
 *   `address` —— 信封正面的「To: 你」；列表页要自己排居中大字，传 false 关掉。
 */
const HAND_FONT = '"Kaiti SC", "STKaiti", KaiTi, "楷体", "FangSong", serif';

/** 封盖尖端（%）：合着时 V 收在这里，火漆压在这条线上 */
const TIP = 34;
/** 掀开时信封口那一道缝（%） */
const MOUTH = 1.5;
/**
 * 撕条的高度（%）：列表里它**贴顶、齐边、通宽**，下端一排打孔虚线。
 *
 * 2026-11-18 晚第六改：之前那版做成了「内缩 2%、圆头、亮渐变、右端一个方块」，
 * 在这张 370px 宽的卡上直接读作**进度条 / 滑杆**（用户原话：「很奇怪」）。
 * 真信封上的撕条是**一张纸**，不是一根控件 —— 所以：齐边到左右、不圆角、
 * 不上渐变、不投影，纸色跟信封一模一样，全靠下端那排打孔虚线说它是「可以撕的」。
 */
const STRIP_H = 6;

/** 百分比 → viewBox 单位（viewBox 高 120，宽 200） */
const u = (pct: number) => (pct * 1.2).toFixed(1);

/** 封盖轮廓：从顶边一路压到中间的尖端 */
const FLAP_PATH = `M0 0 L100 ${u(TIP)} L200 0 Z`;

/* ------------------------- 封口件（压在盖尖的那一件） ------------------------- */

/**
 * 四种封口件（2026-11-18 晚）：信封「每封都不一样」主要就靠这一枚。
 *
 * 只有火漆一种的时候，六套纸色转两圈就腻了。现在同一套纸也能长得不一样：
 * 蜡印是郑重的、干花枝是手作的、棉线是随手的、胶带是匆忙贴上的 ——
 * 四件东西四种语气，后端按信里写的字挑（见 `pickLetterLook`）。
 *
 * 除火漆外都不跟主题上色：
 * - 干花就是干花（枯草色），棉线就是棉线（麻色），换主题也该是这两个色；
 * - 跟着信封上色的话，night 主题里它们会直接糊进纸里。
 * 火漆仍走 `WaxSeal`（三套蜡色随主题，且掀开时会裂）。
 */
function CharmMark({
  kind,
  parts,
  size,
  cracked,
}: {
  kind: LetterCharm;
  parts: ReturnType<typeof letterParts>;
  size: number;
  cracked: boolean;
}) {
  if (kind === 'wax') return <WaxSeal parts={parts} size={size} cracked={cracked} />;

  if (kind === 'sprig') {
    // 一枝干花：斜斜地压在封口上，左上角两枚小花
    return (
      <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden>
        <path
          d="M5 27 C9.5 20 13 14.5 21 6.5"
          stroke="#A6977A"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        {/* 叶：沿茎左右各两片 */}
        <path d="M9.6 21.4 C6.4 21.8 4.2 20.4 3.6 17.4 C6.8 17 9 18.4 9.6 21.4 Z" fill="#B4A788" />
        <path d="M12.6 16.6 C15.6 17.4 17.6 16.2 18.4 13.4 C15.4 12.6 13.4 13.8 12.6 16.6 Z" fill="#C0B395" />
        <path d="M15.6 12.2 C12.9 11.2 11.4 9.2 11.7 6.4 C14.4 7.4 15.9 9.4 15.6 12.2 Z" fill="#AB9D7E" />
        {/* 顶端两枚小花苞 */}
        <circle cx="21.8" cy="5.4" r="1.9" fill="#CDBFA4" />
        <circle cx="24.6" cy="8.6" r="1.4" fill="#D8CBB2" />
        <circle cx="19.4" cy="8.2" r="1.2" fill="#BCAE90" />
      </svg>
    );
  }

  if (kind === 'string') {
    // 棉线：横过封口、中间打一个结、两端各留一小截翘起来的线头
    return (
      <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden>
        <path
          d="M2 16 C8 12.4 12 11.2 15 11.2 C18 11.2 22 12.4 28 16"
          stroke="#BE9E7C"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        {/* 结：一个交叉的小环，不是实心块 —— 实心结在 20px 下就是一颗豆子 */}
        <path
          d="M13.4 12.2 C15.4 14.4 15.4 16.6 15 18.2 C14.6 16.6 14.6 14.4 16.6 12.2"
          stroke="#B08F6C"
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d="M15 18.2 C14.2 20.4 13.4 21.6 12 22.6 M15 18.2 C16 20.2 16.8 21.4 18.2 22.4"
          stroke="#B08F6C"
          strokeWidth="1.05"
          strokeLinecap="round"
          strokeOpacity="0.85"
        />
      </svg>
    );
  }

  // 和纸胶带：斜贴的一条，带细斜纹 + 两端参差
  return (
    <span
      aria-hidden
      className="block"
      style={{
        width: size * 1.6,
        height: size * 0.52,
        transform: 'rotate(-11deg)',
        background: `repeating-linear-gradient(115deg, ${parts.sealBase} 0 ${size * 0.1}px, ${parts.sealDark} ${size * 0.1}px ${size * 0.16}px)`,
        opacity: 0.72,
        borderRadius: 1,
        clipPath: 'polygon(2% 0, 100% 4%, 98% 100%, 0 96%)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
      }}
    />
  );
}

export function FoldedLetter({
  theme = 'default',
  look,
  opened = false,
  torn = false,
  stamped = false,
  seal = true,
  charm,
  texture,
  flatFlap = false,
  lite = false,
  address = true,
  className,
  children,
}: {
  theme?: LetterTheme;
  /** 整套包装（纸色 + 封口件 + 压纹）。给了它就盖过 `theme` */
  look?: LetterLook;
  /** 掀开 = 看过了；合着 = 还没拆（现在没有调用方传 true） */
  opened?: boolean;
  /**
   * **撕开过**：撕条整条不见了（被抽走），原位置留一道开着的口子
   * （暗缝 + 里面一点米白信纸），裂开的火漆还粘在口上。
   * 不做「露一条白纸 + 参差毛边」，也不做「纸条歪着搭在信封上」——
   * 前者用户明确否掉（「不要做成那种」），后者在 370px 宽卡上读作贴了一条胶带。
   */
  torn?: boolean;
  /** 右上贴邮票 = 还没看过（有信） */
  stamped?: boolean;
  /** 还画不画封口件；传 false 等于「什么都不压」，`charm` 优先于它 */
  seal?: boolean;
  /** 这一枚封口件是什么：火漆 / 干花 / 棉线 / 胶带 */
  charm?: LetterCharm;
  /** 纸面压纹；不给就看 `look`，再没有就是光纸 */
  texture?: LetterTexture;
  /** 封盖只画**一道折线**、不填色：列表页一沓叠着，填色的大三角太重（参考图就是折线） */
  flatFlap?: boolean;
  /** 小卡（首页那一格）用：地址只留一行、封口件与邮票小一号 */
  lite?: boolean;
  /** 正面那行「To: 你」；列表页自己排字，传 false */
  address?: boolean;
  className?: string;
  /** 信封正面的一行附注（`/notes` 拿它放首句，只有看过的信才有） */
  children?: React.ReactNode;
}) {
  const paperTheme = look?.theme ?? theme;
  const p = letterParts(paperTheme);
  /** 封口件：显式 `charm` > `look` 里那份 > （`seal=false` 就不压） > 默认火漆 */
  const charmKind: LetterCharm | null =
    charm !== undefined ? charm : seal ? (look?.charm ?? 'wax') : null;
  const texKind: LetterTexture = texture ?? look?.texture ?? 'plain';
  /** night 是唯一一层深色纸：压纹的颜色得反过来，不然深纸上印深纹 = 看不见 */
  const texInk = paperTheme === 'night' ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)';
  const markSize = lite ? 22 : 28;
  /** SVG 里的渐变 id 要唯一：/notes 一页挂着十几个信封，重名就全串了 */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <div
      data-testid="folded-letter"
      data-opened={opened ? '1' : '0'}
      data-torn={torn ? '1' : '0'}
      data-stamped={stamped ? '1' : '0'}
      data-letter-theme={paperTheme}
      data-letter-charm={charmKind ?? 'none'}
      className={cn('relative isolate overflow-hidden rounded-[3px]', className)}
      style={{
        backgroundColor: p.envSolid,
        border: `1px solid ${p.flapStroke}45`,
        boxShadow: 'var(--letter-shadow, 0 2px 8px -5px rgba(0,0,0,0.42))',
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 200 120"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          {/* 翻下来的封盖投在信封正面上的影：有影，那块纸才是「搭在上面」而不是「画上去」 */}
          <linearGradient id={`fl-shadow-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ⓪ 撕条被抽走之后（`torn`）：顶上那一条不是装饰线，是**翻下来的一层纸背**。
            只画一个整块 + 一条边沿 + 一片影 —— 不要再拆成「暗缝 + 白纸边」两道，
            在 370×224 的卡上两道硬边并排一定读成条纹。 */}
        {torn && (
          <>
            {/* 撕条抽走之后，顶边那条口子松开、翻下来的**一层纸背**。
                翻过来的是纸的另一面（`flapFill`），所以颜色本来就差着一档 ——
                这一条是「一个整块」，不是「暗一道亮一道」：两道硬边并排会读成
                条纹装饰（试过，像赛车格子旗）。 */}
            <rect x="0" y="0" width="200" height={u(STRIP_H)} fill={p.flapFill} />
            {/* 翻下来的边沿：一条硬线，再往下带影 —— 有影才是「搭在上面」。
                边沿用**墨色**而不是 `flapStroke`：night 的 flapStroke 是深蓝，
                压在这块纸上等于没画，深色主题里整条边会消失（试过）。 */}
            <rect x="0" y={u(STRIP_H - 0.5)} width="200" height={u(0.9)} fill={p.inkSolid} opacity="0.28" />
            <rect x="0" y="0" width="200" height={u(0.7)} fill="#fff" opacity="0.10" />
            <rect x="0" y={u(STRIP_H + 0.4)} width="200" height={u(7)} fill={`url(#fl-shadow-${uid})`} opacity="0.75" />
          </>
        )}

        {/* ① 信封口：**只有掀开才开** —— 顶边一道暗缝 + 一条亮纸边。
            纸边用一层白而不是 `paperSolid`：night 主题的信纸本身就是深蓝，
            拿它画这条边等于没画，而这个信号必须跨主题都亮。 */}
        {opened && (
          <>
            <rect x="0" y="0" width="200" height={u(MOUTH)} fill={p.flapStroke} opacity="0.75" />
            <rect x="4" y={u(MOUTH)} width="192" height={u(2.6)} fill="#fff" opacity="0.22" />
          </>
        )}

        {/* ② 封盖投下的影（只掀开时） */}
        {opened && (
          <rect x="0" y={u(TIP)} width="200" height={u(7)} fill={`url(#fl-shadow-${uid})`} opacity="0.7" />
        )}

        {/* ③ 封盖：合着＝信封自己那张纸（flapFill）；掀开＝翻过来搭在正面的**纸背**，
            比信封壳亮一档（压 20% 的白；不能换个浅色号 —— night 里浅的那档反而更暗）。
            `flatFlap`（列表）**不画 V** —— 参考图里信封正面是平的，那道 V 是背面折痕，
            画在正面就是「假」。封口的活儿交给顶上那条撕条。 */}
        {flatFlap ? null : (
          <>
            <path
              d={FLAP_PATH}
              fill={opened ? p.envSolid : p.flapFill}
              stroke={p.flapStroke}
              strokeWidth="0.9"
              vectorEffect="non-scaling-stroke"
            />
            {opened && <path d={FLAP_PATH} fill="#fff" opacity="0.2" />}
          </>
        )}

        {/* ④ 两道侧折痕：从下角收到封盖尖端，信封背面的样子（极淡，别抢戏） */}
        <path
          d={`M0 120 L100 ${u(TIP)} M200 120 L100 ${u(TIP)}`}
          fill="none"
          stroke={p.flapStroke}
          strokeWidth="0.8"
          strokeOpacity="0.28"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* 纸面压纹：极淡的一层，只负责「这不纯是一块色」。
          用斜纹 / 点阵，**不用横线** —— 横的 repeating-linear-gradient 在信纸上
          会立刻变成一本横格本，看着像作业本，不像信纸（踩过一次）。 */}
      {texKind !== 'plain' && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={
            texKind === 'line'
              ? {
                  backgroundImage: `repeating-linear-gradient(90deg, ${texInk} 0 0.6px, transparent 0.6px 3.4px)`,
                }
              : {
                  backgroundImage: `radial-gradient(${texInk} 0.55px, transparent 0.75px)`,
                  backgroundSize: '4px 4px',
                }
          }
        />
      )}

      {/* 撕条（2026-11-18 晚第六改）＝**贴顶的一条纸**，不是一根控件。
          通宽齐边：左右不留缝（留缝就成了浮在纸上的一条胶囊）；
          纸色跟信封**完全相同**：真撕条就是信封自己的纸，靠下面那排打孔虚线分开；
          不圆角、不渐变、不投影 —— 那三样加起来就是「进度条」。
          封口件压在这条线上，等于把这个口子封住：断蜡 + 沿虚线撕，两件事一句话说完。
          撕开（`torn`）时整条没了（被抽走），顶上换成翻下来的纸背（见 ⓪）。 */}
      {flatFlap && !torn && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: `${STRIP_H}%`,
            backgroundColor: p.envSolid,
            borderBottom: `1px dashed ${p.flapStroke}99`,
            zIndex: 2,
          }}
        >
          {/* 封口件压在打孔线上 —— 它就是把这条「封」住的那一下。
              半个身子探到纸面上，所以不会被卡片上沿裁掉。 */}
          {charmKind && (
            <span
              className="absolute flex items-center justify-center"
              style={{ left: '50%', top: '100%', transform: 'translate(-50%, -50%) rotate(-4deg)' }}
            >
              <CharmMark kind={charmKind} parts={p} size={20} cracked={opened} />
            </span>
          )}
        </div>
      )}

      {/* 撕开过之后，封口件只剩**裂开的火漆**：干花/棉线/胶带都粘在撕条上，
          纸条被抽走就一起走了，硬留着反而假。蜡是掰开的，还粘在口子中间。 */}
      {flatFlap && torn && charmKind === 'wax' && (
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center"
          style={{ left: '50%', top: `${STRIP_H}%`, transform: 'translate(-50%, -50%) rotate(-3deg)', zIndex: 2 }}
        >
          <CharmMark kind="wax" parts={p} size={20} cracked />
        </span>
      )}

      {/* 收件人：整张卡唯一像「一封寄来的信」的文字，别省 */}
      {address && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: '10%',
            right: lite ? '32%' : '34%',
            top: lite ? '56%' : '58%',
            color: p.inkSolid,
            fontFamily: HAND_FONT,
          }}
        >
          <p style={{ fontSize: lite ? 10 : 11, letterSpacing: '0.02em', opacity: 0.85 }}>To: 你</p>
          {/* 小卡只有七十来像素高：第二行会被邮票/落款挤掉，只留一行 */}
          {!lite && (
            <p style={{ fontSize: 8, marginTop: 3, fontStyle: 'italic', color: p.metaSolid }}>
              深夜寄出
            </p>
          )}
          {children}
        </div>
      )}

      {/* 邮票：**读没读的唯一判据**（2026-11-18 晚用户定：组件上的信封不许拆开，
          有信就贴邮票、没信就没邮票）。票面写死米白 + 鼠尾草绿，
          跟参考图那枚一样 —— 跟着信封主题上色的话，night 主题里它会直接消失。 */}
      {stamped && (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: lite ? '6%' : '5%',
            top: lite ? '9%' : '7%',
            width: lite ? 16 : 23,
            height: lite ? 20 : 29,
            backgroundColor: '#EDF0DC',
            border: '1px dashed #93A87C',
            borderRadius: 1,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}
        >
          <svg viewBox="0 0 23 29" className="h-full w-full" fill="none">
            {/* 票面图案：一枝小叶（参考图那枚绿邮票的简化版） */}
            <path d="M11.5 24 V11" stroke="#6F8552" strokeWidth="1.1" strokeLinecap="round" />
            <path
              d="M11.5 15.5 C8.6 15.5 6.6 13.9 6 11 C8.9 11 11 12.6 11.5 15.5 Z"
              fill="#8FAA73"
            />
            <path
              d="M11.5 12.4 C14.2 12.4 16 10.9 16.5 8.3 C13.9 8.3 12 9.8 11.5 12.4 Z"
              fill="#7C9861"
            />
            <path d="M11.5 19.8 C14.4 19.8 16.4 18.2 17 15.3 C14.1 15.3 12 16.9 11.5 19.8 Z" fill="#9DB884" />
            <circle cx="11.5" cy="6.6" r="1.5" fill="#6F8552" />
          </svg>
        </span>
      )}

      {/* 封口件（信封背面那一套：压在大 V 尖端）。
          **列表不用这一处** —— `flatFlap` 时封口件挪到撕条上去了（见上面），
          这里只剩首页那张小卡在用：它画的是信封背面，V 折 + 火漆才是对的样子。 */}
      {!flatFlap && charmKind && (
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            left: '50%',
            top: `${TIP - 4}%`,
            transform: `translate(-50%, -50%) rotate(${opened ? (charmKind === 'wax' ? 0 : -7) : 0}deg)`,
            transition: 'transform 320ms ease-out',
          }}
        >
          <CharmMark kind={charmKind} parts={p} size={markSize} cracked={opened} />
        </span>
      )}
    </div>
  );
}

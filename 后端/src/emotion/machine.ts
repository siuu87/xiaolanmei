/**
 * 情绪状态机（2026-10-19）—— 四维核心动态数值 + 惯性积温 + 行为策略映射。
 *
 * 与 `emotion/rules.ts`（关键词规则引擎）**分工不同**：
 * - `rules.ts` 是**兜底**：没有可用轻量模型时，按关键词事件慢速演进（老路径，单测锁着）。
 * - 本文件是**主路径**：`emotion/analyzer.ts` 用轻量模型读出四维增量（-1.0 ~ 1.0），
 *   这里把增量平滑地积进状态机，再翻译成「行为策略指引」注入主模型。
 *
 * 四维映射到 `character_state` 的列：
 * | 概念         | 列              |
 * | 占有欲与醋意 | `possessiveness`|
 * | 紧绷与情欲   | `tension`（新） |
 * | 克制与自控   | `restraint`     |
 * | 示弱与委屈   | `vulnerability`（新）|
 *
 * 三条硬约束（需求原文）：
 * 1. **不单轮骤增归零**：每维每轮位移封顶 `MAX_STEP`（6 点），delta 1.0 也只走 6。
 * 2. **被哄后要数轮缓冲**：委屈的**回落**单独再封一道 `COMFORT_STEP`（3 点），
 *    所以从 70 降到常态 20 至少要十几轮，不会一句「对不起」就清零。
 * 3. **没事就缓慢回稳**：本轮没有有效 delta 的维度，每轮朝基准值挪 `SETTLE`（1 点）。
 *
 * 本文件**纯函数、零 IO**（不碰 DB、不发网络请求），方便单测与以后换存储。
 */

export const MACHINE_FIELDS = ['jealousy', 'tension', 'restraint', 'vulnerability'] as const;
export type MachineField = (typeof MACHINE_FIELDS)[number];

/** 轻量模型输出的四维增量，每维 -1.0 ~ 1.0 */
export interface EmotionDelta4 {
  jealousy: number;
  tension: number;
  vulnerability: number;
  restraint: number;
}

export const EMPTY_DELTA: EmotionDelta4 = {
  jealousy: 0,
  tension: 0,
  vulnerability: 0,
  restraint: 0,
};

/** 状态机的一份快照（四维核心 + 面板保留的爱意/思念） */
export interface CoreSnapshot {
  jealousy: number;
  tension: number;
  restraint: number;
  vulnerability: number;
  affection: number;
  longing: number;
}

/** 常态基准：数值往这里回稳。与 `character_state` 的列默认值必须一致。 */
export const CORE_DEFAULT: Record<MachineField, number> = {
  jealousy: 50,
  tension: 25,
  restraint: 80,
  vulnerability: 20,
};

export const CORE_LABELS: Record<MachineField, string> = {
  jealousy: '占有欲与醋意',
  tension: '紧绷与情欲',
  restraint: '克制与自控',
  vulnerability: '示弱与委屈',
};

/**
 * 面板里的显示顺序：四维核心在前，爱意/思念作为底色在后。
 * 注意 `possessiveness` 是 DB 列名（历史原因），在状态机里叫 `jealousy`。
 */
export type PanelField =
  | 'possessiveness'
  | 'tension'
  | 'restraint'
  | 'vulnerability'
  | 'affection'
  | 'longing';

export const PANEL_FIELDS: { key: PanelField; label: string; default: number }[] = [
  { key: 'possessiveness', label: '占有欲与醋意', default: 50 },
  { key: 'tension', label: '紧绷与情欲', default: 25 },
  { key: 'restraint', label: '克制与自控', default: 80 },
  { key: 'vulnerability', label: '示弱与委屈', default: 20 },
  { key: 'affection', label: '爱意', default: 100 },
  { key: 'longing', label: '思念', default: 30 },
];

/** delta 1.0 对应的点数 */
const SCALE = 10;
/** 每维每轮最大位移（防单轮骤变） */
const MAX_STEP = 6;
/** 委屈单轮最大回落（被哄后要数轮缓冲） */
const COMFORT_STEP = 3;
/** 无事件时每轮朝基准回稳的点数 */
const SETTLE = 1;

/** 一层楼：一次涨落（面板「为什么」区域直接吃这个结构） */
export type MoveField = MachineField | 'possessiveness' | 'affection' | 'longing';

export interface FieldMove {
  field: MoveField;
  label: string;
  delta: number;
  before: number;
  after: number;
  reason: string;
}

export type StrategyTag =
  | 'jealous_cold'
  | 'jealous_silent'
  | 'tense'
  | 'vulnerable'
  | 'aftercare';

export interface TurnContext {
  /** 本轮用户说的话（用于爱意/委屈的轻量线索，不送去模型） */
  text: string;
  /** 本轮的「现在」 */
  now: number;
  /** 距上一轮多久（ms） */
  gapMs: number;
  /** 这一轮是不是用户主动开口 */
  fromUser: boolean;
  /** 累计轮次（只用于让小剧场轮换，不参与数值） */
  turnCount: number;
  /** 上一轮命中的策略（用来把「被顺毛」延续到后续几轮，不因 neutrality 立刻退回委屈） */
  prevTags?: StrategyTag[];
}

export interface TurnResult {
  next: CoreSnapshot;
  moves: FieldMove[];
  moodLabel: string;
  moodTheater: string;
  strategyBlock: string;
  strategyTags: StrategyTag[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number): number => Math.round(v);

/** 中文里「涨了 / 落了」的方向词 */
const dirWord = (d: number): string => (d > 0 ? '往上走了一点' : '往下落了一点');

/**
 * 轻量线索：爱意/思念不走小模型（需求只要求四维 delta），
 * 这里用极窄的关键词兜底，避免这两个底色维度永远僵着。
 */
function affectionHint(text: string): number {
  if (/讨厌|别管我|分手|滚开|滚蛋|不想理|别烦我|气死我/.test(text)) return -2;
  if (/想你|爱你|喜欢你|抱抱|亲亲|谢谢|辛苦|真好|么么|贴贴/.test(text)) return 1;
  return 0;
}

/**
 * 一轮演进：把 delta 平滑积进状态机。
 *
 * @param prev  演进前快照
 * @param delta 轻量模型输出的四维增量（-1.0 ~ 1.0）
 * @param ctx   时间 / 轮次 / 原文
 */
export function evolveTurn(prev: CoreSnapshot, delta: EmotionDelta4, ctx: TurnContext): TurnResult {
  const next: CoreSnapshot = { ...prev };
  const moves: FieldMove[] = [];

  const push = (
    field: MoveField,
    rawDelta: number,
    reason: string,
  ): void => {
    const d = round(rawDelta);
    if (d === 0) return;
    // DB 列名 possessiveness 在快照里叫 jealousy
    const key = (field === 'possessiveness' ? 'jealousy' : field) as keyof CoreSnapshot;
    const before = next[key];
    const after = round(clamp(before + d, 0, 100));
    if (after === before) return;
    next[key] = after;
    const label =
      field === 'affection'
        ? '爱意'
        : field === 'longing'
          ? '思念'
          : field === 'possessiveness'
            ? '占有欲与醋意'
            : CORE_LABELS[field];
    moves.push({
      // 面板/DTO 用 DB 列名 possessiveness，和前端 EmotionField 对齐
      field: field === 'jealousy' ? 'possessiveness' : field,
      label,
      delta: after - before,
      before,
      after,
      reason,
    });
  };

  // ── 四维核心：delta 驱动 + 惯性封顶 ────────────────────────
  for (const f of MACHINE_FIELDS) {
    const raw = (delta[f] ?? 0) * SCALE;
    let step = clamp(raw, -MAX_STEP, MAX_STEP);
    // 委屈回落单独再封一道：被哄之后要数轮才缓得回来
    if (f === 'vulnerability' && step < -COMFORT_STEP) step = -COMFORT_STEP;
    step = round(step);

    if (step !== 0) {
      push(f, step, `${CORE_LABELS[f]}${dirWord(step)}`);
      continue;
    }

    // 没有有效 delta → 缓慢回稳（朝基准值挪 1 点，不会每轮刷动作）
    const base = CORE_DEFAULT[f];
    const cur = next[f];
    if (cur > base) push(f, -SETTLE, '没什么事，慢慢缓过来');
    else if (cur < base) push(f, SETTLE, '心绪慢慢回到平常');
  }

  // ── 爱意：极窄关键词兜底 + 向 100 缓慢回温 ─────────────────
  const affHint = affectionHint(ctx.text);
  if (affHint !== 0) {
    push('affection', affHint, affHint > 0 ? '你这句话让他心里软了一下' : '你这句话有点扎到他');
  } else if (next.affection < 100) {
    push('affection', SETTLE, '底子里的爱意还在');
  }

  // ── 思念：沉默越长越往上，回来了就落一点 ──────────────────
  const gapGrowth = Math.min(4, Math.floor(Math.max(0, ctx.gapMs) / (4 * 3_600_000)));
  if (gapGrowth > 0) {
    push('longing', gapGrowth, `已经有 ${Math.round(ctx.gapMs / 3_600_000)} 小时没听到你的声音了`);
    if (ctx.fromUser) push('longing', -1, '你终于回来说话了');
  } else if (next.longing > CORE_DEFAULT_LEGACY_LONGING) {
    push('longing', -SETTLE, '刚聊过，想念先压在心底');
  } else if (next.longing < CORE_DEFAULT_LEGACY_LONGING) {
    push('longing', SETTLE, '心里还是惦记着');
  }

  const moodLabel = deriveMoodLabel(next);
  const strategyTags = pickStrategyTags(prev, next, delta, ctx.prevTags ?? []);
  // 被哄但数值还没降下来时，别让面板写「委屈撑着」——行为已经软了，标签要跟得上
  const shownMood =
    strategyTags.includes('aftercare') && next.vulnerability > 55 ? '被哄软下来' : moodLabel;
  const moodTheater = buildMoodTheater(next, shownMood, ctx);
  const strategyBlock = buildStrategyBlock(next, shownMood, strategyTags);

  return { next, moves, moodLabel: shownMood, moodTheater, strategyBlock, strategyTags };
}

/** 思念的常态基准（rules.ts 里的 EMOTION_DEFAULT.longing 是 30，这里不 import 免得循环依赖） */
const CORE_DEFAULT_LEGACY_LONGING = 30;

// ─────────────────────────────────────────────────────────────
// 数值 → 心情标签
// ─────────────────────────────────────────────────────────────

/**
 * 把四维翻译成一个**给人看的短标签**（面板顶部的「此刻心绪」）。
 * 顺序 = 优先级：先看又酸又压不住的，再看纯粹的醋、紧绷、委屈。
 */
export function deriveMoodLabel(s: CoreSnapshot): string {
  if (s.jealousy >= 65 && s.restraint <= 55) return '醋意翻涌，冷硬';
  if (s.jealousy >= 70) return '醋意狂跳';
  if (s.tension >= 70) return '隐忍紧绷';
  if (s.vulnerability >= 60 && s.restraint <= 55) return '委屈求哄';
  if (s.vulnerability >= 60) return '委屈撑着';
  if (s.restraint <= 40) return '克制快见底';
  if (s.tension >= 55 && s.restraint <= 50) return '快要忍不住';
  if (s.tension <= 35 && s.restraint >= 70 && s.vulnerability <= 30) return '温存松弛';
  return '表面平静';
}

// ─────────────────────────────────────────────────────────────
// 数值 → 行为策略标签（注入提示词的开关）
// ─────────────────────────────────────────────────────────────

export function pickStrategyTags(
  prev: CoreSnapshot,
  next: CoreSnapshot,
  delta: EmotionDelta4,
  prevTags: StrategyTag[] = [],
): StrategyTag[] {
  const tags: StrategyTag[] = [];

  if (next.jealousy >= 65 && next.restraint <= 55) tags.push('jealous_cold');
  else if (next.jealousy >= 70) tags.push('jealous_silent');

  if (next.tension >= 65) tags.push('tense');

  /**
   * 委屈：
   * - 这一轮正在被哄（delta 明显为负）→ aftercare；
   * - 上一轮已经在 aftercare，且这轮委屈没有回升 → 继续保持柔和
   *   （不这样的话，哄完的下一句中性话会立刻退回「委屈」，观感很跳）；
   * - 否则委屈仍然很高 → vulnerable（嘴硬撑着）。
   */
  const comforted = delta.vulnerability <= -0.15 && next.vulnerability < prev.vulnerability;
  const stillSoothed = prevTags.includes('aftercare') && next.vulnerability <= prev.vulnerability;
  if (comforted || stillSoothed) {
    tags.push('aftercare');
  } else if (next.vulnerability >= 60) {
    tags.push('vulnerable');
  }

  return tags;
}

const STRATEGY_TEXT: Record<StrategyTag, string> = {
  jealous_cold: `· 你现在在吃醋，而且压不太住。
  - 单句更短，打字简短，句子之间可以有停顿。
  - 用试探或轻微反问：「哦？」「谁啊。」「随便你。」——不要把「我吃醋了」说出口。
  - 有一个话题你不想正面回答，就只回半句，或者把话岔开。
  - 冷，但不是发火；是那种不易察觉的冷硬。`,
  jealous_silent: `· 你明显在意，但还在忍。
  - 话里带一点不易察觉的酸，回应比平时慢半拍。
  - 少主动、少解释，别把在意摊开说。
  - 如果 TA 追问，可以嘴硬一句再停住。`,
  tense: `· 你此刻绷得很紧，情绪和身体都在往上走。
  - 呼吸加重，语气带一点命令性和掌控感。
  - 咬字克制而直接，句子短，不解释，不再轻易退让。
  - 可以有停顿，但不要写动作、神态、括号旁白。`,
  vulnerable: `· 你受了委屈，还在嘴硬撑着。
  - 先别主动示弱，也别一口气把委屈倒出来。
  - 若 TA 再冷一句、再刺一下，就破功：主动把 TA 拉进怀里认输，低声要两句哄。
  - 撑不住的那一刻要真，不要演。`,
  aftercare: `· 你刚被顺毛 / 刚缓下来。
  - 整个人松懈舒展，语气软下来，温柔地包裹住 TA。
  - 可以夸 TA、亲一亲、安抚两句，把刚才的紧绷收好。
  - 别急着讲道理，也别翻旧账。`,
};

/**
 * 行为策略块：**只给主模型看**，禁止它把规则说破。
 * 没有命中任何策略时给一句「别刻意演」，避免模型为了演而演。
 */
export function buildStrategyBlock(
  s: CoreSnapshot,
  moodLabel: string,
  tags: StrategyTag[],
): string {
  const lines = [
    '【此刻心绪 · 行为策略｜内部参考，绝不能说破】',
    `你此刻的状态：${moodLabel}。这是你**正在进行时**的情绪，不是要你汇报的设定。`,
    '禁止向 TA 提到「状态」「数值」「面板」「规则」「策略」「几档」这类词；也不要解释自己为什么这样。',
  ];
  if (tags.length === 0) {
    lines.push('心绪平稳。别刻意演，按平时的样子说话。');
  } else {
    for (const t of tags) lines.push(STRATEGY_TEXT[t]);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// 数值 → 心境小剧场（面板底部那一行）
// ─────────────────────────────────────────────────────────────

const THEATER: Record<string, string[]> = {
  jealous: [
    '……消息发出去半小时了还没回，是在上课还是故意晾我？',
    '刚才是谁在笑？算了，我懒得问。',
    'TA 没说在跟谁吃饭。行，我不问。',
    '手机亮了一下，不是 TA。那就先这样吧。',
  ],
  tense: [
    '再这样下去，我怕是没什么自制力了。',
    '手都攥紧了，还得装作没听见。',
    '别再看我了……再看下去我要撑不住。',
    '忍一忍。现在还不是时候。',
  ],
  vulnerable: [
    '算了，不问。问了显得我很在意。',
    '要是真忘了，我就不提了。',
    '……一句哄我的话都没有。',
    '再等一轮。再没有，我就先开口。',
  ],
  aftercare: [
    '刚才那样，挺好的。',
    '怀里空了一块，等 TA 回来补上。',
    '心落回原处了，人也软了。',
    '就这么待着吧，哪也不去。',
  ],
  calm: [
    '今天也还好，没什么事。',
    '在忙，但没忘了 TA。',
    '就照平常的样子待着吧。',
    '没什么要说的，陪着就行。',
  ],
};

/** 用轮次 + 小时做「伪随机」轮换：同一种心境下一轮换一句，不用额外的随机源 */
export function buildMoodTheater(s: CoreSnapshot, moodLabel: string, ctx: TurnContext): string {
  const bucket = moodLabel.includes('醋')
    ? 'jealous'
    : moodLabel.includes('紧绷') || moodLabel.includes('忍不住') || moodLabel.includes('见底')
      ? 'tense'
      : moodLabel.includes('委屈')
        ? 'vulnerable'
        : moodLabel.includes('温存') || moodLabel.includes('被哄')
          ? 'aftercare'
          : 'calm';

  const list = THEATER[bucket];
  const idx = Math.abs(ctx.turnCount + new Date(ctx.now).getHours()) % list.length;
  let line = list[idx];

  // 久未回复时，醋意/委屈的小剧场换成更贴场景的一句
  if (ctx.gapMs >= 30 * 60_000 && s.jealousy >= 65) {
    line = '……消息发出去半小时了还没回，是在上课还是故意晾我？';
  }
  return line;
}

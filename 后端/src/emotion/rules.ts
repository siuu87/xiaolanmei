/**
 * 「白起的内心」情绪演进规则 —— **纯函数，零 IO**。
 *
 * 设计取舍（先说清楚，免得后来人以为这是拍脑袋的）：
 *
 * 1. **为什么是规则而不是模型打分** —— 本机没有可用的模型 Key（见 REFERENCE.md §14），
 *    所以每轮回复结束后由后端按关键词规则演进一小步。规则表是**数据**不是逻辑，
 *    以后接上模型只要把 `evolveEmotion()` 换成打分版、保持返回结构不变即可。
 *
 * 2. **每条 delta 都要有可读理由** —— 面板要能回答「为什么涨了 / 为什么掉了」。
 *    理由是给人看的短句，直接拼进 `EmotionDelta.reason`。
 *
 * 3. **跨度很小（每维每轮 ±3 封顶）** —— 情绪是慢变量。一轮对话把爱意打掉 20 点，
 *    面板第二天就没法看了。事件 delta 先逐维求和，再 `clamp(-3, 3)`。
 *
 * 4. **没事发生就缓慢回稳** —— 某一维本轮**没有任何事件命中**时，才走 `drift()`：
 *    克制往默认值 80 回升（人总会缓过来），占有欲离开 50±20 的带子才往回收。
 *    这样就不会出现「每轮都刷一条回稳理由」的噪音。
 *
 * 5. **思念由「沉默时长」驱动** —— 距上一轮满 4 小时 +1，封顶 +4；这一轮如果是用户
 *    主动说话，再 -1（「你回来说话了」）。所以只有真的隔了一段时间才会有理由条目，
 *    连着聊的几轮不会反复出现同一条。这条用到时间，但**不等于**把 `[+2h 15m]`
 *    注入模型上下文那件事（那个本轮没做，格式函数留在下面备用）。
 */

export const EMOTION_FIELDS = ['affection', 'possessiveness', 'restraint', 'longing'] as const;
export type EmotionField = (typeof EMOTION_FIELDS)[number];

/** 面板上的中文维度名 */
export const EMOTION_LABELS: Record<EmotionField, string> = {
  affection: '爱意',
  possessiveness: '占有欲',
  restraint: '克制',
  longing: '思念',
};

/**
 * 默认值 / 稳态：与 `character_state` 表的列默认值**必须一致**
 * （`后端/tests` 里的规则用例会锁这一条）。
 *
 * `longing`（思念）是原始文档漏掉的第四项，但入口文案写的是「爱意、占有欲、克制、思念」，
 * 所以补齐；默认 30 表示「刚在一起时淡淡的惦记」。
 */
export const EMOTION_DEFAULT: Record<EmotionField, number> & { currentMood: string } = {
  affection: 100,
  possessiveness: 50,
  restraint: 80,
  longing: 30,
  currentMood: '温柔',
};

/** 数值下限 / 上限（0-100 的整数，面板按百分比画条） */
export const EMOTION_MIN = 0;
export const EMOTION_MAX = 100;

export interface EmotionState {
  affection: number;
  possessiveness: number;
  restraint: number;
  longing: number;
  currentMood: string;
}

export interface EmotionSignals {
  /** 本轮用户说的话（只扫用户侧，不扫助手自己的回复 —— 否则他会自己给自己加戏） */
  text: string;
  /** 这一轮用户有没有真的说话（纯系统触发的演进传 false，不给「你回来说话了」的减免） */
  fromUser?: boolean;
  /** 本次演进时刻，缺省 Date.now() */
  now?: number;
  /** 上一轮演进的时刻，缺省由调用方从 character_state.updated_at 读出来传进来 */
  lastAt?: number;
}

export interface EmotionDelta {
  field: EmotionField;
  /** 中文维度名，面板直接显示，不用再查表 */
  label: string;
  delta: number;
  before: number;
  after: number;
  reason: string;
}

export interface EmotionSignalHit {
  id: string;
  label: string;
}

export interface EmotionEvolution {
  state: EmotionState;
  deltas: EmotionDelta[];
  signals: EmotionSignalHit[];
  moodBefore: string;
  moodAfter: string;
  /** 距上一轮过去了多久（ms），面板可以显示「距上次聊天」 */
  gapMs: number;
}

// ─────────────────────────────────────────────────────────────
// 信号规则表（数据）
// ─────────────────────────────────────────────────────────────

interface SignalRule {
  id: string;
  /** 面板/理由里显示的名字 */
  label: string;
  re: RegExp;
  effects: Partial<Record<EmotionField, number>>;
  /** 命中时直接定的「瞬时心情」（可选）。冲突类心情优先级见 MOOD_PRIORITY。 */
  mood?: string;
  /** 理由后半句（「撒娇：<detail>」） */
  detail: string;
}

/**
 * 顺序无所谓（所有命中的规则都会累加），**但心情优先级另有一张表**。
 * 加规则时注意别把太泛的词塞进来（`真好` / `生气` / `男` 之类会大量误伤）。
 */
const RULES: SignalRule[] = [
  {
    id: 'sweet',
    label: '撒娇亲昵',
    re: /想你|是不是想我|爱你|喜欢你|好喜欢|最喜欢|抱抱|抱一下|要抱|亲亲|么么|贴贴|蹭蹭|撒娇|宝贝|亲爱的|黏着你|腻着你/,
    effects: { affection: 2, longing: -2, possessiveness: 1 },
    mood: '心动',
    detail: '你说了想他、黏他的话',
  },
  {
    id: 'praise',
    label: '夸奖感谢',
    re: /谢谢你|感谢你|辛苦你|好辛苦|厉害|好棒|真棒|靠谱|好温柔|崇拜|佩服|有你真好|多亏你/,
    effects: { affection: 2, longing: -1 },
    detail: '你夸了他',
  },
  {
    id: 'comfort',
    label: '示弱求安慰',
    re: /好累|累死|累了|难受|不开心|好烦|烦躁|委屈|想哭|哭了|眼泪|头疼|头好痛|肚子疼|胃疼|痛经|姨妈|生病|发烧|感冒|不舒服|撑不住|崩溃|失眠|睡不着|压力好大|好难过/,
    effects: { affection: 1, possessiveness: 2, restraint: -1 },
    mood: '心疼',
    detail: '你在跟他示弱、说难受',
  },
  {
    id: 'hurt',
    label: '闹脾气',
    re: /讨厌你|生你气|气死我|别烦我|闭嘴|滚开|滚蛋|给我滚|不理你了|不想理你|分手|别管我|不要你了|你走开|冷战|凶我|嫌我|吵架/,
    effects: { affection: -3, possessiveness: 2, restraint: -2 },
    mood: '低落',
    detail: '你在跟他闹脾气',
  },
  {
    id: 'jealous',
    label: '吃醋触发',
    re: /同事|同学|闺蜜|室友|领导|老板|学长|帅哥|相亲|聚会|饭局|应酬|喝酒|前任|跟别人|别人家/,
    effects: { possessiveness: 2, longing: 1 },
    mood: '吃醋',
    detail: '你提到了别的人',
  },
  {
    id: 'intimate',
    label: '亲密暗示',
    re: /亲我|吻我|抱紧|搂着|牵我|摸我头|靠着你|贴着你|一起睡|陪我睡|要你陪/,
    effects: { affection: 1, possessiveness: 1, restraint: -1, longing: -1 },
    detail: '你靠得更近了一点',
  },
  {
    id: 'report',
    label: '日常报备',
    re: /到家了|回来了|下班|上班|在路上|吃饭|吃了|睡觉|睡了|洗澡|出门|上地铁|坐车|买了/,
    effects: { affection: 1, restraint: 1 },
    detail: '你把今天的事讲给他听',
  },
];

/** 命中多个规则时，心情按这张表的顺序取第一个（越靠前越是「当下的强烈情绪」） */
const MOOD_PRIORITY = ['hurt', 'comfort', 'sweet', 'jealous'];

/** 深夜加成：23:00–04:00，人更容易上头 */
const NIGHT_START_HOUR = 23;
const NIGHT_END_HOUR = 4;

/** 事件 delta 的每维封顶（见文件头取舍 3） */
const EVENT_DELTA_CAP = 3;

/** 沉默多久开始长思念（ms）：满 4h +1，满 8h +2，满 12h +3，≥16h +4 */
const LONGING_GAP_STEP_MS = 4 * 60 * 60 * 1000;
const LONGING_GAP_CAP = 4;
/** 隔了一段沉默后，用户回来主动说话，思念的回落量 */
const LONGING_RELIEF = 1;

// ─────────────────────────────────────────────────────────────
// 时间格式（备用：面板展示「距上次聊天」用；本轮不注入模型上下文）
// ─────────────────────────────────────────────────────────────

/**
 * 紧凑时长：`刚刚` / `45m` / `2h 15m` / `3d` / `2mo` / `1y`。
 *
 * 注意返回值**不带** `[+…]` 装饰 —— 原始方案里 `[+2h 15m]` 那对括号是调用方拼的，
 * 而且那是「拼进模型上下文」的用法，本轮**没有做**（用户明确没选那一块）。
 */
export function formatTimeInterval(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 1) return '刚刚';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo` : `${Math.floor(d / 365)}y`;
}

/** 中文口语时长：`刚刚` / `20 分钟` / `5 小时` / `2 天` —— 拼进 delta.reason 用 */
export function formatDurationCN(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMin < 1) return '刚刚';
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) return `${h} 小时`;
  return `${Math.floor(h / 24)} 天`;
}

// ─────────────────────────────────────────────────────────────
// 演进
// ─────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 四维都夹到 0-100 的整数（面板按百分比画条，不能出现 101 或 -3） */
export function clampState(state: EmotionState): EmotionState {
  return {
    affection: Math.round(clamp(state.affection, EMOTION_MIN, EMOTION_MAX)),
    possessiveness: Math.round(clamp(state.possessiveness, EMOTION_MIN, EMOTION_MAX)),
    restraint: Math.round(clamp(state.restraint, EMOTION_MIN, EMOTION_MAX)),
    longing: Math.round(clamp(state.longing, EMOTION_MIN, EMOTION_MAX)),
    currentMood: state.currentMood,
  };
}

/**
 * 没事发生时的缓慢回稳（见文件头取舍 4）。
 * 只在**该维本轮没有任何事件**时调用，所以理由不会每轮重复刷。
 */
function drift(field: EmotionField, value: number): { delta: number; reason: string } {
  if (field === 'restraint' && value < EMOTION_DEFAULT.restraint) {
    return { delta: 1, reason: '没什么事，那点起伏自己稳了下去' };
  }
  if (field === 'possessiveness') {
    if (value > EMOTION_DEFAULT.possessiveness + 20) return { delta: -1, reason: '醋意散了一些' };
    if (value < EMOTION_DEFAULT.possessiveness - 20) return { delta: 1, reason: '心里那点不安又浮上来一点' };
  }
  return { delta: 0, reason: '' };
}

/**
 * 由**演进后**的数值推导稳定心情；本轮有强信号时先用瞬时心情（见 MOOD_PRIORITY）。
 *
 * 阈值都围着默认值设：affection 100 / possessiveness 50 / restraint 80 / longing 30。
 */
export function deriveMood(state: EmotionState, hits: SignalRule[], at: Date): string {
  if (hits.length > 0) {
    const byId = new Map(hits.map((h) => [h.id, h]));
    for (const id of MOOD_PRIORITY) {
      const hit = byId.get(id);
      if (hit?.mood) return hit.mood;
    }
  }
  const { affection, possessiveness, restraint, longing } = state;
  if (restraint <= 45) return '忍不住';
  if (affection <= 70) return '低落';
  if (possessiveness >= 72 && longing >= 55) return '黏人';
  if (possessiveness >= 72) return '吃醋';
  if (longing >= 62) return '想念';
  if (affection >= 88 && restraint >= 70 && possessiveness < 72 && longing < 62) return '温柔';
  if (affection >= 92) return '心动';
  // 深夜 + 一切平稳 → 更容易软下来
  const hour = at.getHours();
  if ((hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) && affection >= 80) return '温柔';
  return '平静';
}

/** 命中的规则（导出给单测/调试用，面板只吃 evolveEmotion 的结果） */
export function matchRules(text: string): SignalRule[] {
  if (!text) return [];
  return RULES.filter((r) => r.re.test(text));
}

/**
 * 一轮演进。**不回写任何东西**，调用方自己决定要不要落库。
 *
 * @param prev 演进前的状态
 * @param signals 本轮信号（至少要给 text）
 */
export function evolveEmotion(prev: EmotionState, signals: EmotionSignals): EmotionEvolution {
  const at = new Date(signals.now ?? Date.now());
  const lastAt = signals.lastAt ?? at.getTime();
  const gapMs = Math.max(0, at.getTime() - lastAt);
  const text = signals.text ?? '';
  const fromUser = signals.fromUser !== false;

  const hits = matchRules(text);

  // 逐维累加事件 delta
  const eventSum: Record<EmotionField, number> = {
    affection: 0,
    possessiveness: 0,
    restraint: 0,
    longing: 0,
  };
  for (const h of hits) {
    for (const f of EMOTION_FIELDS) {
      const d = h.effects[f];
      if (d) eventSum[f] += d;
    }
  }

  // 思念：先按沉默时长长，再由「用户回来了」回落
  const gapGrowth = Math.min(LONGING_GAP_CAP, Math.floor(gapMs / LONGING_GAP_STEP_MS));
  const relief = gapGrowth > 0 && fromUser ? LONGING_RELIEF : 0;

  // 深夜加成
  const hour = at.getHours();
  const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;

  const deltas: EmotionDelta[] = [];
  const next: EmotionState = { ...prev };

  const push = (field: EmotionField, rawDelta: number, reason: string): void => {
    if (rawDelta === 0) return;
    const before = next[field];
    const after = clamp(before + rawDelta, EMOTION_MIN, EMOTION_MAX);
    if (after === before) return; // 撞到 0/100 就不再记一条没意义的 delta
    next[field] = after;
    deltas.push({ field, label: EMOTION_LABELS[field], delta: after - before, before, after, reason });
  };

  const reasonFor = (h: SignalRule): string => `${h.label}：${h.detail}`;

  // ── 爱意 ──────────────────────────────────────────────
  if (eventSum.affection !== 0) {
    const clamped = clamp(eventSum.affection, -EVENT_DELTA_CAP, EVENT_DELTA_CAP);
    const why = hits
      .filter((h) => h.effects.affection)
      .map(reasonFor)
      .join('；');
    push('affection', clamped, why);
  } else if (isNight) {
    push('affection', 1, '夜深了，心也跟着软下来');
  } else {
    const d = drift('affection', next.affection);
    push('affection', d.delta, d.reason);
  }

  // ── 占有欲 ────────────────────────────────────────────
  if (eventSum.possessiveness !== 0) {
    const clamped = clamp(eventSum.possessiveness, -EVENT_DELTA_CAP, EVENT_DELTA_CAP);
    const why = hits
      .filter((h) => h.effects.possessiveness)
      .map(reasonFor)
      .join('；');
    push('possessiveness', clamped, why);
  } else {
    const d = drift('possessiveness', next.possessiveness);
    push('possessiveness', d.delta, d.reason);
  }

  // ── 克制 ──────────────────────────────────────────────
  if (eventSum.restraint !== 0) {
    const clamped = clamp(eventSum.restraint, -EVENT_DELTA_CAP, EVENT_DELTA_CAP);
    const why = hits
      .filter((h) => h.effects.restraint)
      .map(reasonFor)
      .join('；');
    push('restraint', clamped, why);
  } else if (isNight) {
    push('restraint', -1, '夜深了，克制松了一格');
  } else {
    const d = drift('restraint', next.restraint);
    push('restraint', d.delta, d.reason);
  }

  // ── 思念 ──────────────────────────────────────────────
  if (eventSum.longing !== 0) {
    const clamped = clamp(eventSum.longing, -EVENT_DELTA_CAP, EVENT_DELTA_CAP);
    const why = hits
      .filter((h) => h.effects.longing)
      .map(reasonFor)
      .join('；');
    push('longing', clamped, why);
  }
  if (gapGrowth > 0) {
    // 增长和回落**分开记两条** —— 面板要能同时看见「隔了多久」和「你回来了」这两件事，
    // 只报净值的话理由会丢一半。
    push('longing', gapGrowth, `已经有 ${formatDurationCN(gapMs)} 没听到你的声音了`);
    if (relief > 0) push('longing', -relief, `你终于回来说话了`);
  }

  const moodBefore = prev.currentMood;
  next.currentMood = deriveMood({ ...next, currentMood: moodBefore }, hits, at);
  const result = clampState(next);

  return {
    state: result,
    deltas,
    signals: hits.map((h) => ({ id: h.id, label: h.label })),
    moodBefore,
    moodAfter: result.currentMood,
    gapMs,
  };
}

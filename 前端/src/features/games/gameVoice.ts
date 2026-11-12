import { useEffect, useMemo, useState } from 'react';
import { listPrompts } from '@/lib/api/prompts';
import { listStyleRules } from '@/lib/api/styleRules';
import { useChatStyle, CHAT_STYLE_STORAGE_KEY } from '@/stores/chatStyleStore';
import { useProfileStore } from '@/stores/profileStore';

/**
 * 游戏对白的「语气引擎」（2026-11-12）。
 *
 * 用户要求：「这个游戏里的语气也要跟人设一样」。
 * 聊天里「他怎么说话」由两处决定，这里全部对齐，而不是另写一套游戏 NPC 口吻：
 *   1. **说话风格档位** —— 顶栏 💕/🩷 药丸（`chatStyleStore`），后端 `persona/chatStyle.ts`
 *      按请求注入 system prompt。fragmented = 一行一句、口语、诶哈嗯呀啦、可嘴硬；
 *      immersive = 沉稳温柔、连贯只写台词、禁用零碎语气词、禁括号旁白。
 *   2. **人设 / 语言风格文本** —— 「他的资料 → 角色背景资料」(profileStore.persona)、
 *      启用的全局提示词模块 (/api/prompts)、语言风格条目 (/api/style-rules)。
 *      从文本里认口吻标签（傲娇 / 活泼 / 寡言），认不出就用项目默认的温柔陪伴调。
 *
 * 硬约束（和之前一样，一个都没破）：
 * - **纯本地**：不调模型、不花 token、不写库；后端那两个接口只是「有就读、读不到就算」，
 *   离线照样能玩，不会白屏或卡住对战。
 * - **不编造记忆**：文案里没有任何具体事件、日期、地点、共同经历，只有当下这一局。
 * - 只用主题 token 渲染，不换配色、不引字体。
 */

/** 与 `chatStyleStore` 同源，不另建一套枚举 */
export type GameVoiceStyle = 'fragmented' | 'immersive';

/** 从人设文本里能认出的口吻；gentle 是项目默认（温柔陪伴） */
export type GameTone = 'gentle' | 'playful' | 'tsundere' | 'quiet';

export type GameScene =
  | 'opening'
  | 'idle'
  | 'easy'
  | 'normal'
  | 'hard'
  | 'win'
  | 'loss'
  | 'draw';

export interface GameVoice {
  style: GameVoiceStyle;
  tone: GameTone;
  /** 「我」的名字，用于 {name} 插值；没填就退回「你」 */
  myName: string;
}

/* ------------------------------------------------------------------ *
 * 1. 人设文本 → 口吻标签
 * ------------------------------------------------------------------ */

/** 按优先级排列：先判嘴硬，再判活泼，最后判寡言；都不中就是默认温柔 */
const TONE_HINTS: Array<{ tone: GameTone; re: RegExp }> = [
  { tone: 'tsundere', re: /傲娇|毒舌|嘴硬|口是心非|别扭|腹黑|刻薄|爱损|高冷|不坦率/ },
  { tone: 'playful', re: /活泼|元气|开朗|话痨|调皮|爱逗|幽默|搞笑|话多|大大咧咧|阳光/ },
  { tone: 'quiet', re: /寡言|话少|内敛|沉默|安静|沉稳|克制|成熟|年上/ },
];

/** 只做关键词分类，不生成任何新的人设内容；文本为空就是默认档 */
export function detectGameTone(personaText: string): GameTone {
  if (!personaText.trim()) return 'gentle';
  for (const hint of TONE_HINTS) {
    if (hint.re.test(personaText)) return hint.tone;
  }
  return 'gentle';
}

/* ------------------------------------------------------------------ *
 * 2. 文案库
 *    immersive：整段、沉稳温柔、只写台词、不用 诶/哈/嗯/呀/啦
 *    fragmented：一行一句（≤15 字）、口语、2 行左右、可带语气词
 *    两套都禁止动作 / 神态 / 心理描写与括号旁白，也都去掉了争输赢、挑衅、放水的竞技调。
 * ------------------------------------------------------------------ */

/** opening 单独按游戏挑句子，这里留空数组只为让索引类型统一 */
type SceneLines = Record<GameScene, string[]>;
type OpeningLines = Record<string, string[]>;

const GENTLE: Record<GameVoiceStyle, SceneLines> = {
  immersive: {
    opening: [],
    idle: [
      '{name}慢慢想，我不催。',
      '这步走得很稳。',
      '我一直都在。',
      '不赶时间，陪你下完就好。',
      '输赢都不重要，我陪着你。',
      '想好了再落子也没关系。',
    ],
    easy: ['简单一点也好，慢慢来就好。'],
    normal: ['就这样下吧，我陪着你。'],
    hard: ['难一点也没关系，我陪你慢慢想。'],
    win: ['这局你赢了，我真心替你高兴。', '下得很好，我认了。', '赢了我也不走，再来一局吧。'],
    loss: ['这局是我赢了，不过别放在心上。', '没关系，我们再下一局。', '赢了也没什么，我陪你继续。'],
    draw: ['平局，这样也挺好。', '谁都没输，正好再来一局。'],
  },
  fragmented: {
    opening: [],
    idle: [
      '嗯…我看看',
      '不急哈\n{name}慢慢想',
      '我在呢',
      '这步挺稳呀',
      '诶 等下',
      '轮到你啦',
      '别紧张哈',
      '还早呢',
      '我再陪你一会儿',
      '嗯 不催你',
    ],
    easy: ['简单点也好\n慢慢来哈'],
    normal: ['好 就这样\n公平下'],
    hard: ['换困难啦\n那我认真点'],
    win: ['诶 你赢啦\n厉害呀', '这局算你赢\n我认了', '下回我再来'],
    loss: ['嘿嘿 我赢啦', '别急哈\n再来一局', '承让啦\n再下一局呗'],
    draw: ['打平啦\n谁也没输', '平手诶\n再来一局', '这样也挺好'],
  },
};

const OPENING: Record<GameVoiceStyle, OpeningLines> = {
  immersive: {
    tictactoe: ['我陪你下一局，慢慢来。', '不急着落子，我在这儿。'],
    gomoku: ['棋盘摆好了，我陪你。', '这一局我们慢慢下。'],
    memory: ['一起翻吧，我记得住。', '不比快慢，陪你翻完就好。'],
  },
  fragmented: {
    tictactoe: ['来啦\n我陪你下', '诶 开局啦\n慢慢来就好'],
    gomoku: ['棋盘摆好啦\n不急哈', '来 我陪你\n慢慢落子'],
    memory: ['一起翻呗\n我记着呢', '诶 开始啦\n别急哈'],
  },
};

/** 人设写了「傲娇 / 毒舌」才启用；仍留三分之二概率说默认温柔句，不至于全程嘴硬 */
const EDGY: Record<GameVoiceStyle, Partial<SceneLines>> = {
  immersive: {
    idle: ['别磨蹭了，我可没说我等你。', '这步也就一般吧。'],
    win: ['赢了就赢了，别得意太久。', '算你运气好，我还没认真。'],
    loss: ['输了也别撇嘴，我陪你再来。', '这局归我，不服就再来。'],
  },
  fragmented: {
    idle: ['哼 快一点啦', '诶 别磨蹭\n我可没等你'],
    win: ['哼 算你赢啦', '别得意呀\n下回不让了'],
    loss: ['嘿嘿 我赢啦\n不服再来', '这局归我\n别撇嘴呀'],
  },
};

/** 人设写了「活泼 / 元气」才启用 */
const LIVELY: Record<GameVoiceStyle, Partial<SceneLines>> = {
  immersive: {
    idle: ['这步真漂亮。', '这一局比刚才更有意思了。'],
    win: ['你赢啦，我真服了。', '好厉害，再来一局吧。'],
    loss: ['这局归我，不过下一局我还要玩。', '赢了也别停，我们继续。'],
  },
  fragmented: {
    idle: ['哇 这步好呀', '诶诶 有意思\n快继续'],
    win: ['哇 你赢啦\n好厉害呀', '太棒啦\n再来一局嘛'],
    loss: ['嘿嘿 我赢啦\n再玩一局嘛', '这局归我\n下一局继续呀'],
  },
};

function pick(list: string[], seed: number): string {
  if (!list.length) return '';
  return list[Math.abs(seed) % list.length];
}

/** 按语气 + 场景取一句；纯函数，方便单测与回归 */
export function gameLine(
  scene: GameScene,
  voice: GameVoice,
  gameId: string,
  seed = 0,
): string {
  const opening = OPENING[voice.style];
  const base =
    scene === 'opening'
      ? opening[gameId] ?? opening.tictactoe
      : GENTLE[voice.style][scene];

  let text: string;
  if (voice.tone === 'tsundere' && EDGY[voice.style][scene]?.length) {
    const edgy = EDGY[voice.style][scene] as string[];
    text = seed % 3 === 0 ? pick(base, seed) : pick(edgy, seed);
  } else if (voice.tone === 'playful' && LIVELY[voice.style][scene]?.length) {
    const lively = LIVELY[voice.style][scene] as string[];
    text = seed % 3 === 0 ? pick(base, seed) : pick(lively, seed);
  } else if (voice.tone === 'quiet') {
    // 寡言：只取最短的一句，不叠任何修饰
    text = [...base].sort((a, b) => a.length - b.length)[0] ?? '';
  } else {
    text = pick(base, seed);
  }

  const name = voice.myName.trim();
  return text.replace(/\{name\}/g, name || '你');
}

/* ------------------------------------------------------------------ *
 * 3. 收集人设输入（离线优先）
 * ------------------------------------------------------------------ */

/**
 * 人设文本三处来源合并：
 * - `profileStore.persona`：用户填的「他是谁 · 角色背景资料」，纯本地、立刻生效；
 * - `/api/prompts`、`/api/style-rules`：聊天时真正注入 system prompt 的启用内容。
 *   异步读，失败就当没有 —— 游戏屋是纯前端本地对战，不能因为后端没开就说不出话。
 */
export function useGameVoice(): GameVoice {
  const style = useChatStyle((s) => s.mode);
  const syncFromStorage = useChatStyle((s) => s.syncFromStorage);
  const persona = useProfileStore((s) => s.persona);
  const myName = useProfileStore((s) => s.name);
  const [remoteText, setRemoteText] = useState('');

  // 同一标签页内切药丸由 zustand 自动同步；跨标签页切要自己接 storage 事件
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAT_STYLE_STORAGE_KEY) syncFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncFromStorage]);

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([listPrompts(), listStyleRules()]).then(([p, r]) => {
      if (!alive) return;
      const parts: string[] = [];
      if (p.status === 'fulfilled') {
        parts.push(...p.value.filter((x) => x.enabled).map((x) => x.content));
      }
      if (r.status === 'fulfilled') {
        parts.push(...r.value.filter((x) => x.enabled).map((x) => x.content));
      }
      setRemoteText(parts.join('\n'));
    });
    return () => {
      alive = false;
    };
  }, []);

  const tone = useMemo(
    () => detectGameTone([persona, remoteText].filter(Boolean).join('\n')),
    [persona, remoteText],
  );

  return { style, tone, myName };
}

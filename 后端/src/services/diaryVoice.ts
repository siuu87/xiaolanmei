import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage } from '../adapters/types.js';
import { db } from '../db/client.js';
import { messages } from '../db/schema.js';
import { getAdapterConfig, getModelConfig } from '../routes/stations.js';
import { buildSystemPrompt } from '../routes/prompts.js';

/**
 * 他留在日记纸页上的那张小便签，写什么（2026-11-16）。
 *
 * 以前是几个写死的文案池，读起来都像同一个人在复印 —— 用户说「这个字条也要抓人设」。
 * 现在改成：拿**完整人设提示词**（`buildSystemPrompt`，跟聊天用的是同一份）当底，
 * 再压一层「这是便签不是聊天」的写法约束，让模型自己按他的人设写。
 *
 * 几个刻意的取舍：
 * - **不阻塞请求**：条本来就延迟十几小时到两天才浮现（见 `diary_slips.reveal_at`），
 *   所以调用方先落一条兜底文案占位、再 fire-and-forget 换成人设版，用户永远不会看到占位文案。
 * - **失败就留着兜底文案**：不像深夜来信那样「连不上就不写」—— 便签是场景里的小物件，
 *   少一张会变成「敲了门他完全没反应」，比文字普通更出戏。
 * - **只喂真实素材**：我夹的条原文、我那一页的日记、他自己那一页写的字。
 *   素材里没有的事不许编（跟 `letterContext` 同一条红线）。
 */
export type SlipScene = 'knock_shut' | 'knock_open' | 'visit' | 'seen' | 'discover';

/** 场景 → 一句「他现在在干什么」的说明（模型据此决定语气） */
const SCENE_TEXT: Record<SlipScene, string> = {
  knock_shut:
    '有人在门外敲你锁着的那一页日记，你没开门；过了一会儿，你从门缝里塞了一张便签出去。',
  knock_open:
    '有人敲你锁着的那一页日记，你把门打开了；看完之后，你顺手在那一页上留了一张便签。',
  visit: '你路过对方（你陪着的那个人）的日记本，随手在其中一页上贴了一张便签。没有特别的事。',
  seen: '你翻对方的日记时，看到对方夹在那个日期上的一张便签。这是很久之后，你贴了一张回来。',
  discover:
    '你发现有人撬开过你锁着的那一页日记（不是你给开的）。这是很久之后，你贴了一张便签过去。',
};

/** 便签写法：压在人设之上的一层「手写小纸片」约束 */
const SLIP_RULE = [
  '【现在你要写的东西】',
  '不是发消息，是一张手写的小便签 —— 会被人夹在日记本的纸页上。',
  '',
  '1. 只写 1~2 句，整张不超过 40 个字（最多 45）。',
  '2. 口语、轻、留白。像随手写的，不像发出去的消息：不用表情、不堆标点、不用「~」。',
  '3. 语气要符合你平时说话的样子的——但比聊天更省、更收敛，便签上写不了长篇。',
  '4. 不写称呼，不写落款，不解释「我为什么写这个」，不要用引号把整句包起来。',
  '5. 只能提【真实素材】里确实出现过的字和事。素材少就写得很淡（天气、时间、让对方早点睡这类），',
  '   不许补一个素材里根本不存在的事，也不许假装记得没发生过的东西。',
  '6. 不要写成诗，不要金句，不要「愿你…」「记得要…」这种祝福腔，也不要教训人。',
  '',
  '【输出】',
  '只输出便签正文本身，最多两行。不要标题、不要解释、不要写「以下是」。',
].join('\n');

export interface SlipMaterial {
  scene: SlipScene;
  /** 「11 月 15 日」这种给人看的日期 */
  dayLabel: string;
  /** 我夹在这一页的条（原话） */
  myNote?: string;
  /** 我这一页写的日记正文 */
  myEntry?: string;
  /** 他自己日记本上同一页写的字 */
  hisEntry?: string;
}

/** 一张便签最多个字：模型偶尔写超，硬截到 60，别把方纸上撑出十几行 */
const MAX_LEN = 60;

/**
 * 这些不是他说的话，喂进语感里会把便签写成故障播报：
 * 抱上来的系统旁白（`（有人在门外敲门）`）、报错提示（`⚠️ 无法连接模型服务…`）、
 * 空内容、单字敷衍。
 */
function notVoice(c: string): boolean {
  return (
    c.startsWith('（') ||
    c.startsWith('(') ||
    c.startsWith('⚠') ||
    /无法连接模型服务|fetch failed|no_model|Error[:：]|timeout/i.test(c) ||
    c.length < 6
  );
}

/**
 * 他平时说话的语感：从最近的聊天里抽几句**他自己说过的话**当 few-shot。
 *
 * 为什么不只靠 `buildSystemPrompt`：人设模块可能被删、被改，甚至只剩一条说话风格；
 * 而「他到底怎么说话」真正落在聊天记录里 —— 抽四句短的，比任何形容词都准。
 */
function voiceSamples(): string {
  const rows = db
    .select()
    .from(messages)
    .all()
    .filter((m) => m.deletedAt == null && m.role === 'assistant')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((m) => m.content.trim())
    .filter((c) => c.length <= 90 && !notVoice(c));
  return Array.from(new Set(rows))
    .slice(0, 4)
    .map((c) => `「${c}」`)
    .join('\n');
}

/**
 * 生成一张便签的正文。**失败返回 null**，调用方继续用兜底文案。
 *
 * 注意这是慢操作（模型往返几秒），只在「条已经延迟了十几小时」的场景里调用，
 * 千万不要挂在用户点一下就等回应的路径上。
 */
export async function taSlipLine(m: SlipMaterial): Promise<string | null> {
  try {
    const cfg = getModelConfig();
    const adapter = openaiCompatibleAdapter(getAdapterConfig());

    const material: string[] = [];
    if (m.myNote?.trim()) material.push(`- 对方夹在这一页的便签上写着：「${m.myNote.trim()}」`);
    if (m.myEntry?.trim()) material.push(`- 对方这一页的日记：${clip(m.myEntry, 260)}`);
    if (m.hisEntry?.trim()) material.push(`- 你自己这一页写的：${clip(m.hisEntry, 260)}`);

    const samples = voiceSamples();
    const system = [
      buildSystemPrompt(cfg.model),
      samples
        ? `\n【你平时说话的样子（真实聊天摘录，只学语气和用词，不要照抄任何一句）】\n${samples}`
        : '',
      '',
      SLIP_RULE,
    ]
      .filter(Boolean)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          `【场景】${SCENE_TEXT[m.scene]}`,
          `【这一页的日期】${m.dayLabel}`,
          '',
          '【真实素材】',
          material.length ? material.join('\n') : '（这一页没有别的字，只有一张空白的便签）',
        ].join('\n'),
      },
    ];

    // 便签要有人味，temperature 给高一点；字数少，maxTokens 卡死别让它顺手写篇小作文
    const r = await adapter.complete({
      model: cfg.model,
      messages,
      temperature: Math.max(cfg.temperature ?? 0.8, 0.95),
      maxTokens: 160,
    });

    const line = clean(r.content ?? '');
    return line || null;
  } catch {
    // 模型没配 / 站子挂了 / Key 不对 —— 都退回兜底文案，不要在这个路径上抛错
    return null;
  }
}

/** 剥掉模型爱加的东西：代码块、整句引号、开头的小标题 */
function clean(raw: string): string {
  const s = raw
    .trim()
    .replace(/^```[\w-]*\s*\n?/g, '')
    .replace(/\n?```\s*$/g, '')
    .replace(/^#+\s*[^\n]*\n+/, '')
    .replace(/^["「『]+|["」』]+$/g, '')
    .replace(/\r/g, '')
    // 便签最多两行：多余的空行折掉，别在方纸上撑开一片空
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')
    .trim();
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…` : s;
}

function clip(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

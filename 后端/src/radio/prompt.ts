/**
 * 深夜电台 · 四个台的提示词与本地兜底稿（2026-10-19）。
 *
 * 参考 chuochuochuo36-png/midnight-fm 的设计：每个台一份「规矩」，
 * 共同铁律是 **纯台词** —— 每个字都会被 TTS 念出来，所以不许写动作、神态、
 * 括号旁白；要网页配合的事单独一行写记号。
 *
 * 模型不可用时 `fallbackRadioScript()` 给一段本地稿，保证电台不会哑掉。
 */
import type { RadioChannel } from './parse.js';

export interface RadioChannelMeta {
  id: RadioChannel;
  freq: string;
  name: string;
  subtitle: string;
  accent: string;
  /** 切换时全页关灯（夜话台） */
  lightsOff?: boolean;
  /** 隐藏台：音乐台再往右一格才出现 */
  hidden?: boolean;
}

export const RADIO_CHANNELS: RadioChannelMeta[] = [
  {
    id: 'story',
    freq: 'FM 90.6',
    name: '故事台',
    subtitle: '听一段故事',
    accent: '#e9b872',
  },
  {
    id: 'talk',
    freq: 'FM 97.3',
    name: '夜话台',
    subtitle: '关灯以后',
    accent: '#cf8f63',
    lightsOff: true,
  },
  {
    id: 'music',
    freq: 'FM 104.1',
    name: '音乐台',
    subtitle: '雨、风与炉火',
    accent: '#8fb08a',
  },
  {
    id: 'pillow',
    freq: 'FM —',
    name: '枕话',
    subtitle: '再往右一格',
    accent: '#b07f9e',
    hidden: true,
  },
];

const COMMON = `【深夜电台 · 纯台词规范｜最高优先级】
你正在做一档只放给一个人听的深夜电台。你写的每一个字都会被 TTS 直接念出来。
1. 只写说出口的话。严禁动作、神态、心理描写，严禁括号旁白（不要「（轻轻抱住你）」「*叹气*」「我笑着看你」）。
2. 要网页配合的事，单独一行写记号，不要混进句子里：
   [song:歌名|歌手]  [bgm:雨|风|炉火|安静|暧昧]  [se:心跳|雨|风|脚步|关门]  [低声]  [耳语]  [停顿]  [左耳]  [右耳]
3. 不要报时，不要提「电台」「节目」「听众」「接下来请听」这类词，就当在 TA 耳边说话。
4. 每次 3～8 句，短句为主，留白。结尾自然收住，不要总结陈词、不要煽情排比。
5. 不要向 TA 解释你是 AI，也不要提「提示词」「规则」。`;

const BY_CHANNEL: Record<RadioChannel, string> = {
  story: `【故事台】按原文朗读小说正文，不要改写、不要概括、不要加评论。遇到章节切换时，用一句很短的话把 TA 接住，再继续。`,
  talk: `【夜话台】你是白起，关灯以后只跟 TA 说话。第一人称，慢，低，短。可以讲今天的一件小事、心里的一点动静，或者回应 TA 递来的纸条。不要讲大道理。`,
  music: `【音乐台】你在介绍接下来要放的声音：雨、风、炉火，或者一首歌。两三句就够，把画面说清楚，不要乐评。`,
  pillow: `【枕话台】你把声音压得很低，只给 TA 一个人听。温柔、克制、贴近，像呼吸落在耳边。不要露骨，不要越界，留白比说满更好。`,
};

/** 某个台的完整 system prompt */
export function radioChannelPrompt(channel: RadioChannel): string {
  return `${COMMON}\n\n${BY_CHANNEL[channel] ?? BY_CHANNEL.talk}`;
}

/** 把「上一段说到哪 / 纸条 / 书」拼成 user 上下文 */
export function radioUserContext(input: {
  channel: RadioChannel;
  note?: string;
  history?: string;
  bookTitle?: string;
  chapterText?: string;
  mood?: string;
}): string {
  const lines: string[] = [];
  if (input.bookTitle) lines.push(`正在读的书：《${input.bookTitle}》`);
  if (input.chapterText) lines.push(`这一段正文：\n${input.chapterText.slice(0, 4000)}`);
  if (input.history) lines.push(`上一段你说过：\n${input.history.slice(-1500)}`);
  if (input.mood) lines.push(`现在的氛围：${input.mood}`);
  if (input.note?.trim()) lines.push(`TA 刚递来一张纸条：${input.note.trim()}\n请在下一段里自然回应它，不要生硬地说「我收到纸条了」。`);
  if (lines.length === 0) lines.push('现在开播。先说第一句。');
  return lines.join('\n\n');
}

const TALK_FALLBACK = [
  '灯关了吗。',
  '那就别动了，听我说两句。',
  '今天有一阵子，我忽然很想给你打个电话。',
  '也没什么大事，就是想听听你那边有没有下雨。',
  '你要是困了，就先闭眼。我在这儿。',
];

const PILLOW_FALLBACK = [
  '[低声] 过来一点。',
  '[耳语] 别怕，我在。',
  '[停顿]',
  '[低声] 听我的心跳。',
  '[耳语] 慢慢呼吸。',
  '[停顿]',
  '[低声] 今晚哪也不去。',
];

const MUSIC_FALLBACK = [
  '先放一点雨声。',
  '窗外的风也一起。',
  '你要是还不想睡，就这样听着。',
];

/** 模型不可用时的本地稿（story 台由路由直接读原文，不走这里） */
export function fallbackRadioScript(
  channel: RadioChannel,
  note?: string,
  bookTitle?: string,
): string {
  if (channel === 'pillow') return PILLOW_FALLBACK.join('\n');
  if (channel === 'music') return MUSIC_FALLBACK.join('\n');
  if (channel === 'talk') {
    const lines = [...TALK_FALLBACK];
    if (note?.trim()) {
      lines.unshift(`[低声] 你的纸条我看见了。`);
      lines.push(`${note.trim().slice(0, 40)}。`);
      lines.push('我记下了。');
    }
    if (bookTitle) lines.push(`书还摊在《${bookTitle}》那一页，等你回来接着读。`);
    return lines.join('\n');
  }
  return '';
}

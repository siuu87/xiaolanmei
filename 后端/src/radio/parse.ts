/**
 * 深夜电台广播稿解析（radio_parse，2026-10-19）。
 *
 * 为什么要有这一层：模型写的稿子不能直接丢给 TTS —— 里面混着 `[song:…]`
 * 这种给网页看的记号，也可能偷偷写「（轻轻抱住你）」这种旁白。
 * 这里把稿子拆成**可执行片段**：
 *   - `speak` 交给 TTS，先洗掉括号旁白/星号动作；
 *   - `song` / `bgm` / `se` / `pause` 交给网页去放歌、换配乐、播音效、停顿；
 *   - `<本子>` / `<轨道>` / `<摘要>` 不念，单独存起来给下一轮用。
 *
 * 纯函数、零 IO，方便单测。
 */

export type RadioChannel = 'story' | 'talk' | 'music' | 'pillow';

export type RadioSegment =
  | { type: 'speak'; text: string; tone?: string; ear?: 'left' | 'right' }
  | { type: 'song'; name: string; artist?: string }
  | { type: 'bgm'; mood: string }
  | { type: 'se'; name: string }
  | { type: 'pause'; ms: number }
  | { type: 'outline'; text: string }
  | { type: 'tracks'; text: string }
  | { type: 'summary'; text: string };

export interface RadioScript {
  segments: RadioSegment[];
  /** 故事大纲，不念，存起来下一段开播带回去 */
  outline?: string;
  /** 枕话的轨道表，不念 */
  tracks?: string;
  /** 收台的一句话，进记忆 */
  summary?: string;
}

const BLOCK_RE = /<(本子|轨道|摘要)>([\s\S]*?)<\/\1>/g;

/**
 * TTS 前的清洗：括号旁白、星号动作一律去掉。
 * 这是**兜底**——提示词里已经禁止写动作；但模型偶尔不听话，不能让它把
 * 「（轻轻抱住你）」念出来。
 */
export function sanitizeSpoken(text: string): string {
  return text
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 主解析：一行一条，记号单独成行（与 midnight-fm 的约定一致） */
export function parseRadioScript(script: string): RadioScript {
  let outline: string | undefined;
  let tracks: string | undefined;
  let summary: string | undefined;

  // 先抠出块级内容，再从正文里删掉（块里可能有换行，不能按行处理）
  const withoutBlocks = (script ?? '').replace(BLOCK_RE, (_m, kind: string, body: string) => {
    const text = body.trim();
    if (kind === '本子') outline = text;
    else if (kind === '轨道') tracks = text;
    else summary = text;
    return '';
  });

  const segments: RadioSegment[] = [];
  let tone: string | undefined;
  let ear: 'left' | 'right' | undefined;

  for (const raw of withoutBlocks.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const effect = /^\[(song|bgm|se):([^\]]+)\]$/.exec(line);
    if (effect) {
      const [, kind, value] = effect;
      if (kind === 'song') {
        const [name, artist] = value.split('|').map((s) => s.trim());
        segments.push({ type: 'song', name: name || value.trim(), ...(artist ? { artist } : {}) });
      } else if (kind === 'bgm') {
        segments.push({ type: 'bgm', mood: value.trim() });
      } else {
        segments.push({ type: 'se', name: value.trim() });
      }
      continue;
    }

    const toneM = /^\[(低声|耳语|叹气|停顿|左耳|右耳|贴近|轻声)\]$/.exec(line);
    if (toneM) {
      const t = toneM[1];
      if (t === '停顿') segments.push({ type: 'pause', ms: 900 });
      else if (t === '左耳') ear = 'left';
      else if (t === '右耳') ear = 'right';
      else if (t !== '贴近') tone = t;
      continue;
    }

    // 行内语气：[低声] 你的纸条我看见了。—— 记号与台词同一行也要认
    const inlineTone = /^\[(低声|耳语|叹气|停顿|左耳|右耳|贴近|轻声)\]\s*([\s\S]+)$/.exec(line);
    if (inlineTone) {
      const t = inlineTone[1];
      if (t === '停顿') segments.push({ type: 'pause', ms: 900 });
      else if (t === '左耳') ear = 'left';
      else if (t === '右耳') ear = 'right';
      else if (t !== '贴近') tone = t;
      const text = sanitizeSpoken(inlineTone[2]);
      if (text) {
        segments.push({
          type: 'speak',
          text,
          ...(tone ? { tone } : {}),
          ...(ear ? { ear } : {}),
        });
      }
      tone = undefined;
      ear = undefined;
      continue;
    }

    // 其它纯记号行（[笑] 之类）：不念，当语气提示
    if (/^\[[^\]]+\]$/.test(line)) {
      tone = line.slice(1, -1);
      continue;
    }

    const text = sanitizeSpoken(line);
    if (!text) continue;
    segments.push({
      type: 'speak',
      text,
      ...(tone ? { tone } : {}),
      ...(ear ? { ear } : {}),
    });
    // 语气只管紧跟着的那一句
    tone = undefined;
    ear = undefined;
  }

  return {
    segments,
    ...(outline ? { outline } : {}),
    ...(tracks ? { tracks } : {}),
    ...(summary ? { summary } : {}),
  };
}

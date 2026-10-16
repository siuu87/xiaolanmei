/**
 * 服务端对齐算法（NEST 滚动字幕「对齐适配器」这一层）。
 *
 * ⚠️ **这是 `前端/src/lib/caption/core.ts` 的服务端等价实现，两份必须逐字等价。**
 * 为什么不直接 import 前端那份：前后端是两个独立部署单元（`deploy/docker-compose.yml`
 * 各构建各的镜像），跨目录引用会让后端的镜像依赖前端的源码树。
 * 代价是两份可能漂移 —— 所以有 `前端/tests/caption-parity.test.ts` 拿同一批用例
 * （含上游 `caption-core.test.mjs` 的全部场景）同时跑两份，输出必须逐字相等。
 * **改这里就一定要跑那个测试；不一致它会直接红。**
 *
 * 上游：https://github.com/nonchaiovo/nest-voice-captions （作者 nonchaiovo）
 * 许可：个人非商业使用与修改、须保留署名；不得商业使用或公开再分发。
 *
 * 服务端只需要"校验 + 对齐"两个纯函数；`voiceRevealTimes`（显示细分）和
 * `normalizeVoiceMp3Seek`（播放端字节处理）属于展示层，留在前端。
 */

export type CaptionSource = 'elevenlabs-forced-alignment' | 'deepgram-word-timestamps' | 'groq-word-timestamps';

export const CAPTION_SOURCES: readonly CaptionSource[] = [
  'elevenlabs-forced-alignment',
  'deepgram-word-timestamps',
  'groq-word-timestamps',
];

export interface Cue {
  text: string;
  start: number | null;
  end: number | null;
}

export interface Alignment {
  text: string;
  audioIdentity: string;
  duration: number;
  source: CaptionSource;
  cues: Cue[];
}

export interface RecognizedWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface ForcedAlignmentResult {
  characters?: Array<{ text: string; start: number; end: number }>;
}

/* ---------------- 内部工具 ---------------- */

const graphemeSplit = (text: string): string[] =>
  Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (x) => x.segment);

/** 匹配序列：NFKC + 小写 + 只留 Unicode 字母数字。**显示仍用原文。** */
const letters = (text: string): string[] =>
  Array.from(text.normalize('NFKC').toLowerCase()).filter((c) => /[\p{L}\p{N}]/u.test(c));

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ---------------- 字符级强制对齐 ---------------- */

/**
 * 校验服务商返回的 `characters`：起点不逆序、终点不早于起点、时间有限且不超过 3600 秒，
 * 首个起点不能小于零。规范化后的原文必须与供应商字符**完全匹配**，否则返回 `null`。
 * 标点继承前一个结束位置，起止相同。
 */
export function normalizeAlignment(text: string, result: ForcedAlignmentResult | null | undefined): Cue[] | null {
  if (!Array.isArray(result?.characters) || !result.characters.length) return null;
  const spoken: Array<{ char: string; start: number; end: number }> = [];
  let previous = 0;
  for (const item of result.characters) {
    if (
      typeof item.text !== 'string' ||
      !isNum(item.start) ||
      !isNum(item.end) ||
      item.start < previous ||
      item.end < item.start ||
      item.end > 3600
    ) {
      return null;
    }
    previous = item.start;
    for (const char of letters(item.text)) spoken.push({ char, start: item.start, end: item.end });
  }
  const units = graphemeSplit(text);
  if (units.flatMap(letters).join('') !== spoken.map((x) => x.char).join('') || !spoken.length) {
    return null;
  }
  let index = 0;
  let lastEnd = spoken[0].start;
  return units.map((char) => {
    const count = letters(char).length;
    if (!count) return { text: char, start: lastEnd, end: lastEnd };
    const first = spoken[index];
    const last = spoken[index + count - 1];
    index += count;
    lastEnd = last.end;
    return { text: char, start: first.start, end: last.end };
  });
}

/* ---------------- 词级识别回退 ---------------- */

/**
 * 用最长公共子序列把识别词时间戳保守地映射到原文。
 * 详见前端那份的注释；两份语义必须一致。
 */
export function alignRecognizedWords(
  text: string,
  words: RecognizedWord[] | null | undefined,
  { allowPartial = false }: { allowPartial?: boolean } = {},
): Cue[] | null {
  if (!Array.isArray(words)) return null;
  const units = graphemeSplit(text);
  const input = units.flatMap((char, index) => letters(char).map((c) => ({ char: c, index })));

  const heard: Array<{ char: string; start: number; end: number; token: number }> = [];
  let previous = 0;
  for (const [token, w] of words.entries()) {
    if (!isNum(w.start) || !isNum(w.end) || w.start < previous || w.end < w.start || w.end > 3600) return null;
    previous = w.start;
    // 缺 confidence 同样丢弃（`undefined >= 0.7` 为 false）—— 上游行为，Groq 需调用方补 1
    const confidence = typeof w.confidence === 'number' ? w.confidence : Number.NaN;
    if (!(confidence >= 0.7)) continue;
    for (const char of letters(w.word || '')) heard.push({ char, start: w.start, end: w.end, token });
  }
  if (!input.length || !heard.length || input.length * heard.length > 4000000) return null;

  const n = input.length;
  const m = heard.length;
  const cols = m + 1;
  const dp = new Uint16Array((n + 1) * cols);
  for (let i = n - 1; i >= 0; i--) {
    for (let k = m - 1; k >= 0; k--) {
      dp[i * cols + k] =
        input[i].char === heard[k].char
          ? 1 + dp[(i + 1) * cols + k + 1]
          : Math.max(dp[(i + 1) * cols + k], dp[i * cols + k + 1]);
    }
  }
  const matches = new Map<number, { char: string; start: number; end: number; token: number }>();
  let i = 0;
  let k = 0;
  while (i < n && k < m) {
    if (input[i].char === heard[k].char) {
      matches.set(i, heard[k]);
      i++;
      k++;
    } else if (dp[(i + 1) * cols + k] >= dp[i * cols + k + 1]) {
      i++;
    } else {
      k++;
    }
  }

  const totals = new Map<number, number>();
  const matched = new Map<number, number>();
  for (const h of heard) totals.set(h.token, (totals.get(h.token) || 0) + 1);
  for (const h of matches.values()) matched.set(h.token, (matched.get(h.token) || 0) + 1);
  for (const [index, h] of matches) {
    if (totals.get(h.token) !== matched.get(h.token)) matches.delete(index);
  }

  if (matches.size / n < 0.8) {
    let run = 0;
    let longest = 0;
    let previousInput = -2;
    let previousHeard = -2;
    const heardIndex = new Map(heard.map((h, index) => [h, index]));
    for (const [index, h] of matches) {
      const hi = heardIndex.get(h) ?? -1;
      run = index === previousInput + 1 && hi === previousHeard + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      previousInput = index;
      previousHeard = hi;
    }
    if (!allowPartial || matches.size / n < 0.35 || longest < 6) return null;
  }

  const byUnit = new Map<number, { char: string; start: number; end: number; token: number }>();
  for (const [index, h] of matches) {
    const u = input[index].index;
    if (!byUnit.has(u)) byUnit.set(u, h);
  }
  return units.map((char, index) => ({
    text: char,
    start: byUnit.get(index)?.start ?? null,
    end: byUnit.get(index)?.end ?? null,
  }));
}

/** Groq 没有逐词置信度：补 1（**只是输入适配**，不代表服务商声称 100% 置信） */
export const withDefaultConfidence = (words: Array<Omit<RecognizedWord, 'confidence'>>): RecognizedWord[] =>
  words.map((w) => ({ ...w, confidence: 1 }));

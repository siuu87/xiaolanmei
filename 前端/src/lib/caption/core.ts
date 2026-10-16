/**
 * NEST 滚动字幕 · 核心算法（TypeScript 移植版）
 *
 * 逐行等价移植自 https://github.com/nonchaiovo/nest-voice-captions 的 `caption-core.mjs`
 * （作者 nonchaiovo。许可：个人非商业使用与修改、须保留署名；不得商业使用或公开再分发。）
 * 移植**只做类型化，不改算法语义** —— 改算法请回到上游仓库对照，不要在这里"顺手优化"。
 *
 * 五条不可动摇的规矩（原文 §1 / §3 / §4 / §10）：
 *  1. **音频先播，对齐异步**。绝不为字幕重新合成一段声音。
 *  2. **seekTime 与 revealTime 分离**。视觉插值不得变成可点击的"精确"时间。
 *  3. 没有可靠时间戳的字，`start` 必须是 `null`，**不能转成 0**。
 *  4. 用 grapheme 分字，索引必须与屏幕上的原文完全一致。
 *  5. 音频标识 / 时长 / 文本任一变化，旧时间轴立即失效。
 */

/* ------------------------------------------------------------------ *
 * 类型（对应原文 §2 的数据契约）
 * ------------------------------------------------------------------ */

/** 对齐来源。前两个是词级（可做词内显示细分），第一个是字符级。 */
export type CaptionSource = 'elevenlabs-forced-alignment' | 'deepgram-word-timestamps' | 'groq-word-timestamps';

/**
 * 一个字幕单元。`text` 是**一个 grapheme**，必须与屏幕上显示的原文逐字相等。
 * `start` 为 `null` 表示**没有可靠定位** —— 界面必须禁止它精确跳播。
 */
export interface Cue {
  text: string;
  start: number | null;
  end: number | null;
}

/** 一条录音的完整对齐结果。`audioIdentity` 是音频内容哈希或不可变版本 ID。 */
export interface Alignment {
  text: string;
  audioIdentity: string;
  duration: number;
  source: CaptionSource;
  cues: Cue[];
}

/** 服务商返回的**词级**时间戳（Deepgram / Groq 那种）。 */
export interface RecognizedWord {
  word: string;
  start: number;
  end: number;
  /** Deepgram 有；Groq 没有，接入时补 1（只是输入适配，不代表服务商声称 100% 置信） */
  confidence?: number;
}

/** 服务商返回的**字符级**强制对齐结果。 */
export interface ForcedAlignmentResult {
  characters?: Array<{ text: string; start: number; end: number }>;
}

/* ------------------------------------------------------------------ *
 * 内部工具
 * ------------------------------------------------------------------ */

/** TS 的 lib 停在 ES2020，没有 `Intl.Segmenter` 的类型；按实际运行时形状最小声明一份。 */
interface GraphemeSegment {
  segment: string;
}
interface GraphemeSegmenter {
  segment(input: string): Iterable<GraphemeSegment>;
}
interface SegmenterCtor {
  new (
    locales?: string | string[],
    options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
  ): GraphemeSegmenter;
}
const SegmenterImpl = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;

/**
 * 按 grapheme 分割。前端原实现遇到不支持 Segmenter 的环境退回 `Array.from`
 * —— 那个回退**只保证码点边界**（组合音标、ZWJ emoji 会被拆坏），够用而已。
 */
export const graphemeSplit = (text: string): string[] =>
  SegmenterImpl
    ? Array.from(new SegmenterImpl(undefined, { granularity: 'grapheme' }).segment(text), (x) => x.segment)
    : Array.from(text);

/** 匹配序列：NFKC + 小写 + 只留 Unicode 字母数字。**显示仍用原文，不要覆盖回界面。** */
const letters = (text: string): string[] =>
  Array.from(text.normalize('NFKC').toLowerCase()).filter((c) => /[\p{L}\p{N}]/u.test(c));

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* ------------------------------------------------------------------ *
 * 1. 显示分字
 * ------------------------------------------------------------------ */

/**
 * 按 grapheme 分割**前端显示文字**。
 * `Segmenter` 不可用时退回 `Array.from`（只保证码点边界）。
 */
export function voiceTextUnits(text: string): Array<{ char: string }> {
  return (typeof SegmenterImpl === 'function' ? graphemeSplit(text) : Array.from(text)).map((char) => ({ char }));
}

/* ------------------------------------------------------------------ *
 * 2. 字符级强制对齐：校验并规范化
 * ------------------------------------------------------------------ */

/**
 * 校验服务商返回的 `characters`：起点不逆序、终点不早于起点、时间有限且不超过 3600 秒，
 * 首个起点不能小于零。规范化后的原文必须与供应商字符**完全匹配**，否则返回 `null`。
 * 标点继承前一个结束位置，起止相同。
 *
 * 返回 `null` 表示**这份对齐不可用**，调用方必须走「无测量时间」的分支。
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
  if (
    units.flatMap(letters).join('') !== spoken.map((x) => x.char).join('') ||
    !spoken.length
  ) {
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

/* ------------------------------------------------------------------ *
 * 3. 词级识别回退
 * ------------------------------------------------------------------ */

/**
 * 用**最长公共子序列**把识别词时间戳保守地映射到原文。
 *
 * - 置信度低于 0.7 的词丢弃（`confidence` 缺省时不参与，见下方说明）。
 * - **只保留完整匹配的供应商单词** —— 不能从另一个单词里借几个字母。
 * - 默认覆盖率 ≥ 80%。保存语音允许部分匹配时（`allowPartial`）最低 35%，
 *   且要求至少 6 个连续匹配的规范化字母/汉字。
 * - 没匹配的 grapheme 返回 `{ start: null, end: null }`。
 * - 同一个识别词中的所有字共享该词的真实起止时间。
 * - 原文与识别序列长度乘积 > 4,000,000 直接返回 `null`（限制 DP 内存与计算量）。
 *
 * 返回 `null` 表示**整体不可用**（调用方不能拿它去建任何时间轴）。
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
    // 置信度低于 0.7 的词丢弃。**缺 confidence 时同样丢弃** ——
    // `undefined >= 0.7` 为 false，这是上游的行为，不是笔误：
    // Groq 没有逐词置信度，调用方要先补上（用下面的 withDefaultConfidence）。
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

  // 只保留**完整匹配**的供应商单词；匹配到另一个单词里的几个字母是不安全的。
  const totals = new Map<number, number>();
  const matched = new Map<number, number>();
  for (const h of heard) totals.set(h.token, (totals.get(h.token) || 0) + 1);
  for (const h of matches.values()) matched.set(h.token, (matched.get(h.token) || 0) + 1);
  for (const [index, h] of matches) {
    if (totals.get(h.token) !== matched.get(h.token)) matches.delete(index);
  }

  if (matches.size / n < 0.8) {
    // 保存下来的混合语言片段里可能有 STT 听不出来的拼写/读音。
    // 这里只保留**足够长的连续**已测量短语，不接受零散的巧合字母；没匹配的文字明确保持无时间。
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

/* ------------------------------------------------------------------ *
 * 输入适配：把不同服务商的原始返回变成算法要的形状
 * ------------------------------------------------------------------ */

/**
 * Groq 的词结果没有逐词置信度 —— 补 `confidence: 1`。
 *
 * **这只是输入适配，不能解释为服务商声称 100% 置信**；
 * 补完仍然要过完整词匹配与覆盖率门槛（上游文档 §3 明确写了这一点）。
 */
export const withDefaultConfidence = (
  words: Array<Omit<RecognizedWord, 'confidence'>>,
): RecognizedWord[] => words.map((w) => ({ ...w, confidence: 1 }));

/* ------------------------------------------------------------------ *
 * 4. 显示细分（不改跳播时间）
 * ------------------------------------------------------------------ */

/**
 * 在同一测量词内部细分**显示**时间，返回与 `timing` 等长的显示时间数组。
 *
 * **只在词级来源下生效**（deepgram / groq）：同一词内的多个字共享起止时间，
 * 显示上把它们摊开成递增时间才自然；字符级来源本来就逐字精确，原样返回。
 *
 * 关键：**只返回显示时间，不修改 `timing` 里的 `start`** ——
 * 点击词内任一字仍应跳到那个词的真实起点（原文 §3 的例子：好 → seek(2)，不是 2.4）。
 * 并且 **2.8 → 5 的真实停顿不会被摊平**。
 */
export function voiceRevealTimes(timing: Cue[], source: CaptionSource): Array<number | null> {
  const times: Array<number | null> = timing.map((t) => t.start);
  if (source !== 'deepgram-word-timestamps' && source !== 'groq-word-timestamps') return times;
  for (let i = 0; i < timing.length; ) {
    const item = timing[i];
    let end = i + 1;
    if (!isNum(item.start) || !isNum(item.end) || !(item.end > item.start)) {
      i++;
      continue;
    }
    while (
      end < timing.length &&
      timing[end].start === item.start &&
      timing[end].end === item.end
    ) {
      end++;
    }
    for (let k = i; k < end; k++) {
      times[k] = item.start + ((item.end - item.start) * (k - i)) / (end - i);
    }
    i = end;
  }
  return times;
}

/* ------------------------------------------------------------------ *
 * 5. MP3 定位兼容（WebKit）
 * ------------------------------------------------------------------ */

/**
 * 对**特定分段拼接 MP3** 的重复索引做本地兼容处理。
 *
 * 分段 MP3 被字节拼接后可能保留多个 `Info` / `Xing` / `VBRI` 索引；
 * Chromium 能跳到后段，WKWebView 却按首段时长解释整条语音。
 * 这里解析 MPEG Layer III 帧边界和合法索引位置，确认存在多个索引后，
 * 在**本地副本**里把相应四字节标记清零 —— 帧长度、字节偏移与语音帧保持不变。
 *
 * 单索引、无索引、损坏或截断数据**原样返回**；不做任意字节的全局查找替换。
 * 这只是对当前拼接方式的兼容处理，**不是通用 MP3 修复器**。非 MP3 不要走这条路。
 */
export function normalizeVoiceMp3Seek(bytes: Uint8Array): Uint8Array {
  const markers: number[] = [];
  let offset = 0;
  const tag = (at: number, text: string) =>
    at + text.length <= bytes.length && Array.from(text).every((c, i) => bytes[at + i] === c.charCodeAt(0));
  while (offset < bytes.length) {
    if (tag(offset, 'ID3') && offset + 10 <= bytes.length) {
      const size =
        ((bytes[offset + 6] & 127) << 21) |
        ((bytes[offset + 7] & 127) << 14) |
        ((bytes[offset + 8] & 127) << 7) |
        (bytes[offset + 9] & 127);
      offset += 10 + size + (bytes[offset + 5] & 16 ? 10 : 0);
      continue;
    }
    if (offset + 128 === bytes.length && tag(offset, 'TAG')) break;
    if (offset + 4 > bytes.length || bytes[offset] !== 255 || (bytes[offset + 1] & 224) !== 224) return bytes;
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const rateIndex = bytes[offset + 2] >> 4;
    const sampleIndex = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || rateIndex === 0 || rateIndex === 15 || sampleIndex === 3) return bytes;
    const rate =
      (version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[rateIndex] * 1000;
    const sampleRate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const length = Math.floor(((version === 3 ? 144 : 72) * rate) / sampleRate) + ((bytes[offset + 2] >> 1) & 1);
    if (offset + length > bytes.length) return bytes;
    const mono = (bytes[offset + 3] >> 6) === 3;
    const sideInfo = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
    const xing = offset + 4 + (bytes[offset + 1] & 1 ? 0 : 2) + sideInfo;
    if (xing + 4 <= offset + length && (tag(xing, 'Info') || tag(xing, 'Xing'))) markers.push(xing);
    const vbri = offset + 36;
    if (vbri + 4 <= offset + length && tag(vbri, 'VBRI')) markers.push(vbri);
    offset += length;
  }
  if (markers.length < 2) return bytes;
  // 用 `new Uint8Array(bytes)` 而不是 `bytes.slice()` 复制：
  // 浏览器里传的是真 Uint8Array（slice 会复制），但 Node 的 Buffer 继承自 Uint8Array
  // 且**覆盖了 slice 成 subarray 语义（共享内存）** —— 那样会把调用方的原始字节改掉。
  const normalized = new Uint8Array(bytes);
  for (const at of markers) normalized.fill(0, at, at + 4);
  return normalized;
}

/* ------------------------------------------------------------------ *
 * 6. 已读前缀计算（原文 §4 的 readCountAt）
 * ------------------------------------------------------------------ */

/**
 * 按播放时间算「已读前缀有多少个 grapheme」。
 *
 * - 时长无效 → 0。
 * - 播放到末尾 0.02s 内 → 全部已读（自然结束补齐末尾标点）。
 * - **没有任何测量时间** → 按播放比例估算（`estimated`，只用于显示）。
 * - 有测量时间 → 取最后一个 `revealTime <= time` 的 cue，返回它的下标 + 1。
 *
 * 注意这里用的是 **revealTimes**（显示时间）而不是 `cues[i].start`（跳播时间）。
 */
export function readCountAt(
  time: number,
  duration: number,
  cues: Cue[],
  revealTimes: Array<number | null>,
  total: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const t = Math.max(0, Math.min(duration, time));
  if (t >= duration - 0.02) return total;
  const measured = cues.some((c) => isNum(c.start));
  if (!measured) return Math.floor((t / duration) * total);
  let last = -1;
  if (t > 0) {
    cues.forEach((c, i) => {
      const r = revealTimes[i];
      if (isNum(c.start) && isNum(r) && r <= t + 1e-5) last = i;
    });
  }
  return last + 1;
}

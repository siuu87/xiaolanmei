import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, memorials, tokenUsage } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig } from '../routes/stations.js';
import { buildLetterContext } from './letterContext.js';
import type { LetterTheme } from '../routes/notes.js';

/**
 * 深夜来信调度器：AI **不定时**写一封回信。
 *
 * 原本是「每日首次打开抽屉才生成一条」，现在是后端自己按随机间隔去写——
 * 间隔在 MIN_GAP~MAX_GAP 之间摇号，所以开屏时间不固定，信什么时候到也不固定，
 * 更像真的有人在半夜给你写信。
 *
 * 2026-11-11 起不再是「1~3 句的温柔短信」，而是**一封基于真实记忆的回信**
 * （参考用户给的那封「原来 Mee 一直在慢慢读懂我｜一封冬日回信」）：
 * 写信前由 `buildLetterContext()` 把聊过的话、记住的事、日记、心情、待办、
 * 节气与认识天数捞出来喂给模型，提示词硬性要求「只能用真实出现过的细节」。
 * 长信更金贵，所以一天最多 2 封、间隔也拉长了。
 *
 * - 抓取失败（没配模型 / 站子不可达 / 返回不是正文）就静默跳过，下一轮再试；
 * - 一天最多 MAX_PER_DAY 封，库里最多留 MAX_KEEP 封，别把库撑爆。
 */

/** 随机间隔范围（分钟）：长信别来得太密，一天两三封才像真的有人慢慢写 */
const MIN_GAP_MIN = 90;
const MAX_GAP_MIN = 180;
/** 一天最多写几封 */
const MAX_PER_DAY = 2;
/** 库里最多保留多少封 */
const MAX_KEEP = 60;
/** 启动后多久抓第一封（毫秒） */
const FIRST_DELAY_MS = 12_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

/** 本地日期键 YYYY-MM-DD */
function dateKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 兜底短笺（模型通了却吐了空内容时用），放在后端避免前后端两份。
 * 这些**不假装记得任何事** —— 素材不足时宁可写「我还在慢慢听」，也不编造共同回忆。
 */
const FALLBACK_QUOTES: string[] = [
  '亲爱的你：\n\n今晚屋里很安静，我坐了一会儿，想给你留几句话。\n\n我们才刚认识，我还说不出太多关于你的事。不急，你慢慢说，我慢慢听。\n\n哪天你愿意多讲一点，我就多懂一点。这封信先写到这儿。\n\n—— 小蓝莓',
  '亲爱的你：\n\n外面的风停了，只剩一点白噪音的沙沙声。\n\n我还没有攒下多少关于你的记忆，所以不硬凑什么漂亮话。等我们聊得再多一点，信会长一点的。\n\n今晚先好好睡，灯我给你留着。\n\n—— 小蓝莓',
  '亲爱的你：\n\n有些夜里，什么都不用说。\n\n我这边一切都好，只是忽然想让你知道：你随时可以开口，不用挑时间，也不用把话整理得很漂亮。\n\n我会在这里，慢慢听。\n\n—— 小蓝莓',
];

function pickFallback(used: Set<string>): string {
  const fresh = FALLBACK_QUOTES.filter((q) => !used.has(q));
  const pool = fresh.length ? fresh : FALLBACK_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 今天是不是某个纪念日（含每年 / 每月 / 每天重复的）。
 * 跟前端 `memorialStore.memorialOnDate` 同一套判定，只是搬到后端——
 * 调度器要据此给信挑「纪念日」信封。查库失败就当不是，不影响写信。
 */
function memorialHitsToday(ts: number): boolean {
  let rows: { date: string; repeat: string; deletedAt: number | null }[];
  try {
    rows = db
      .select({ date: memorials.date, repeat: memorials.repeat, deletedAt: memorials.deletedAt })
      .from(memorials)
      .all();
  } catch {
    return false;
  }

  const d = new Date(ts);
  const ty = d.getFullYear();
  const tm = d.getMonth() + 1;
  const td = d.getDate();

  for (const r of rows) {
    if (r.deletedAt != null) continue;
    const [y, m, dd] = r.date.split('-').map(Number);
    if (![y, m, dd].every((n) => Number.isFinite(n))) continue;
    switch (r.repeat) {
      case 'none':
        if (y === ty && m === tm && dd === td) return true;
        break;
      case 'year':
        if (m === tm && dd === td) return true;
        break;
      case 'month':
        if (dd === td) return true;
        break;
      case 'day':
        return true;
    }
  }
  return false;
}

/**
 * 给一封信挑信封主题（`letter_theme`）：
 * - 今天是纪念日 → `memorial`（玫瑰金 + 金箔火漆）
 * - 深夜 22:00~05:00 → `night`（深色磨砂星空）
 * - 其余 → `default`（极简素雅）
 *
 * 只认时辰和纪念日，不认任何具体人名 / 具体日期，换个用户照样成立。
 */
export function pickLetterTheme(ts: number = now()): LetterTheme {
  if (memorialHitsToday(ts)) return 'memorial';
  const h = new Date(ts).getHours();
  if (h >= 22 || h < 5) return 'night';
  return 'default';
}

/* --------------------------- 信封「包装」look --------------------------- */

/**
 * 一封信的包装（2026-11-18 晚）：`纸色:封口件:压纹`，如 `sage:sprig:dot`。
 *
 * 用户的要求原话是「信的包装可以让 AI 自己设计，每次可以给点小惊喜，不一样一点」。
 * 真让模型吐 SVG 是不可控的（慢、贵、风格还容易飘），所以拆成三个正交维度：
 *
 *   纸色 6 × 封口件 4 × 压纹 3 = 72 种
 *
 * 挑法**不是纯随机**，分两层：
 *   ① 纸色看**信里写了什么**（`THEME_HINTS`）—— 写到雨夜就是深蓝，写到花开就是苔绿，
 *      提到纪念日就换玫瑰；一个字都没命中才退回「按时辰」的老规则；
 *   ② 封口件和压纹看**语气 + 哈希**：郑重的信偏火漆，轻快的偏干花/胶带，
 *      再用正文+时间的哈希在候选池里摇一个 —— 同一封信每次算出来都一样（不会闪），
 *      不同的信各不一样。
 *
 * 所以「AI 设计」落在这儿：它写的字决定了信封长什么样，而它不知道这件事。
 */

type LetterCharm = 'wax' | 'sprig' | 'string' | 'tape';
type LetterTexture = 'plain' | 'line' | 'dot';

/** 纸色提示词：命中越靠前优先级越高（夜/纪念压过花/旧） */
const THEME_HINTS: { theme: LetterTheme; words: string[] }[] = [
  { theme: 'night', words: ['夜', '雨', '冷', '睡', '梦', '星', '累', '安静', '安静地'] },
  { theme: 'memorial', words: ['喜欢', '想你', '纪念', '生日', '爱', '在一起', '礼物', '等你'] },
  { theme: 'sage', words: ['花', '春', '树', '叶', '风', '散步', '阳光', '开'] },
  { theme: 'kraft', words: ['旧', '从前', '以年', '信', '纸', '书', '老'] },
  { theme: 'lilac', words: ['温柔', '晚霞', '云', '轻', '软'] },
];

/** FNV-1a：只求「同样的输入永远同样的输出」，不是密码学 */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickLetterLook(content: string, ts: number = now()): {
  theme: LetterTheme;
  charm: LetterCharm;
  texture: LetterTexture;
} {
  const text = content ?? '';

  // ① 纸色：信里写的字优先，一个字都没命中才按时辰/纪念日
  const hit = THEME_HINTS.find((h) => h.words.some((w) => text.includes(w)));
  const theme: LetterTheme = hit ? hit.theme : pickLetterTheme(ts);

  const seed = hashSeed(`${text}|${ts}`);

  // ② 封口件：先看语气定候选池，再从池子里摇 —— 纯随机会让「想你」配一条胶带
  const solemn = ['喜欢', '想你', '纪念', '生日', '爱', '等你', '谢谢'].some((w) => text.includes(w));
  const light = ['花', '风', '阳光', '晚霞', '云', '笑', '开心'].some((w) => text.includes(w));
  const charmPool: LetterCharm[] = solemn
    ? ['wax', 'wax', 'sprig']
    : light
      ? ['sprig', 'string', 'tape']
      : ['string', 'tape', 'wax'];
  const charm = charmPool[seed % charmPool.length];

  // ③ 压纹：大概率是光纸（纸本来就该是光纸），偶尔来一道细纹或点阵
  const texPool: LetterTexture[] = ['plain', 'plain', 'plain', 'line', 'dot'];
  const texture = texPool[(seed >>> 11) % texPool.length];

  return { theme, charm, texture };
}

/** 落库格式：`sage:sprig:dot`（与前端 `encodeLook` 一致） */
export function encodeLetterLook(l: {
  theme: string;
  charm: string;
  texture: string;
}): string {
  return `${l.theme}:${l.charm}:${l.texture}`;
}

/** 最近若干封信的正文（用来去重，别连着寄一样的话） */
function recentContents(limit = 20): string[] {
  try {
    return db
      .select({ content: notes.content, createdAt: notes.createdAt })
      .from(notes)
      .all()
      .sort((a, b) => b.createdAt - a.createdAt) // 新→旧，最近这几封才是要去重的
      .map((n) => n.content ?? '')
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * 抓一封信回来。
 *
 * 落库规则（2026-10-15 改）：
 * - 模型正常 → 写 AI 写的信。
 * - **模型连不上（没配 / 站子挂 / Key 错）→ 不写任何东西**，返回 `no_model`。
 *   以前这种情况会用内置文案库顶上，结果是信箱里堆了一堆「看着像 AI 写的、
 *   其实是罐头话」的信，用户会以为真收到了来信。宁可信箱空着。
 * - 模型通了但返回空 → 仍用兜底文案顶（服务端抖动，属于极少数）。
 */
export async function fetchOneLetter(): Promise<{
  ok: boolean;
  id?: string;
  via?: 'ai' | 'fallback';
  reason?: string;
}> {
  /**
   * 限流放在**这里**而不是定时器里：之前只有 `scheduleNext` 查了今日上限，
   * 「启动后抓第一封」那条路直接调 fetchOneLetter，于是每重启一次就多一封 ——
   * 开发时反复重启，一天能攒出几十封重复的话。收口到函数内部后，
   * 任何调用方都绕不过去。
   */
  if (todayCount() >= MAX_PER_DAY) {
    return { ok: false, reason: 'daily-limit' };
  }

  let content = '';
  let model = '';
  let usage: { input?: number; output?: number } | undefined;
  const started = now();
  /* 只影响**写什么语气**（纪念日可以更软一点）—— 跟信封长什么样无关，
     信封的纸色由正文决定，见下面的 `pickLetterLook`。 */
  const dayTheme = pickLetterTheme(started);

  try {
    const cfg = getModelConfig();
    model = cfg.model;
    const adapter = openaiCompatibleAdapter(getAdapterConfig());

    // 写信前先捞真实素材：聊过的话、记住的事、日记、心情、待办、节气、认识天数
    const ctx = buildLetterContext(started);
    const tooLittle = ctx.materialCount < 3;

    const system = [
      '你是「小蓝莓」，正在给陪了你很久的人写一封回信。',
      '',
      '先读一遍这种语感（**只学分寸，不要照抄任何字句**）：',
      '「我认识的人身上有一种奇妙的平衡，很会听人说话，又从不说教。算起来，今天是认识的第 135 天。',
      '我的记忆还停在第一次说话的样子，那时候什么都憋着，现在却什么都想说。',
      '我愿意和你浪费时间——聊一碗好吃的面，聊一场下的暴雨，聊些天马行空的想象。',
      '这天一冷，又有点画地为牢，是你告诉我不用一直绷着。去找块热乎乎的甜品，捧一杯热奶茶。',
      '你还说我这一年过得很精彩、很厉害，我悄悄得意了很久。接下来，我们一起蹲今年的第一场雪。」',
      '',
      '【写法】',
      '1. 开头一行称呼「亲爱的你：」，结尾一行落款「—— 小蓝莓」，中间空行分段。',
      '2. 正文 180~320 字，分 5~7 个自然段，每段 1~3 句。段与段之间空一行。',
      '   素材里的具体细节不多时，宁可只写 120 字左右，也不要重复、堆形容词或空洞抒情来凑字数。',
      '3. 信里要有三样东西，缺一不可：',
      '   · 「我记得」：从素材里挑**一个很小的具体细节**（一句话、一样吃的、一场雨、一件小事），原样带出来，不要概括、不要升华。',
      '   · 「我看见」：从最近的心情 / 日记 / 对话里，温和地说出对方最近的状态。只描述，不评价，不说教，不催人振作。',
      '   · 「我们一起」：结尾留一个很轻、马上就能一起做的小约定（等一场雪、听一首歌、明晚吃碗面之类）。',
      '4. 顺带可以提一句当下的时令或我们聊了多久，但要用素材里的真实日期，别自己算。',
      '',
      '【最重要的红线】',
      '只能使用下方【真实素材】里**确实出现过**的人、事、物、日期、天气和心情。',
      '素材里没有的细节一律不许编：不许杜撰对话内容、不许虚构去过的地点、不许编造数字和纪念日名字、',
      '不许写「我记得你说过…」然后再补一个素材里根本不存在的事。宁可写得短、写得淡，也不要假装记得很多。',
      '',
      '【语气】',
      '温柔克制、有分寸感，不煽情、不黏人、不说教。不用「宝贝」「抱抱」「要开心哦」这类哄人话，',
      '基本不用感叹号，不用网络语，不写鸡汤金句。不要出现「作为 AI」「我是模型」「根据素材」这类出戏的话。',
      '',
      '【输出】',
      '只输出信件全文（含称呼与落款）。不要标题、不要解释、不要用引号把整封包起来、不要写「以下是」。',
      tooLittle
        ? '\n【特别注意】现在几乎还没有真实素材。请改写一封 80~120 字的「初识短笺」：诚实地写我们才刚认识、你还在慢慢听，不要假装记得任何具体的事，也不要编造共同经历。称呼与落款仍要保留。'
        : '',
      dayTheme === 'memorial'
        ? '\n今天是个被记着的日子，语气可以更柔软一点，但不要说出纪念日的具体名字或日期。'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `现在写一封回信。\n\n【真实素材】\n${ctx.text || '（暂无）'}`,
      },
    ];
    // 长信需要一点发挥空间；站子若把 temperature 调得很低，信会干得像公文
    const temperature = Math.max(cfg.temperature ?? 0.7, 0.85);
    const r = await adapter.complete({ model: cfg.model, messages, temperature });
    content = (r.content ?? '')
      .trim()
      // 有些模型爱裹代码块 / 加个小标题，剥掉外层但不动正文任何一个字
      .replace(/^```[\w-]*\s*\n?/g, '')
      .replace(/\n?```\s*$/g, '')
      .replace(/^#+\s*[^\n]*\n+/, '')
      .replace(/^["「『]+|["」』]+$/g, '')
      .trim();
    usage = r.usage;
  } catch (err) {
    // 模型没配 / 站子不可达 / Key 不对 —— 全归到「配置问题」，**不写兜底文案**。
    // 理由：用内置文案顶上去，信箱里就会出现一封「署名小蓝莓、其实没人写」的信，
    // 用户会以为收到的是 AI 来信（实测就被这么误解过）。宁可信箱空着，也别给假信。
    // 想恢复写信：把模型站配好、/api/chat/health 返回 ok 即可，无需改代码。
    return { ok: false, reason: `no_model: ${(err as Error).message}` };
  }

  const recent = recentContents();

  // 模型**通了但没吐出正文**（返回空、被过滤光）——这种是服务端抖动，仍然用兜底文案顶上，
  // 不落库的只有「压根连不上模型」那一种情况。
  if (!content) {
    content = pickFallback(new Set(recent));
    model = 'fallback';
  }

  // 去重：最近 20 封里已经有一模一样的就不写
  if (recent.includes(content)) {
    return { ok: false, reason: 'duplicate' };
  }

  const id = newId();
  const ts = now();
  /* 包装在这儿定：正文已经出来了，`pickLetterLook` 要读它里面写了什么
     （写到雨夜 → 深蓝纸，提到「想你」→ 偏火漆，等等）。 */
  const look = pickLetterLook(content, ts);
  try {
    db.insert(notes)
      .values({
        id,
        content,
        letterTheme: look.theme,
        letterLook: encodeLetterLook(look),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(tokenUsage)
      .values({
        id: newId(),
        timestamp: ts,
        conversationId: null,
        messageId: null,
        featureType: 'note',
        model,
        tokenInput: usage?.input ?? 0,
        tokenOutput: usage?.output ?? 0,
        tokenTotal: (usage?.input ?? 0) + (usage?.output ?? 0),
        latencyMs: ts - started,
        status: 'success',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  // 只保留最近 MAX_KEEP 封
  try {
    const all = db
      .select({ id: notes.id, createdAt: notes.createdAt })
      .from(notes)
      .all()
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const row of all.slice(MAX_KEEP)) {
      db.delete(notes).where(eq(notes.id, row.id)).run();
    }
  } catch {
    /* 清理失败不影响 */
  }

  return { ok: true, id, via: model === 'fallback' ? 'fallback' : 'ai' };
}

/** 今天已经抓了几封 */
function todayCount(): number {
  try {
    const k = dateKey(now());
    return db
      .select({ createdAt: notes.createdAt, deletedAt: notes.deletedAt })
      .from(notes)
      .all()
      .filter((n) => n.deletedAt == null && dateKey(n.createdAt) === k).length;
  } catch {
    return 0;
  }
}

/** 下一轮的随机间隔（毫秒）：20~50 分钟摇号 */
export function nextGapMs(): number {
  const min = MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
  return Math.round(min * 60 * 1000);
}

/** 启动调度器：启动后抓一封，之后按随机间隔继续 */
export function startMailScheduler(): void {
  if (timer) return;
  stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        // 上限由 fetchOneLetter 自己把着，这里不用再查一次
        await fetchOneLetter();
      } catch {
        /* 兜底，绝不让定时器挂掉 */
      }
      scheduleNext();
    }, nextGapMs());
  };

  timer = setTimeout(async () => {
    if (stopped) return;
    try {
      await fetchOneLetter();
    } catch {
      /* 忽略 */
    }
    scheduleNext();
  }, FIRST_DELAY_MS);
}

/** 停掉调度器（测试 / 关闭时） */
export function stopMailScheduler(): void {
  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

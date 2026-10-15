import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, tokenUsage } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { openaiCompatibleAdapter } from '../adapters/openaiCompatible.js';
import type { ChatMessage } from '../adapters/types.js';
import { getModelConfig, getAdapterConfig } from '../routes/stations.js';

/**
 * 深夜来信调度器：AI **不定时**抓取一封信。
 *
 * 原本是「每日首次打开抽屉才生成一条」，现在是后端自己按随机间隔去抓——
 * 间隔在 MIN_GAP~MAX_GAP 之间摇号，所以开屏时间不固定，信什么时候到也不固定，
 * 更像真的有人在半夜给你写信。
 *
 * - 抓取失败（没配模型 / 站子不可达 / 返回不是正文）就静默跳过，下一轮再试；
 * - 一天最多 MAX_PER_DAY 封，库里最多留 MAX_KEEP 封，别把库撑爆。
 */

/** 随机间隔范围（分钟） */
const MIN_GAP_MIN = 20;
const MAX_GAP_MIN = 50;
/** 一天最多抓几封 */
const MAX_PER_DAY = 6;
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

/** 兜底文案库（AI 抓不到时用），放在后端避免前后端两份 */
const FALLBACK_QUOTES: string[] = [
  '今晚的月亮很圆，我坐在窗边，忽然就想给你写点什么。',
  '外面的风停了，屋里还剩一点白噪音的沙沙声。愿你今晚好梦。',
  '今天说了好多话，最想说的那句还是留给你。',
  '深夜适合说真心话：有你在，日子才叫日子。',
  '给你留了最后一盏灯，回来时别摸黑。',
];

function pickFallback(used: Set<string>): string {
  const fresh = FALLBACK_QUOTES.filter((q) => !used.has(q));
  const pool = fresh.length ? fresh : FALLBACK_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
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

  try {
    const cfg = getModelConfig();
    model = cfg.model;
    const adapter = openaiCompatibleAdapter(getAdapterConfig());
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是「小蓝莓」，在深夜给一对情侣写信。写一封 1~3 句、温柔克制、有陪伴感的中文短信，' +
          '可以提到当下的天气、月亮、雨声、白噪音之类的环境细节。只输出信件正文，不要称呼、不要署名、不要引号、不要解释。',
      },
      { role: 'user', content: '现在写一封深夜来信。' },
    ];
    const r = await adapter.complete({ model: cfg.model, messages, temperature: cfg.temperature });
    content = (r.content ?? '').trim().replace(/^["「『]+|["」』]+$/g, '');
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
  try {
    db.insert(notes).values({ id, content, createdAt: ts, updatedAt: ts }).run();
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

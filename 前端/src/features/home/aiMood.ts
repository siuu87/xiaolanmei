/**
 * AI 的心情：系统自己抓，不用人手填
 *
 * 规则就一条 —— **一天之内，挑一个不固定的时刻抓一次**。
 * 抓什么：主角 AI 最近说过的话（主聊天 + 小手机里的会话），用关键词判断它是偏高兴、偏难过还是没什么波澜。
 *
 * 三条自律：
 * 1. 一天只抓一次，抓完当天不再动（存 `done`），绝不每小时刷一遍让心情来回跳。
 * 2. 「不定时」是真的随机：进入新的一天时，在当天 9:00–23:00 之间随机抽一个时刻，到点才抓。
 * 3. **完全没素材就不写**（比如今天一句话都没说过），宁可空着也不编一个心情出来。
 */
import { listConversations, listMessages } from '@/lib/api/conversations';
import { useMoodStore, todayKey, type MoodKey } from './moodStore';

const CAPTURE_KEY = 'blueberry.mood.aicapture.v1';

interface CapturePlan {
  date: string;
  /** 计划抓取的时刻（时间戳） */
  at: number;
  done: boolean;
}

function readPlan(): CapturePlan | null {
  try {
    const raw = localStorage.getItem(CAPTURE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<CapturePlan>;
    if (!d || typeof d.date !== 'string' || !Number.isFinite(d.at)) return null;
    return { date: d.date, at: Number(d.at), done: !!d.done };
  } catch {
    return null;
  }
}

function writePlan(p: CapturePlan) {
  try {
    localStorage.setItem(CAPTURE_KEY, JSON.stringify(p));
  } catch {
    /* 隐私模式 / 配额不足 */
  }
}

/** 当天的抓取计划；换了一天就重新抽一个时刻 */
export function planForToday(): CapturePlan {
  const k = todayKey();
  const cur = readPlan();
  if (cur && cur.date === k) return cur;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const start = new Date(y, m, d, 9, 0, 0, 0).getTime();
  const end = new Date(y, m, d, 23, 0, 0, 0).getTime();
  const at = Math.floor(start + Math.random() * Math.max(1, end - start));
  const plan: CapturePlan = { date: k, at, done: false };
  writePlan(plan);
  return plan;
}

/* ------------------------------ 素材与判断 ------------------------------ */

const HAPPY_WORDS = [
  '开心', '高兴', '喜欢', '真好', '太好', '哈哈', '嘿嘿', '笑', '愉快', '幸福',
  '爱你', '真棒', '不错', '甜的', '成功', '漂亮', '期待', '惊喜', '温暖', '陪你',
];
const SAD_WORDS = [
  '难过', '伤心', '难受', '失落', '委屈', '哭', '孤独', '心疼', '疼', '痛',
  '抱歉', '对不起', '遗憾', '担心', '害怕', '想你', '舍不得', '好累', '疲惫', '别走',
];

/** 按关键词粗判情绪；两边都撞上或都没撞上 → 平静（中性基线） */
export function detectMood(text: string): MoodKey {
  let happy = 0;
  let sad = 0;
  for (const w of HAPPY_WORDS) if (text.includes(w)) happy += 1;
  for (const w of SAD_WORDS) if (text.includes(w)) sad += 1;
  if (happy > sad) return 'happy';
  if (sad > happy) return 'sad';
  return 'calm';
}

/** 收集主角 AI 最近说过的话：主聊天（后端）+ 小手机会话（本地） */
async function collectAiText(): Promise<string> {
  const parts: string[] = [];

  // 1) 主聊天：最近 2 段对话，各取最近的消息
  try {
    const convs = (await listConversations()).slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2);
    for (const c of convs) {
      const msgs = await listMessages(c.id);
      parts.push(
        ...msgs
          .filter((m) => m.role === 'assistant' && m.content)
          .slice(-15)
          .map((m) => m.content),
      );
    }
  } catch {
    /* 后端读不到就只靠小手机 */
  }

  // 2) 小手机里的会话（主角 AI 的戏份主要在这儿）
  try {
    const raw = localStorage.getItem('tavern.phone.v1');
    const data = raw ? (JSON.parse(raw) as { sessions?: { messages?: { role?: string; content?: string }[] }[] }) : null;
    for (const s of data?.sessions ?? []) {
      parts.push(
        ...(s.messages ?? [])
          .filter((m) => m.role === 'assistant' && m.content)
          .slice(-15)
          .map((m) => m.content ?? ''),
      );
    }
  } catch {
    /* 忽略 */
  }

  return parts.join('\n').slice(-6000);
}

/** 到点了就抓一次；没到点 / 今天抓过 / 没素材 都不动 */
export async function maybeCaptureAiMood(opts: { force?: boolean } = {}): Promise<MoodKey | null> {
  const plan = planForToday();
  if (plan.done) return null;
  if (!opts.force && Date.now() < plan.at) return null;

  const text = await collectAiText();
  if (!text.trim()) return null; // 今天没说过话 → 不编

  const mood = detectMood(text);
  const store = useMoodStore.getState();
  if (!store.loaded) store.load();
  store.setMood(todayKey(), 'ai', mood);
  writePlan({ ...plan, done: true });
  return mood;
}

/** 挂一次就在后台守着：启动先看一眼，之后每 15 分钟检查是否到点 */
export function startAiMoodScheduler(): () => void {
  const check = () => {
    void maybeCaptureAiMood();
  };
  const boot = window.setTimeout(check, 8_000);
  const timer = window.setInterval(check, 15 * 60_000);
  return () => {
    window.clearTimeout(boot);
    window.clearInterval(timer);
  };
}

/**
 * 片单 · 自动检索
 *
 * 上一版是「点开界面 → 选一段对话 → 手动扫一遍 → 逐条确认 → 加入」，五步全靠人。
 * 现在改成后台自己跑：每隔一段时间去看一眼聊天里有没有新提到的片名，有就直接加进片单。
 * 人要做的只是偶尔来片单页把不想要的删掉——删掉的会记进忽略名单，不会再被加回来。
 *
 * 两条自保规则（不然自动加就是自动制造垃圾）：
 *   1. 只扫「上次扫过之后」的新消息，靠时间戳水位线，不重复扫同一批；
 *   2. 模型不可用时降级到本地规则，但只认带书名号的《xxx》，不做整句猜测。
 */
import { useEffect, useState } from 'react';
import { listConversations, listMessages, type MessageDTO } from '@/lib/api/conversations';
import { streamChat } from '@/lib/api/chatStream';
import { useWatchListStore, CLASSIFY_RULE, normalizeCategory, normalizeStatus } from './watchListStore';
import type { WatchCategory, WatchStatus } from './watchListStore';

const SETTINGS_KEY = 'blueberry.watchlist.autoscan.v1';
/** 忽略名单：被自动加过 / 被人删掉的片名，避免反复加回来 */
const KNOWN_KEY = 'blueberry.watchlist.known.v1';

export const INTERVAL_OPTIONS = [15, 30, 60, 120] as const;

export interface AutoScanSettings {
  enabled: boolean;
  intervalMin: number;
  /** 消息水位线：只扫 createdAt 大于它的消息 */
  cursor: number;
  lastRunAt: number;
}

export interface ScanOutcome {
  ranAt: number;
  added: number;
  titles: string[];
  usedAi: boolean;
  scanned: number;
  note: string;
}

interface Draft {
  title: string;
  category: WatchCategory;
  status: WatchStatus;
  note: string;
}

const DEFAULTS: AutoScanSettings = { enabled: true, intervalMin: 30, cursor: 0, lastRunAt: 0 };

/** 首次运行时最多回看多少条（避免一上来把整段历史全倒进片单） */
const FIRST_RUN_MSGS = 30;
/** 之后每次每个对话最多看多少条 */
const PER_CONV_MSGS = 60;
/** 一次喂给模型的文本上限（字符） */
const MAX_TEXT = 12000;
/** 最多同时看几个对话（按最近更新排） */
const MAX_CONV = 3;

export const AI_EXTRACT_SYSTEM =
  `你是片单整理助手。归类规则：${CLASSIFY_RULE}\n` +
  `下面是一段聊天记录。请从中挑出**明确提到过**的影视 / 动漫 / 演出作品名称，只输出 JSON，不要任何其它文字：\n` +
  `{"items":[{"title":"名称","category":"movie|anime|show","status":"planned|watched","note":"一句话备注，可为空字符串"}]}\n` +
  `status 判断：说「想看 / 准备看 / 打算看 / 约好一起看 / 还没看」用 planned；\n` +
  `说「看了 / 看完了 / 已看 / 刷完了 / 补完了 / 太好看了」用 watched。\n` +
  `只挑真的点名了的，不要脑补，也不要把聊天里出现的人名地名当作品。没提到就返回 {"items":[]}。`;

/* ------------------------------- 存储读写 ------------------------------- */

function loadSettings(): AutoScanSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const d = JSON.parse(raw) as Partial<AutoScanSettings>;
    return {
      enabled: typeof d.enabled === 'boolean' ? d.enabled : DEFAULTS.enabled,
      intervalMin: INTERVAL_OPTIONS.includes(d.intervalMin as never)
        ? Number(d.intervalMin)
        : DEFAULTS.intervalMin,
      cursor: Number.isFinite(d.cursor) ? Number(d.cursor) : 0,
      lastRunAt: Number.isFinite(d.lastRunAt) ? Number(d.lastRunAt) : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(next: AutoScanSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式 / 配额不足：内存里照样生效 */
  }
}

export function saveSettings(patch: Partial<AutoScanSettings>): AutoScanSettings {
  const next = { ...loadSettings(), ...patch };
  writeSettings(next);
  emit();
  return next;
}

/** 标题归一：去掉标点空格再比，避免《千与千寻》和 千与千寻 被当成两个 */
const NOISE_RE = /[\s《》〈〉【】「」『』"'"'`,，。.、!！?？:：;；~～\-—_()（）[\]]/g;
function normTitle(t: string): string {
  return t.replace(NOISE_RE, '').toLowerCase();
}

function loadKnown(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]');
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveKnown(list: string[]) {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(list.slice(-500)));
  } catch {
    /* ignore */
  }
}

/** 手动删掉某条时调用：让它在自动检索里永久失效（除非手工再加） */
export function rememberDeleted(title: string) {
  const k = normTitle(title);
  if (!k) return;
  const list = loadKnown();
  if (!list.includes(k)) saveKnown([...list, k]);
}

/* ------------------------------- 抽取规则 ------------------------------- */

/**
 * 本地兜底。strict=true（自动检索用）只认带书名号的《xxx》——
 * 自动加条目容不得整句猜测，宁可漏也别把「我今天看了个电影」塞进片单。
 */
function localExtract(text: string, strict = false): Draft[] {
  const out: Draft[] = [];
  const seen = new Set<string>();
  const push = (title: string, ctx: string) => {
    const t = title.trim();
    if (t.length < 2 || t.length > 30 || seen.has(t)) return;
    seen.add(t);
    out.push({ title: t, category: normalizeCategory(ctx), status: normalizeStatus(ctx), note: '' });
  };

  // 书名号优先：《xxx》」「xxx」。按逗号也切一刀——
  // 「看了《千与千寻》，汉密尔顿还没看」这种一句话俩状态，不切会把前者也判成没看
  for (const sentence of text.split(/[。！？\n；;！!?？,，]+/)) {
    for (const m of sentence.matchAll(/[《【「]([^》】」]{1,24})[》】」]/g)) push(m[1], sentence);
  }

  if (strict) return out.slice(0, 12);

  // 非严格（手工触发）才做整句猜测
  for (const sentence of text.split(/[。！？\n；;！!?？,，]+/)) {
    const s = sentence.trim();
    if (!s || s.length > 40) continue;
    if (!/看|番|剧|电影|动画|演唱会|音乐剧|舞台剧|上映|追|刷/.test(s)) continue;
    if (s.includes('《')) continue;
    // 片名只留核心词：剥掉句首「我想看 / 我们看了」和句尾「还没看 / 了 / 的」。
    // 状态仍按原句判断，剥词只影响标题。
    const core = s
      .replace(/^(周末|昨天|今天|刚才|对了|另外|还有|然后|顺便|下次|改天|要不|我们|我|想看|准备看|打算看|看了|看完|看|想|说|把|去|一起)+/g, '')
      .replace(/(还没看|没看过|没看|看了|看完|看过了|看过|想看|准备看|打算看|了|的|吧|呢|啊|呀|哦|嘛|好不好|怎么样|非常|特别|真的|确实|超|巨|挺)+$/g, '')
      .trim();
    if (core.length >= 2 && core.length <= 20) push(core, s);
  }
  return out.slice(0, 12);
}

function parseJson(text: string): Draft[] {
  try {
    const cleaned = text.replace(/```(?:json)?/gi, '').trim();
    const i = cleaned.indexOf('{');
    const j = cleaned.lastIndexOf('}');
    const body = i >= 0 && j > i ? cleaned.slice(i, j + 1) : cleaned;
    const d = JSON.parse(body) as { items?: unknown[] };
    const raw = Array.isArray(d?.items) ? d.items : [];
    return raw
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        const title = String(o.title ?? '').trim();
        if (!title) return null;
        return {
          title,
          category: normalizeCategory(o.category),
          status: normalizeStatus(o.status),
          note: String(o.note ?? '').trim(),
        } satisfies Draft;
      })
      .filter((x): x is Draft => !!x);
  } catch {
    return [];
  }
}

/* -------------------------------- 运行 -------------------------------- */

let running = false;
let last: ScanOutcome | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

export function subscribeAutoScan(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const isScanning = () => running;
export const getLastOutcome = () => last;

/** 跑一次自动检索。force=true 时忽略「是否启用」（给「立即检索一次」用） */
export async function runAutoScan(opts: { force?: boolean } = {}): Promise<ScanOutcome> {
  const s = loadSettings();
  const finish = (o: ScanOutcome) => {
    last = o;
    emit();
    return o;
  };

  if (running) {
    return finish({ ranAt: Date.now(), added: 0, titles: [], usedAi: false, scanned: 0, note: '上一次还没跑完' });
  }
  if (!s.enabled && !opts.force) {
    return finish({ ranAt: Date.now(), added: 0, titles: [], usedAi: false, scanned: 0, note: '自动检索已关闭' });
  }

  running = true;
  emit();
  try {
    const convs = (await listConversations())
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONV);

    if (convs.length === 0) {
      return finish({ ranAt: Date.now(), added: 0, titles: [], usedAi: false, scanned: 0, note: '还没有任何对话记录' });
    }

    const chunks: string[] = [];
    let scanned = 0;
    let maxTs = s.cursor;
    const firstRun = s.cursor === 0;

    for (const c of convs) {
      let msgs: MessageDTO[];
      try {
        msgs = await listMessages(c.id);
      } catch {
        continue;
      }
      const fresh = msgs
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && !!m.content && m.createdAt > s.cursor)
        .sort((a, b) => a.createdAt - b.createdAt);
      if (fresh.length === 0) continue;
      const take = firstRun ? fresh.slice(-FIRST_RUN_MSGS) : fresh.slice(-PER_CONV_MSGS);
      for (const m of take) {
        chunks.push(`${m.role === 'user' ? '我' : 'AI'}：${m.content}`);
        if (m.createdAt > maxTs) maxTs = m.createdAt;
      }
      scanned += take.length;
    }

    if (chunks.length === 0) {
      saveSettings({ lastRunAt: Date.now(), cursor: maxTs || Date.now() });
      return finish({ ranAt: Date.now(), added: 0, titles: [], usedAi: false, scanned: 0, note: '没有新消息' });
    }

    const text = chunks.join('\n').slice(-MAX_TEXT);

    let acc = '';
    try {
      await streamChat(
        [
          { role: 'system', content: AI_EXTRACT_SYSTEM },
          { role: 'user', content: `聊天记录：\n${text}` },
        ],
        { onDelta: (t) => (acc += t), onError: () => undefined },
      );
    } catch {
      /* 模型不可用 → 落到本地规则 */
    }

    let drafts = parseJson(acc);
    const usedAi = drafts.length > 0;
    if (!usedAi) drafts = localExtract(text, true);

    const items = useWatchListStore.getState().items;
    const known = new Set(loadKnown().map(normTitle));
    const seen = new Set(items.map((i) => normTitle(i.title)));
    const added: string[] = [];

    for (const d of drafts) {
      const t = d.title.trim();
      const k = normTitle(t);
      if (t.length < 2 || t.length > 30) continue;
      if (seen.has(k) || known.has(k)) continue;
      seen.add(k);
      useWatchListStore.getState().add({
        title: t,
        category: d.category,
        status: d.status,
        note: d.note,
        source: 'ai',
      });
      added.push(t);
    }

    if (added.length > 0) saveKnown([...loadKnown(), ...added.map(normTitle)]);
    saveSettings({ lastRunAt: Date.now(), cursor: maxTs || Date.now() });

    return finish({
      ranAt: Date.now(),
      added: added.length,
      titles: added,
      usedAi,
      scanned,
      note: added.length === 0 ? '没发现新片名' : '',
    });
  } catch (e) {
    return finish({
      ranAt: Date.now(),
      added: 0,
      titles: [],
      usedAi: false,
      scanned: 0,
      note: (e as Error).message || '检索失败',
    });
  } finally {
    running = false;
    emit();
  }
}

/**
 * 挂一次就在后台一直跑：每分钟检查一次是否到期，到期就跑一轮。
 * 不用 setInterval(整周期) 是因为改间隔后旧定时器不会自动变，统一由这里按最新设置判断。
 */
export function startAutoScanScheduler(): () => void {
  const check = () => {
    const s = loadSettings();
    if (!s.enabled) return;
    if (Date.now() - s.lastRunAt < s.intervalMin * 60_000) return;
    void runAutoScan();
  };
  // 启动 15 秒后先看一眼，别和首屏抢资源
  const boot = window.setTimeout(check, 15_000);
  const timer = window.setInterval(check, 60_000);
  return () => {
    window.clearTimeout(boot);
    window.clearInterval(timer);
  };
}

/** 给界面用：设置 + 运行状态 + 手动触发 */
export function useAutoScan() {
  const [settings, setSettings] = useState<AutoScanSettings>(loadSettings);
  const [running2, setRunning] = useState(isScanning);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(getLastOutcome);

  useEffect(
    () =>
      subscribeAutoScan(() => {
        setSettings(loadSettings());
        setRunning(isScanning());
        setOutcome(getLastOutcome());
      }),
    [],
  );

  return {
    settings,
    running: running2,
    last: outcome,
    setEnabled: (v: boolean) => saveSettings({ enabled: v }),
    setIntervalMin: (v: number) => saveSettings({ intervalMin: v }),
    runNow: () => void runAutoScan({ force: true }),
  };
}

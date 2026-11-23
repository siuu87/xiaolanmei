/**
 * 全适配导入器（2026-11-23 用户要求：别挑格式，什么 JSON 都能吃）。
 *
 * 处理顺序：
 * 1. 本项目 `blueberry.backup` → 走原来的 entries 导入；
 * 2. 长得像 localStorage 导出（key → 字符串值）→ 直接按 key 写回；
 * 3. 任意结构 JSON → 递归找记忆/卡片/会话内容：
 *    - 记忆文本写进后端 `/api/memories`（「他的资料 → 最近印象」能看见）；
 *    - 同步写进小手机 `tavern.support.memory.v1`，供上下文注入使用；
 *    - cards / contacts / sessions / moments 合并进 `tavern.phone.v1`；
 * 4. 全都不认（或根本不是 JSON）→ 原文留到 `tavern.support.import.raw.v1`，不报“格式不对”。
 */
import { importAll, type ImportMode, type ImportResult } from './storageCore';
import { createMemory, listMemories, type MemoryCategory } from '@/lib/api/memories';

const RAW_KEY = 'tavern.support.import.raw.v1';
const MEMORY_KEY = 'tavern.support.memory.v1';
const PHONE_KEY = 'tavern.phone.v1';
const MAX_RECORDS = 300;

const TEXT_KEYS = [
  'content',
  'text',
  'summary',
  'description',
  'memory',
  'note',
  'body',
  'result',
  'relation',
  'cause',
  'process',
  'remark',
  'detail',
] as const;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeCategory(v: unknown): MemoryCategory {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('anchor') || s.includes('锚点')) return 'anchor';
  if (s.includes('relation') || s.includes('关系')) return 'relation';
  if (s.includes('event') || s.includes('事件')) return 'event';
  return 'fact';
}

/** 从一条对象里尽量榨出可读文本；多种字段都有就拼起来，别丢内容 */
function pickText(o: Obj): string {
  const parts: string[] = [];
  for (const k of TEXT_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
    else if (Array.isArray(v)) {
      const joined = v.filter((x): x is string => typeof x === 'string' && !!x.trim()).join(' ');
      if (joined) parts.push(joined);
    }
  }
  return [...new Set(parts)].join('\n').slice(0, 4000);
}

function tsOf(o: Obj): number {
  for (const k of ['createdAt', 'updatedAt', 'timestamp', 'ts', 'created', 'date']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Date.parse(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return Date.now();
}

/** 递归找“像记忆”的对象；只认真正带文本字段的，不把姓名/标题壳子当记忆 */
function collectRecords(node: unknown, out: Obj[], depth = 0): void {
  if (depth > 8 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectRecords(item, out, depth + 1);
    return;
  }
  const o = node as Obj;
  if (pickText(o)) out.push(o);
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') collectRecords(v, out, depth + 1);
  }
}

function uid(prefix: string, seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `${prefix}-imp-${Math.abs(h).toString(36)}-${seed.length.toString(36)}`;
}

/** 像不像「localStorage 整包导出」：key → 字符串值，且 key 是本项目的命名空间 */
function looksLikeEntries(o: Obj): boolean {
  const keys = Object.keys(o);
  if (!keys.length) return false;
  if (!keys.some((k) => k.startsWith('tavern.') || k.startsWith('blueberry.'))) return false;
  return keys.every((k) => typeof o[k] === 'string');
}

/** 把识别出来的记忆也写进小手机记忆库，让上下文注入能吃到 */
function mergeLocalMemory(records: Obj[]): number {
  let store: { shorts: unknown[]; volumes: Obj[]; splits: unknown[]; cfg: Obj };
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Obj) : {};
    store = {
      shorts: Array.isArray(parsed.shorts) ? (parsed.shorts as unknown[]) : [],
      volumes: Array.isArray(parsed.volumes) ? (parsed.volumes as Obj[]) : [],
      splits: Array.isArray(parsed.splits) ? (parsed.splits as unknown[]) : [],
      cfg: isObj(parsed.cfg) ? parsed.cfg : {},
    };
  } catch {
    store = { shorts: [], volumes: [], splits: [], cfg: {} };
  }

  const seen = new Set(store.volumes.map((v) => str(v.name)));
  let added = 0;
  for (const [i, r] of records.entries()) {
    const text = pickText(r);
    if (!text) continue;
    const name = str(r.title) || str(r.name) || `导入记忆 ${i + 1}`;
    if (seen.has(name)) continue;
    const ts = tsOf(r);
    store.volumes.push({
      id: uid('vol', `${name}\n${text}`),
      sessionId: str(r.sessionId) || str(r.session_id) || str(r.chatId) || 'imported',
      mode: str(r.mode) === 'online' ? 'online' : 'offline',
      name,
      summary: text,
      shortIds: [],
      createdAt: ts,
      updatedAt: ts,
    });
    seen.add(name);
    added += 1;
  }
  if (added) {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(store));
    } catch {
      return 0;
    }
  }
  return added;
}

/** cards / contacts / sessions / moments 合并进现有小手机聚合 blob */
function mergePhoneBlob(parsed: unknown): number {
  if (!isObj(parsed)) return 0;
  let node: Obj = parsed;
  if (isObj(parsed.data)) node = { ...node, ...(parsed.data as Obj) };
  if (isObj(parsed.tavern)) node = { ...node, ...(parsed.tavern as Obj) };

  const fields = ['cards', 'contacts', 'sessions', 'moments'] as const;
  const incoming: Obj = {};
  for (const f of fields) {
    const v = node[f];
    if (Array.isArray(v)) incoming[f] = v;
  }
  if (!Object.keys(incoming).length) return 0;

  let cur: Obj = {};
  try {
    const raw = localStorage.getItem(PHONE_KEY);
    if (raw) cur = (JSON.parse(raw) as Obj) ?? {};
  } catch {
    cur = {};
  }

  let added = 0;
  for (const [f, arr] of Object.entries(incoming)) {
    const base = Array.isArray(cur[f]) ? (cur[f] as unknown[]) : [];
    const map = new Map<string, unknown>();
    for (const item of base) {
      const key = isObj(item) ? str(item.id) || JSON.stringify(item) : JSON.stringify(item);
      map.set(key, item);
    }
    for (const item of arr as unknown[]) {
      const key = isObj(item) ? str(item.id) || JSON.stringify(item) : JSON.stringify(item);
      if (!map.has(key)) {
        map.set(key, item);
        added += 1;
      }
    }
    cur[f] = [...map.values()];
  }
  try {
    localStorage.setItem(PHONE_KEY, JSON.stringify(cur));
    return added;
  } catch {
    return 0;
  }
}

/** 后端记忆：写进「最近印象 / 内心面板」；按正文去重，重复导入不会产生双份 */
async function importBackendMemories(records: Obj[]): Promise<{ applied: number; skipped: number }> {
  let existing = new Set<string>();
  try {
    existing = new Set((await listMemories({ sort: 'time' })).map((m) => m.content.trim()));
  } catch {
    // 后端暂时不通也别阻断本地导入
  }

  let applied = 0;
  let skipped = 0;
  for (const r of records.slice(0, MAX_RECORDS)) {
    const content = pickText(r);
    if (!content || existing.has(content)) {
      skipped += 1;
      continue;
    }
    const rawImportance = Number(r.importance ?? r.importanceScore ?? r.weight ?? 0);
    try {
      await createMemory({
        category: normalizeCategory(r.category ?? r.memoryType ?? r.type ?? r.kind),
        content,
        importance: Number.isFinite(rawImportance) ? Math.min(10, Math.max(0, rawImportance)) : 0,
        relatedEntity: str(r.relatedEntity) || str(r.person) || null,
      });
      existing.add(content);
      applied += 1;
    } catch {
      skipped += 1;
    }
  }
  if (records.length > MAX_RECORDS) skipped += records.length - MAX_RECORDS;
  return { applied, skipped };
}

/** 原文兜底：哪怕一个字段都没认出来，也把文件留在账本里，可查、可清 */
function saveRaw(text: string): boolean {
  if (text.length > 2_000_000) return false;
  try {
    if (localStorage.getItem(RAW_KEY) === text) return false;
    localStorage.setItem(RAW_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 入口：任何 JSON 都尽量导入，永远不因为“格式不对”直接失败。
 */
export async function smartImport(text: string, mode: ImportMode = 'merge'): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const kept = saveRaw(text);
    return {
      ok: true,
      applied: kept ? 1 : 0,
      skipped: kept ? 0 : 1,
      note: kept ? '不是合法 JSON，已按原文留存' : '文件太大，无法原文留存',
    };
  }

  if (isObj(parsed) && parsed.format === 'blueberry.backup' && parsed.entries) {
    return importAll(text, mode);
  }

  let applied = 0;
  let skipped = 0;
  const notes: string[] = [];

  // 形态 2：localStorage 键值整包
  if (isObj(parsed) && looksLikeEntries(parsed)) {
    const wrapped = JSON.stringify({
      format: 'blueberry.backup',
      version: 1,
      exportedAt: Date.now(),
      source: 'tavern-phone',
      entries: parsed,
    });
    const r = importAll(wrapped, mode);
    applied += r.applied;
    skipped += r.skipped;
    if (r.applied) notes.push(`本地存储 ${r.applied} 项`);
  }

  // 形态 3：小手机数据 blob
  const phoneAdded = mergePhoneBlob(parsed);
  if (phoneAdded) {
    applied += phoneAdded;
    notes.push(`小手机数据 ${phoneAdded} 项`);
  }

  // 形态 4：任意结构里的记忆文本
  const records: Obj[] = [];
  collectRecords(parsed, records);
  if (records.length) {
    const localAdded = mergeLocalMemory(records);
    const back = await importBackendMemories(records);
    applied += localAdded + back.applied;
    skipped += back.skipped;
    if (localAdded || back.applied) notes.push(`记忆 ${localAdded + back.applied} 条`);
  }

  // 不管识别成没识别，都留一份原文；这样永远有后悔药
  if (saveRaw(text)) notes.push('原文已留存');

  if (!notes.length) {
    notes.push('未识别到可拆分内容，原文已留存');
    applied += 1;
  }

  return { ok: true, applied, skipped, note: notes.join(' · ') };
}

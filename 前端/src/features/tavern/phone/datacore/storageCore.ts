/**
 * 数据中枢 · 存储操作
 *
 * 提供：占用统计 / 按模块清除 / 自动快照 / 全量导出导入。
 * 全部纯 localStorage，不新增后端依赖。
 */
import { KEY_REGISTRY, bucketContains, type DataBucket } from './registry';

/* ------------------------------ 基础度量 ------------------------------ */

/** UTF-8 字节数（localStorage 计入的是 UTF-16 码元，但配额按 UTF-8 估更贴近真实） */
export function bytesOf(s: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  // 兜底：非浏览器环境下估算
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* ------------------------------ 统计模型 ------------------------------ */

export interface KeyUsage {
  key: string;
  label: string;
  bucket: DataBucket;
  bytes: number;
}

export interface BucketUsage {
  bucket: DataBucket;
  bytes: number;
  keys: KeyUsage[];
}

export interface UsageReport {
  total: number;
  buckets: BucketUsage[];
  keys: KeyUsage[];
  /** 目标 quota 参考值（浏览器通常 5MB，这里按 5MB 估进度条） */
  quotaHint: number;
}

const SNAPSHOT_KEY = 'tavern.support.snapshot.v1';
const QUOTA_HINT = 5 * 1024 * 1024;

/** 读取某个 key 的字节数与解析后的数据 */
function readKey(key: string): { bytes: number; data: unknown } | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    let data: unknown = undefined;
    try {
      data = JSON.parse(raw);
    } catch {
      data = undefined; // 非 JSON 的原始字符串，仍要计入体积
    }
    return { bytes: bytesOf(raw), data };
  } catch {
    return null;
  }
}

export function scanUsage(): UsageReport {
  const keys: KeyUsage[] = [];
  for (const e of KEY_REGISTRY) {
    const r = readKey(e.key);
    if (!r || r.bytes === 0) continue;
    if (!e.sub) {
      keys.push({ key: e.key, label: e.label, bucket: e.bucket, bytes: r.bytes });
      continue;
    }
    // 聚合 blob：按子字段拆账，让占比能落到具体模块上
    const parts = splitAggregate(r.bytes, r.data, e.sub);
    for (const p of parts) {
      if (p.bytes <= 0) continue;
      keys.push({ key: e.key, label: `${e.label} · ${p.field}`, bucket: p.bucket, bytes: p.bytes });
    }
  }

  const total = keys.reduce((n, k) => n + k.bytes, 0);
  const bucketMap = new Map<DataBucket, BucketUsage>();
  for (const k of keys) {
    const b = bucketMap.get(k.bucket) ?? { bucket: k.bucket, bytes: 0, keys: [] };
    b.bytes += k.bytes;
    b.keys.push(k);
    bucketMap.set(k.bucket, b);
  }
  // 保证所有已定义 bucket 都出现在结果里（即使为 0），界面表格行才稳定
  for (const e of KEY_REGISTRY) {
    if (!bucketMap.has(e.bucket)) bucketMap.set(e.bucket, { bucket: e.bucket, bytes: 0, keys: [] });
  }
  return {
    total,
    buckets: [...bucketMap.values()].sort((a, b) => b.bytes - a.bytes),
    keys: keys.sort((a, b) => b.bytes - a.bytes),
    quotaHint: QUOTA_HINT,
  };
}

/** 把聚合 blob 的体积按子字段比例摊分 */
function splitAggregate(
  totalBytes: number,
  data: unknown,
  sub: Record<string, DataBucket>,
): { field: string; bucket: DataBucket; bytes: number }[] {
  const fields = Object.keys(sub).filter((f) => {
    const v = (data as Record<string, unknown>)?.[f];
    return v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
  });
  if (fields.length === 0) return [{ field: '整体', bucket: sub[Object.keys(sub)[0]], bytes: totalBytes }];
  const weights = fields.map((f) => {
    const v = (data as Record<string, unknown>)[f];
    return Math.max(1, bytesOf(typeof v === 'string' ? v : JSON.stringify(v) ?? ''));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return fields.map((f, i) => ({
    field: f,
    bucket: sub[f],
    bytes: Math.round((weights[i] / sum) * totalBytes),
  }));
}

/* ------------------------------ 按模块清除 ------------------------------ */

export interface ClearResult {
  clearedKeys: string[];
  trimmedSub: { key: string; fields: string[] }[];
  freedBytes: number;
}

/**
 * 清空某个模块。聚合 blob 只摘掉属于该 bucket 的子字段，其余子字段原样保留。
 * 例：清「聊天记录」会删掉 sessions，但 cards / contacts / moments 不动。
 */
export function clearBucket(bucket: DataBucket): ClearResult {
  const before = scanUsage().total;
  const res: ClearResult = { clearedKeys: [], trimmedSub: [], freedBytes: 0 };

  for (const e of KEY_REGISTRY) {
    if (!e.removable) continue;
    const r = readKey(e.key);
    if (!r) continue;

    if (!e.sub) {
      if (e.bucket !== bucket) continue;
      localStorage.removeItem(e.key);
      res.clearedKeys.push(e.key);
      continue;
    }
    // 聚合 blob：定位属于该 bucket 的子字段
    const fields = Object.entries(e.sub)
      .filter(([, b]) => b === bucket)
      .map(([f]) => f)
      .filter((f) => {
        const v = (r.data as Record<string, unknown>)?.[f];
        return v !== undefined && v !== null;
      });
    if (fields.length === 0) continue;

    const next = { ...(r.data as Record<string, unknown>) };
    for (const f of fields) {
      const v = next[f];
      // 保留容器类型，避免消费方读到 undefined 崩溃
      next[f] = Array.isArray(v) ? [] : v === null ? null : undefined;
      if (next[f] === undefined) delete next[f];
    }
    localStorage.setItem(e.key, JSON.stringify(next));
    res.trimmedSub.push({ key: e.key, fields });
  }

  res.freedBytes = Math.max(0, before - scanUsage().total);
  return res;
}

/* ------------------------------ 快照备份 ------------------------------ */

export interface Snapshot {
  id: string;
  label: string;
  createdAt: number;
  bytes: number;
  /** key → 原始字符串 */
  payload: Record<string, string>;
}

const MAX_SNAPSHOTS = 5;

function readSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Snapshot[]) : [];
  } catch {
    return [];
  }
}

function writeSnapshots(list: Snapshot[]) {
  // 只保留最近 MAX_SNAPSHOTS 份，超出自动淘汰最旧的（自动快照的语义）
  const kept = list.slice(-MAX_SNAPSHOTS);
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(kept));
  } catch {
    // 配额不足：丢掉最旧的一份再试
    if (kept.length > 1) {
      try {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(kept.slice(1)));
      } catch {
        /* 仍失败则放弃，不阻断主流程 */
      }
    }
  }
}

export function listSnapshots(): Omit<Snapshot, 'payload'>[] {
  return readSnapshots()
    .map(({ payload, ...meta }) => ({ ...meta, bytes: bytesOf(JSON.stringify(payload)) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 创建一份当前全量快照；返回 null 表示失败（无数据或写入受限） */
export function createSnapshot(label?: string): Omit<Snapshot, 'payload'> | null {
  const payload: Record<string, string> = {};
  for (const e of KEY_REGISTRY) {
    const raw = localStorage.getItem(e.key);
    if (raw !== null && raw !== '') payload[e.key] = raw;
  }
  if (Object.keys(payload).length === 0) return null;

  const snap: Snapshot = {
    id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: label?.trim() || defaultSnapshotLabel(),
    createdAt: Date.now(),
    bytes: bytesOf(JSON.stringify(payload)),
    payload,
  };
  writeSnapshots([...readSnapshots(), snap]);
  const { payload: _p, ...meta } = snap;
  return meta;
}

function defaultSnapshotLabel(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 恢复快照：先把当前状态存成一份「恢复前回滚点」，再覆盖 */
export function restoreSnapshot(id: string): { rolledBackTo: string | null; restoredKeys: number } {
  const list = readSnapshots();
  const snap = list.find((s) => s.id === id);
  if (!snap) return { rolledBackTo: null, restoredKeys: 0 };

  const rollback = createSnapshot(`恢复前自动备份 · ${snap.label}`);
  let n = 0;
  for (const [k, v] of Object.entries(snap.payload)) {
    try {
      localStorage.setItem(k, v);
      n += 1;
    } catch {
      /* 单项失败不阻断其余项 */
    }
  }
  return { rolledBackTo: rollback?.id ?? null, restoredKeys: n };
}

export function deleteSnapshot(id: string): void {
  writeSnapshots(readSnapshots().filter((s) => s.id !== id));
}

/* ------------------------------ 导出 / 导入 ------------------------------ */

export interface BackupFile {
  format: 'blueberry.backup';
  version: 1;
  exportedAt: number;
  source: 'tavern-phone';
  entries: Record<string, string>;
}

export function exportAll(): BackupFile {
  const entries: Record<string, string> = {};
  for (const e of KEY_REGISTRY) {
    const raw = localStorage.getItem(e.key);
    if (raw !== null) entries[e.key] = raw;
  }
  return { format: 'blueberry.backup', version: 1, exportedAt: Date.now(), source: 'tavern-phone', entries };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  ok: boolean;
  applied: number;
  skipped: number;
  error?: string;
  /** 替换模式下自动生成的回滚点 */
  rolledBackTo?: string | null;
}

/**
 * 导入备份文件。
 * - merge：同名 key 用文件里的覆盖，其余保留（推荐）
 * - replace：先清空账本内所有 key 再写入（会自动留存一份回滚快照）
 */
export function importAll(text: string, mode: ImportMode = 'merge'): ImportResult {
  let file: BackupFile;
  try {
    const parsed = JSON.parse(text) as Partial<BackupFile>;
    if (parsed?.format !== 'blueberry.backup' || !parsed.entries) {
      return { ok: false, applied: 0, skipped: 0, error: '不是本项目导出的备份文件（缺少 blueberry.backup 标记）' };
    }
    file = parsed as BackupFile;
  } catch {
    return { ok: false, applied: 0, skipped: 0, error: 'JSON 解析失败，文件可能已损坏' };
  }

  let rolledBackTo: string | null = null;
  if (mode === 'replace') rolledBackTo = createSnapshot('导入前自动备份')?.id ?? null;

  const known = new Set(KEY_REGISTRY.map((e) => e.key));
  let applied = 0;
  let skipped = 0;
  for (const [k, v] of Object.entries(file.entries)) {
    if (!known.has(k)) {
      skipped += 1;
      continue; // 不认识的一律跳过，避免把外人写的脏数据塞进来
    }
    if (mode === 'replace' && v === '') {
      localStorage.removeItem(k);
      continue;
    }
    try {
      localStorage.setItem(k, v);
      applied += 1;
    } catch {
      skipped += 1;
    }
  }
  return { ok: true, applied, skipped, rolledBackTo };
}

export function downloadBackup(): string {
  const file = exportAll();
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  a.href = url;
  a.download = `小蓝莓备份-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return a.download;
}

/** 是否某个 key 当前有数据（供 UI 显示灰态） */
export function keyCountOf(bucket: DataBucket): number {
  return scanUsage().keys.filter((k) => k.bucket === bucket).length;
}

/** 导出前几天？——给 UI 用：判断某个 bucket 是否真的含数据 */
export function bucketHasData(bucket: DataBucket): boolean {
  for (const e of KEY_REGISTRY) {
    const r = readKey(e.key);
    if (!r || r.bytes === 0) continue;
    if (!e.sub) {
      if (e.bucket === bucket) return true;
      continue;
    }
    if (bucketContains(r.data, bucket, e.sub)) return true;
  }
  return false;
}

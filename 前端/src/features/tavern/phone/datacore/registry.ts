/**
 * 数据中枢 · 账本
 *
 * 把全站 localStorage 登记成一张分类账本，让「存储管理」能回答三个问题：
 *   1. 现在用了多少？
 *   2. 每个模块各占多少？
 *   3. 能不能安全地单独清掉某一类？
 *
 * 设计要点：
 * - 只登记**已知**的 key，不扫描未知 key，避免把浏览器扩展/第三方脚本的数据算进来。
 * - `tavern.phone.v1` 是一个聚合 blob（cards/contacts/sessions/moments 同住一个 key），
 *   所以额外用 `sub` 描述它的内部结构，支持「只清聊天记录、保留角色卡」这种粒度。
 * - 危险等级：`critical` 表示清掉后必须重新走初始化流程（如后端口令、模型配置），
 *   界面上要二次确认；`safe` 表示只是内容，可放心删。
 */

/** 模块分类（对齐用户在需求里点名的几类） */
export type DataBucket =
  | 'cards' // 角色卡 / 人设卡 / 模拟器卡
  | 'chat' // 会话与聊天记录
  | 'moments' // 朋友圈
  | 'memory' // 记忆区（滚动/短期/长期）
  | 'library' // 书库：成书、批注、书签
  | 'media' // 片单 / 书架 / 音乐等旁路内容
  | 'settings' // 偏好、主题、口径配置
  | 'system'; // 兜底：未识别但在白名单内的系统项

export const BUCKET_META: { key: DataBucket; label: string; desc: string; danger: 'safe' | 'critical' }[] = [
  { key: 'cards', label: '角色卡', desc: '角色卡、人设卡、模拟器卡、User 面具', danger: 'safe' },
  { key: 'chat', label: '聊天记录', desc: '单聊 / 群聊会话与消息', danger: 'safe' },
  { key: 'moments', label: '朋友圈', desc: '动态、点赞、评论', danger: 'safe' },
  { key: 'memory', label: '记忆库', desc: '滚动上下文、短期摘要、长期分卷', danger: 'safe' },
  { key: 'library', label: '书库', desc: '成书、目录、书签、批注', danger: 'safe' },
  { key: 'media', label: '旁路内容', desc: '片单、书架、摘录等独立模块', danger: 'safe' },
  { key: 'settings', label: '偏好设置', desc: '主题、字体、自定义 CSS、开关', danger: 'safe' },
  { key: 'system', label: '系统项', desc: '未完成状态、最近搜索等零散键值', danger: 'safe' },
];

/** 一条已登记的键。sub 存在时表示这是聚合 blob，按子字段再拆一层。 */
export interface KeyEntry {
  key: string;
  bucket: DataBucket;
  label: string;
  /** 聚合 key 的子字段 → 归属 bucket（用于统计与选择性清除） */
  sub?: Record<string, DataBucket>;
  /** 是否允许被“清干净” */
  removable?: boolean;
}

export const KEY_REGISTRY: KeyEntry[] = [
  // —— 酒馆小手机：聚合 blob ——
  {
    key: 'tavern.phone.v1',
    bucket: 'chat',
    label: '小手机数据',
    sub: { cards: 'cards', contacts: 'cards', sessions: 'chat', moments: 'moments', activePersonaId: 'settings' },
    removable: true,
  },
  { key: 'tavern.activePersona', bucket: 'cards', label: '当前人设', removable: true },

  // —— 记忆 / 书库 / 旁路内容 ——
  { key: 'blueberry.bookhouse.books.v2', bucket: 'library', label: '书架书目', removable: true },
  { key: 'blueberry.reading.goal', bucket: 'library', label: '阅读目标', removable: true },
  { key: 'blueberry.watchlist.v1', bucket: 'media', label: '片单', removable: true },
  { key: 'blueberry.watchlist.pref', bucket: 'settings', label: '片单频道偏好', removable: true },

  // —— 首页 / 聊天零散项 ——
  { key: 'home.mood.v1', bucket: 'settings', label: '心情记录', removable: true },
  { key: 'blueberry.calendar.collapsed', bucket: 'system', label: '日历折叠状态', removable: true },
  { key: 'blueberry.search.recent', bucket: 'system', label: '最近搜索', removable: true },
];

/** 规格里后续会落地的模块（提前登记，避免将来统计漏项） */
export const PLANNED_KEYS: { key: string; bucket: DataBucket; label: string }[] = [
  { key: 'tavern.support.memory.v1', bucket: 'memory', label: '三层记忆库' },
  { key: 'tavern.support.library.v1', bucket: 'library', label: '成书与批注' },
  { key: 'tavern.support.masks.v1', bucket: 'cards', label: 'User 面具' },
  { key: 'tavern.support.theme.v1', bucket: 'settings', label: '主题与自定义样式' },
  { key: 'tavern.support.snapshot.v1', bucket: 'system', label: '自动快照' },
];

KEY_REGISTRY.push(...PLANNED_KEYS.map((p) => ({ ...p, removable: true })));

/** 按 key 查账本条目 */
export function entryOf(key: string): KeyEntry | undefined {
  return KEY_REGISTRY.find((e) => e.key === key);
}

/**
 * 判断某个 key 是否属于该 bucket。
 * 聚合 key 需要进一步看子字段是否存在非空数据。
 */
export function bucketContains(rawData: unknown, bucket: DataBucket, sub?: Record<string, DataBucket>): boolean {
  if (!sub) return true;
  if (!rawData || typeof rawData !== 'object') return true;
  return Object.entries(sub).some(([field, b]) => {
    if (b !== bucket) return false;
    const v = (rawData as Record<string, unknown>)[field];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
}

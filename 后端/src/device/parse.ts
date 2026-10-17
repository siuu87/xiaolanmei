/**
 * LoverConnect 返回值解析（**纯函数，零 IO**）。
 *
 * 单独成文件的理由跟 `emotion/rules.ts` 一样：解析规则是这块最容易写错、
 * 也最需要单测的部分，不能为了跑一条用例就把数据库连接带进来。
 *
 * 所有格式都对着 `app/.../McpService.kt` 里的实际字符串拼接写的：
 * `tools/call` 返回的是**给人看的中文纯文本**（不是 JSON），只有
 * `get_device_context` / `get_recent_context_events` 回 JSON。
 * 改这里的正则前，先去核对那几段 Kotlin，别凭印象改。
 */

export interface BatteryInfo {
  percent: number | null;
  charging: boolean | null;
  temperature: number | null;
}

export interface WeatherInfo {
  city: string;
  desc: string;
  temp: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windKmh: number | null;
  min: number | null;
  max: number | null;
}

export interface AnniversaryInfo {
  name: string;
  kind: 'countdown' | 'countup';
  days: number;
}

export interface ScreenTimeInfo {
  totalMinutes: number | null;
  topApps: { name: string; minutes: number }[];
}

export interface ContextRow {
  key: string;
  label: string;
  value: string;
}

export interface ContextInfo {
  enabled: boolean | null;
  status: string | null;
  generatedAt: number | null;
  observations: ContextRow[];
  inferences: string[];
  unknown: string[];
}

export const SNAPSHOT_PARTS = [
  'battery',
  'steps',
  'anniversary',
  'context',
  'weather',
  'screenTime',
  'events',
] as const;

export type SnapshotPart = (typeof SNAPSHOT_PARTS)[number];

export interface SnapshotError {
  part: SnapshotPart;
  message: string;
}

export interface DeviceSnapshot {
  configured: boolean;
  reached: boolean;
  fetchedAt: number;
  parts: SnapshotPart[];
  battery: BatteryInfo | null;
  steps: number | null;
  weather: WeatherInfo | null;
  anniversaries: AnniversaryInfo[];
  screenTime: ScreenTimeInfo | null;
  context: ContextInfo | null;
  events: ContextRow[];
  errors: SnapshotError[];
  /** 只在不通时给一句人话，通了就是 null */
  hint: string | null;
}

// ==================== 地址 ====================

/**
 * 校验并规范化 LC 的 MCP 地址。
 * 不接受：非 http(s)、非回环主机、路径不像 `/mcp/<token>`。
 * 唯一的宽松处理是补 `http://` 前缀 —— 用户手打时很容易漏协议。
 */
export function normalizeMcpUrl(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) throw new Error('请粘贴 App 首页显示的完整 MCP 地址');
  const withProto = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;

  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new Error('地址格式不对，形如 http://127.0.0.1:5000/mcp/<令牌>');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http/https 地址');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(host)) {
    throw new Error(
      '只接受回环地址（127.0.0.1）。LoverConnect 只监听手机本机，' +
        '把令牌写到其他主机等于把它交出去；跨设备请用 USB + adb reverse 转发。',
    );
  }
  // 末尾多一个 `/` 是手抄地址时最常见的手滑，先收掉再判形状
  const path = url.pathname.replace(/\/+$/, '');
  if (!/^\/mcp\/[^/]+$/.test(path)) {
    throw new Error('路径应形如 /mcp/<令牌>，请从 App 首页复制完整地址');
  }
  // 用 host + path 拼回去，别用 url.toString()：后者会把 `?`/`#` 的痕迹留成 `/?`
  return `${url.protocol}//${url.host}${path}`;
}

/** 脱敏：只留主机端口和令牌位数，够用户认出是哪一条，又不会把令牌泄给前端/日志 */
export function maskUrl(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const url = new URL(withProto);
    const token = url.pathname.replace(/^\/mcp\//, '');
    const dots = '•'.repeat(Math.max(Math.min(token.length, 8), 4));
    return `${url.protocol}//${url.host}/mcp/${dots}（${token.length} 位令牌）`;
  } catch {
    return '（无法解析的地址）';
  }
}

/** 把 fetch 的底层错误翻成用户能照做的说法 */
export function describeConnectError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err);
  if (/401|Unauthorized/i.test(msg)) {
    return '令牌不对（401）。请回到 App 首页重新复制完整地址，覆盖安装后令牌可能已变。';
  }
  if (/403|origin/i.test(msg)) {
    return '服务端拒绝了请求（403）。它不接受带浏览器 Origin 的调用，只应由后端发起。';
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH/i.test(msg)) {
    return '连不上手机。确认 LC 的 MCP 服务已启动，并在 USB 上执行过 adb reverse tcp:5000 tcp:5000。';
  }
  if (/超时|timeout|aborted/i.test(msg)) {
    return '手机没有在超时内回应。可能是后台被系统冻结了，回到 App 前台点一次「启动服务」再试。';
  }
  return msg;
}

// ==================== 文本解析 ====================

function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** `电量：78%\n状态：充电中\n温度：31.2°C`（取不到时 LC 会回 -1） */
export function parseBattery(text: string): BatteryInfo | null {
  const t = (text ?? '').trim();
  if (!t || /失败/.test(t)) return null;
  const pct = t.match(/电量[：:]\s*(-?\d+)\s*%/);
  const status = t.match(/状态[：:]\s*(\S+)/);
  const temp = t.match(/温度[：:]\s*(-?\d+(?:\.\d+)?)\s*°C/);
  const percent = pct ? toNumber(pct[1]) : null;
  return {
    percent: percent != null && percent >= 0 ? percent : null,
    // 注意先判「未充电」：`/充电/` 也会命中「未充电」
    charging: status ? /充电/.test(status[1]) && !/未充电/.test(status[1]) : null,
    temperature: temp ? toNumber(temp[1]) : null,
  };
}

/** `今日步数：1234步` */
export function parseSteps(text: string): number | null {
  const m = (text ?? '').match(/今日步数[：:]\s*(\d+)\s*步/);
  return m ? toNumber(m[1]) : null;
}

/** 六行：`<城市>天气` / 当前 / 体感 / 湿度 / 风速 / 今日区间 */
export function parseWeather(text: string): WeatherInfo | null {
  const t = (text ?? '').trim();
  if (!t || /未设置城市|失败/.test(t)) return null;

  const cityM = t.match(/^(.+?)天气/);
  const cur = t.match(/当前[：:]\s*(.+?)\s+(-?\d+(?:\.\d+)?)\s*°C/);
  const feel = t.match(/体感[：:]\s*(-?\d+(?:\.\d+)?)\s*°C/);
  const hum = t.match(/湿度[：:]\s*(-?\d+(?:\.\d+)?)\s*%/);
  const wind = t.match(/风速[：:]\s*(-?\d+(?:\.\d+)?)\s*km\/h/i);
  const range = t.match(/今日[：:]\s*(-?\d+(?:\.\d+)?)\s*°C\s*~\s*(-?\d+(?:\.\d+)?)\s*°C/);

  if (!cityM && !cur) return null;
  return {
    city: cityM ? cityM[1].trim() : '',
    desc: cur ? cur[1].trim() : '',
    temp: cur ? toNumber(cur[2]) : null,
    feelsLike: feel ? toNumber(feel[1]) : null,
    humidity: hum ? toNumber(hum[1]) : null,
    windKmh: wind ? toNumber(wind[1]) : null,
    min: range ? toNumber(range[1]) : null,
    max: range ? toNumber(range[2]) : null,
  };
}

/** `纪念日\n---\n恋爱：第128天\n生日：还有3天` */
export function parseAnniversary(text: string): AnniversaryInfo[] {
  const t = (text ?? '').trim();
  if (!t || /暂无纪念日|解析失败/.test(t)) return [];
  const out: AnniversaryInfo[] = [];
  for (const line of t.split(/\r?\n/)) {
    const row = line.trim();
    if (!row || row === '纪念日' || /^-{3,}$/.test(row)) continue;
    const countup = row.match(/^(.+?)[：:]\s*第\s*(\d+)\s*天$/);
    if (countup) {
      out.push({ name: countup[1].trim(), kind: 'countup', days: Number(countup[2]) });
      continue;
    }
    const countdown = row.match(/^(.+?)[：:]\s*还有\s*(\d+)\s*天$/);
    if (countdown) {
      out.push({ name: countdown[1].trim(), kind: 'countdown', days: Number(countdown[2]) });
    }
  }
  return out;
}

/** `屏幕使用时间报告\n总计：1小时23分钟\n---\n微信：40分钟` */
export function parseScreenTime(text: string): ScreenTimeInfo | null {
  const t = (text ?? '').trim();
  if (!t || /无数据|失败/.test(t)) return null;

  let totalMinutes: number | null = null;
  const total = t.match(/总计[：:]\s*(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分钟)?/);
  if (total && (total[1] || total[2])) {
    totalMinutes = (toNumber(total[1]) ?? 0) * 60 + (toNumber(total[2]) ?? 0);
  }

  const topApps: { name: string; minutes: number }[] = [];
  let seenSep = false;
  for (const line of t.split(/\r?\n/)) {
    const row = line.trim();
    if (/^-{3,}$/.test(row)) {
      seenSep = true;
      continue;
    }
    if (!seenSep) continue;
    const m = row.match(/^(.+?)[：:]\s*(\d+)\s*分钟$/);
    if (m) topApps.push({ name: m[1].trim(), minutes: Number(m[2]) });
  }
  return { totalMinutes, topApps };
}

// ==================== JSON 解析 ====================

/** 观测字段的中文名；没命中就退回原始路径，宁可显示英文也不吞数据 */
const OBS_LABELS: Record<string, string> = {
  screen_live: '屏幕',
  'screen_live.is_interactive': '屏幕亮着',
  'screen_live.unlocked_since_ms': '解锁时间戳',
  battery_live: '电量',
  'battery_live.level_pct': '电量',
  'battery_live.charging': '充电中',
  'battery_live.temperature_c': '电池温度',
  steps_today: '今日步数',
  'steps_today.count': '步数',
  foreground_app: '前台应用',
  'foreground_app.label': '应用',
  'foreground_app.since_ms': '开始时间戳',
  now_playing: '正在播放',
  'now_playing.title': '曲目',
  'now_playing.artist': '歌手',
  location_safety: '安全围栏',
  'location_safety.state': '状态',
  'location_safety.zone_label': '区域',
};

const MAX_ROWS = 14;

function formatLeaf(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '是' : '否';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** 把嵌套对象拍平成「一行一条事实」，最多 MAX_ROWS 行；数组只保留前 3 项 */
function flatten(obj: unknown, prefix: string, depth: number, out: ContextRow[]): void {
  if (out.length >= MAX_ROWS || depth > 3 || obj == null) return;
  if (Array.isArray(obj)) {
    obj.slice(0, 3).forEach((v, i) => {
      const path = `${prefix}[${i + 1}]`;
      if (v != null && typeof v === 'object') flatten(v, path, depth + 1, out);
      else out.push({ key: path, label: OBS_LABELS[prefix] ?? prefix, value: formatLeaf(v) });
    });
    return;
  }
  if (typeof obj !== 'object') {
    out.push({ key: prefix, label: OBS_LABELS[prefix] ?? prefix, value: formatLeaf(obj) });
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object') flatten(v, path, depth + 1, out);
    else out.push({ key: path, label: OBS_LABELS[path] ?? path, value: formatLeaf(v) });
    if (out.length >= MAX_ROWS) return;
  }
}

function readStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x == null) return '';
      if (typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const text = o.text ?? o.label ?? o.description ?? o.reason ?? o.summary;
        return typeof text === 'string' ? text : JSON.stringify(o);
      }
      return String(x);
    })
    .filter((s) => s.length > 0)
    .slice(0, 8);
}

/** `get_device_context` 返回缩进 JSON（DeviceContextSnapshot.build） */
export function parseDeviceContext(text: string): ContextInfo | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  let json: any;
  try {
    json = JSON.parse(t);
  } catch {
    return null;
  }
  if (json == null || typeof json !== 'object' || Array.isArray(json)) return null;

  const rows: ContextRow[] = [];
  flatten(json.observations, '', 0, rows);

  return {
    enabled: typeof json.enabled === 'boolean' ? json.enabled : null,
    status: typeof json.status === 'string' ? json.status : null,
    generatedAt: typeof json.generated_at_ms === 'number' ? json.generated_at_ms : null,
    observations: rows,
    inferences: readStringList(json.inferences),
    unknown: readStringList(json.unknown),
  };
}

/** `get_recent_context_events` 返回 JSON（数组或 `{events:[]}` 两种都要吃） */
export function parseContextEvents(text: string): ContextRow[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  let json: any;
  try {
    json = JSON.parse(t);
  } catch {
    return [];
  }
  const list: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.events)
      ? json.events
      : Array.isArray(json?.items)
        ? json.items
        : [];
  const out: ContextRow[] = [];
  for (const item of list.slice(0, 10)) {
    if (item == null || typeof item !== 'object') {
      out.push({ key: '', label: '事件', value: formatLeaf(item) });
      continue;
    }
    const o = item as Record<string, unknown>;
    const kind = typeof o.type === 'string' ? o.type : typeof o.event === 'string' ? o.event : '事件';
    const at = o.at_ms ?? o.occurred_at_ms ?? o.timestamp_ms ?? o.at;
    const atText = typeof at === 'number' ? new Date(at).toLocaleString('zh-CN') : '';
    const rest = Object.entries(o)
      .filter(([k]) => !['type', 'event', 'at_ms', 'occurred_at_ms', 'timestamp_ms', 'at'].includes(k))
      .slice(0, 2)
      .map(([k, v]) => `${k}=${formatLeaf(v)}`)
      .join(' ');
    out.push({
      key: typeof o.type === 'string' ? o.type : '',
      label: kind,
      value: [atText, rest].filter(Boolean).join(' · ') || '—',
    });
  }
  return out;
}

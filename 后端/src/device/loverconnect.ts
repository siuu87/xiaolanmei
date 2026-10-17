import { getSettingValue, setSetting } from '../routes/settings.js';
import { callTool, getServerInfo, listTools, type McpServerConfig } from '../mcp/client.js';
import { now } from '../utils/id.js';
import {
  describeConnectError,
  normalizeMcpUrl,
  parseAnniversary,
  parseBattery,
  parseContextEvents,
  parseDeviceContext,
  parseScreenTime,
  parseSteps,
  parseWeather,
  type DeviceSnapshot,
  type SnapshotError,
  type SnapshotPart,
} from './parse.js';

/**
 * 手机感知：接入 LoverConnect（AZHi-xinxin/LoverConnect-Enhanced）。
 *
 * LC 是手机端的 Android MCP 服务，只监听 `127.0.0.1:5000/mcp/<每次安装独有的随机令牌>`，
 * **明确拒绝局域网设备与带浏览器 Origin 的请求**（见该项目 DEVICE-CONTEXT.md）。
 * 所以后端（PC）唯一可用的通路是 USB 上的 `adb reverse tcp:5000 tcp:5000`：
 * 把 PC 的 127.0.0.1:5000 转到手机的 127.0.0.1:5000。
 * 服务端到服务端的 fetch 不带 Origin，能过它那道 Origin 检查。
 *
 * 两条不要放宽的约束：
 *   1. **地址必须是回环**（`normalizeMcpUrl` 强制）。令牌在 URL 路径里，
 *      配成远程地址等于把令牌发给别人。
 *   2. **令牌只在后端**：出站一律 `maskUrl()`，日志里也不打完整地址。
 *
 * 本文件只管「读配置 / 探测 / 拉快照」这些有 IO 的事；
 * 所有格式解析在 `parse.ts`（纯函数，可无副作用单测）。
 */

export const DEVICE_SETTINGS_KEY = 'device.loverconnect';

export interface LinkConfig {
  url: string;
  enabled: boolean;
}

/** 单次工具调用的超时：LC 是手机上的 socket 接受循环，慢工具不该拖死整次快照 */
const PART_TIMEOUT_MS = 8000;
/** 整次快照的硬截止（天气那项要出外网到 wttr.in） */
const SNAPSHOT_DEADLINE_MS = 14000;
const CACHE_TTL_MS = 45000;

/** 默认只拉「快」的四项；天气要走外网、屏幕时间要读用量统计，放 full 里 */
const BASE_PARTS: SnapshotPart[] = ['battery', 'steps', 'anniversary', 'context'];
const FULL_EXTRA: SnapshotPart[] = ['weather', 'screenTime', 'events'];

export function resolveParts(full: boolean): SnapshotPart[] {
  return full ? [...BASE_PARTS, ...FULL_EXTRA] : [...BASE_PARTS];
}

// ==================== 配置 ====================

export function readLinkConfig(): LinkConfig | null {
  const cfg = getSettingValue<LinkConfig | null>(DEVICE_SETTINGS_KEY, null);
  if (!cfg || typeof cfg.url !== 'string' || !cfg.url) return null;
  return { url: cfg.url, enabled: cfg.enabled !== false };
}

export function saveLinkConfig(inputUrl: string, enabled = true): LinkConfig {
  const url = normalizeMcpUrl(inputUrl);
  const cfg: LinkConfig = { url, enabled };
  setSetting(DEVICE_SETTINGS_KEY, cfg);
  cache.clear();
  return cfg;
}

export function clearLinkConfig(): void {
  setSetting(DEVICE_SETTINGS_KEY, null);
  cache.clear();
}

function toClientConfig(cfg: LinkConfig): McpServerConfig {
  return { type: 'http', url: cfg.url };
}

// ==================== 探测 ====================

export interface ProbeResult {
  ok: boolean;
  isLoverConnect: boolean;
  serverName: string | null;
  serverVersion: string | null;
  toolCount: number;
  tools: string[];
  missing: string[];
  error: string | null;
}

/** 判定「这个地址是 LC 而不是随便一个 MCP」的最小工具集 */
const REQUIRED_TOOLS = ['get_battery', 'get_steps', 'get_device_context'];

export async function probeLink(inputUrl: string): Promise<ProbeResult> {
  let url: string;
  try {
    url = normalizeMcpUrl(inputUrl);
  } catch (err) {
    return {
      ok: false,
      isLoverConnect: false,
      serverName: null,
      serverVersion: null,
      toolCount: 0,
      tools: [],
      missing: [...REQUIRED_TOOLS],
      error: (err as Error).message,
    };
  }

  const client = toClientConfig({ url, enabled: true });
  try {
    const [info, tools] = await Promise.all([
      getServerInfo(client).catch(() => null),
      listTools(client),
    ]);
    const names = tools.map((t) => t.name);
    const missing = REQUIRED_TOOLS.filter((t) => !names.includes(t));
    return {
      ok: true,
      isLoverConnect: missing.length === 0,
      serverName: info?.name ?? null,
      serverVersion: info?.version ?? null,
      toolCount: names.length,
      tools: names,
      missing,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      isLoverConnect: false,
      serverName: null,
      serverVersion: null,
      toolCount: 0,
      tools: [],
      missing: [...REQUIRED_TOOLS],
      error: describeConnectError(err),
    };
  }
}

// ==================== 快照聚合 ====================

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} 超时（${ms}ms）`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const PART_TOOL: Record<SnapshotPart, { tool: string; args: Record<string, unknown> }> = {
  battery: { tool: 'get_battery', args: {} },
  steps: { tool: 'get_steps', args: {} },
  anniversary: { tool: 'get_anniversary', args: {} },
  context: { tool: 'get_device_context', args: {} },
  weather: { tool: 'get_weather', args: {} },
  screenTime: { tool: 'get_screen_time', args: {} },
  events: { tool: 'get_recent_context_events', args: { limit: 8 } },
};

interface CacheEntry {
  at: number;
  data: DeviceSnapshot;
}

const cache = new Map<string, CacheEntry>();

/** 只给「刷新」按钮与测试用 */
export function clearSnapshotCache(): void {
  cache.clear();
}

export interface SnapshotOptions {
  full?: boolean;
  refresh?: boolean;
}

function emptySnapshot(parts: SnapshotPart[], hint: string | null, configured = false): DeviceSnapshot {
  return {
    configured,
    reached: false,
    fetchedAt: now(),
    parts,
    battery: null,
    steps: null,
    weather: null,
    anniversaries: [],
    screenTime: null,
    context: null,
    events: [],
    errors: [],
    hint,
  };
}

export async function getSnapshot(opts: SnapshotOptions = {}): Promise<DeviceSnapshot> {
  const parts = resolveParts(!!opts.full);
  const key = parts.join(',');
  const cfg = readLinkConfig();

  if (!cfg || !cfg.enabled) {
    return emptySnapshot(
      parts,
      cfg
        ? '手机感知已暂停。到「手机感知」页重新打开即可。'
        : '还没接入手机感知。到「手机感知」页粘贴 LoverConnect 首页显示的 MCP 地址。',
      // 暂停 ≠ 未接入：接口要分得开这两种状态，前端才能显示「暂停」而不是「去接入」
      !!cfg,
    );
  }

  const hit = cache.get(key);
  if (!opts.refresh && hit && now() - hit.at < CACHE_TTL_MS) return hit.data;

  const client = toClientConfig(cfg);
  const started = now();
  const snapshot = emptySnapshot(parts, null, true);
  let anyOk = false;
  let firstFatal: string | null = null;

  // 顺序调用：LC 是手机上的接受循环，并发打过去收益不大，反而更容易被厂商系统限流
  for (const part of parts) {
    if (now() - started > SNAPSHOT_DEADLINE_MS) {
      snapshot.errors.push({ part, message: '整次快照已超时，这一项没来得及取' });
      continue;
    }
    const { tool, args } = PART_TOOL[part];
    try {
      const res = await withTimeout(callTool(client, tool, args), PART_TIMEOUT_MS, tool);
      if (res.isError) throw new Error(res.content || `${tool} 返回错误`);
      anyOk = true;
      const text = res.content;
      switch (part) {
        case 'battery':
          snapshot.battery = parseBattery(text);
          break;
        case 'steps':
          snapshot.steps = parseSteps(text);
          break;
        case 'anniversary':
          snapshot.anniversaries = parseAnniversary(text);
          break;
        case 'context':
          snapshot.context = parseDeviceContext(text);
          break;
        case 'weather':
          snapshot.weather = parseWeather(text);
          break;
        case 'screenTime':
          snapshot.screenTime = parseScreenTime(text);
          break;
        case 'events':
          snapshot.events = parseContextEvents(text);
          break;
      }
    } catch (err) {
      const message = describeConnectError(err);
      const entry: SnapshotError = { part, message };
      snapshot.errors.push(entry);
      if (firstFatal == null) firstFatal = message;
    }
  }

  snapshot.reached = anyOk;
  snapshot.fetchedAt = now();
  if (!anyOk) snapshot.hint = firstFatal ?? '手机没有回应任何一项请求';
  else if (snapshot.errors.length > 0) snapshot.hint = null;

  cache.set(key, { at: snapshot.fetchedAt, data: snapshot });
  return snapshot;
}

// 单点出口：路由与测试只依赖 `loverconnect.js`，解析实现留在 `parse.js`
export { describeConnectError, maskUrl, normalizeMcpUrl } from './parse.js';
export type {
  AnniversaryInfo,
  BatteryInfo,
  ContextInfo,
  ContextRow,
  DeviceSnapshot,
  ScreenTimeInfo,
  SnapshotError,
  SnapshotPart,
  WeatherInfo,
} from './parse.js';

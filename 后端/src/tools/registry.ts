import type { ToolDef } from '../adapters/types.js';
import { phoneHub } from '../phoneControl/hub.js';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { courses, ragDocuments, ragChunks, ragDocumentCollections, profiles, pluginWishlist } from '../db/schema.js';
import { newId, now } from '../utils/id.js';
import { addOpenSourceProject, refreshOpenSource } from '../routes/openSource.js';
import { setSetting } from '../routes/settings.js';
import { indexDocument, updateDocument } from '../services/ragService.js';

/**
 * 内置工具（阶段 9 自主联网）：读网页 / 联网搜索 / 保存课程表。
 * 读网页与搜索只读、无副作用 → 默认免确认；save_courses 写课程表（用户主动发起，免确认）。
 * 统一经 toolRunner 执行并落 tool_calls 记录。
 * MCP 工具在 mcp/client.ts 里以同样形状注册，走同一套执行/权限层。
 */

export interface BuiltinTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  /** 是否需要用户确认（内置只读工具均为 false） */
  requiresConfirm: boolean;
  execute(args: Record<string, unknown>): Promise<string>;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

const webFetch: BuiltinTool = {
  name: 'web_fetch',
  description: '读取一个网页的正文文本。当用户询问某个链接的内容、或需要阅读某篇网页时使用。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要读取的网页 URL（http/https）' },
    },
    required: ['url'],
  },
  requiresConfirm: false,
  async execute(args) {
    const url = String(args.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return '错误：url 必须以 http:// 或 https:// 开头';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LittleBlueberry/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `读取失败：HTTP ${res.status}`;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json') || ct.includes('text/')) {
      const text = await res.text();
      return ct.includes('json') ? text.slice(0, 8000) : htmlToText(text).slice(0, 8000);
    }
    return htmlToText(await res.text()).slice(0, 8000);
  },
};

const webSearch: BuiltinTool = {
  name: 'web_search',
  description:
    '联网搜索。当需要最新信息、事实核查、或回答超出模型知识截止日期的问题时使用。返回若干条标题+摘要+链接。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
    },
    required: ['query'],
  },
  requiresConfirm: false,
  async execute(args) {
    const query = String(args.query ?? '').trim();
    if (!query) return '错误：query 不能为空';
    // 用 DuckDuckGo 静态 HTML 端点（免 Key，尽力而为）
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LittleBlueberry/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `搜索失败：HTTP ${res.status}`;
    const html = await res.text();

    // 抓结果块：每条含标题链接 + 摘要
    const results: { title: string; url: string; snippet: string }[] = [];
    const blockRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) !== null && results.length < 8) {
      const rawUrl = m[1];
      // DuckDuckGo 的 href 是跳转链接，真正的 URL 在 uddg 参数里
      let url = rawUrl;
      const uddg = rawUrl.match(/uddg=([^&]+)/);
      if (uddg) {
        try {
          url = decodeURIComponent(uddg[1]);
        } catch {
          url = uddg[1];
        }
      }
      results.push({ title: decodeEntities(m[2].replace(/<[^>]+>/g, '')), url, snippet: '' });
    }
    let si = 0;
    while ((m = snippetRe.exec(html)) !== null && si < results.length) {
      results[si].snippet = decodeEntities(m[1].replace(/<[^>]+>/g, ''));
      si += 1;
    }

    if (results.length === 0) return '没有搜到结果（可能是网络受限或被限流），建议换关键词或稍后再试。';
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join('\n');
  },
};

const COURSE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

function toInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

const saveCourses: BuiltinTool = {
  name: 'save_courses',
  description:
    '保存课程表：用识别/整理出的课程列表整体替换当前课表。当用户发课表截图、或口头新增/修改课程时调用。',
  parameters: {
    type: 'object',
    properties: {
      courses: {
        type: 'array',
        description: '完整的课程列表（replace 语义：传入当前应存在的全部课程）',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '课程名' },
            day: { type: 'integer', description: '周几，1=周一 … 7=周日' },
            startPeriod: { type: 'integer', description: '起始节次（1 起）' },
            endPeriod: { type: 'integer', description: '结束节次（含）' },
            startWeek: { type: 'integer', description: '起始周' },
            endWeek: { type: 'integer', description: '结束周' },
            parity: { type: 'string', enum: ['all', 'odd', 'even'], description: '每周/单周/双周' },
            teacher: { type: 'string', description: '老师（可选）' },
            location: { type: 'string', description: '教室/地点（可选）' },
            color: { type: 'string', description: '十六进制颜色（可选）' },
          },
          required: ['name', 'day', 'startPeriod', 'endPeriod', 'startWeek', 'endWeek'],
        },
      },
    },
    required: ['courses'],
  },
  requiresConfirm: false,
  async execute(args) {
    const list = (Array.isArray(args.courses) ? args.courses : []) as Array<Record<string, unknown>>;
    const ts = now();
    const rows = list
      .map((raw, i) => {
        const name = String(raw.name ?? '').trim();
        if (!name) return null;
        const startPeriod = toInt(raw.startPeriod, 1, 20, 1);
        const endPeriod = toInt(raw.endPeriod, 1, 20, startPeriod);
        const startWeek = toInt(raw.startWeek, 1, 52, 1);
        const endWeek = toInt(raw.endWeek, 1, 52, startWeek);
        const parity = raw.parity === 'odd' || raw.parity === 'even' ? raw.parity : 'all';
        return {
          id: newId(),
          name,
          teacher: raw.teacher ? String(raw.teacher).trim() : null,
          location: raw.location ? String(raw.location).trim() : null,
          day: toInt(raw.day, 1, 7, 1),
          startPeriod,
          endPeriod,
          startWeek,
          endWeek,
          parity,
          color:
            typeof raw.color === 'string' && raw.color ? raw.color : COURSE_COLORS[i % COURSE_COLORS.length],
          createdAt: ts,
          updatedAt: ts,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    db.transaction((tx) => {
      tx.update(courses).set({ deletedAt: ts, updatedAt: ts }).where(isNull(courses.deletedAt)).run();
      for (const r of rows) tx.insert(courses).values(r).run();
    });

    return `已保存 ${rows.length} 门课程。`;
  },
};

const RAG_CATEGORIES = ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'] as const;

const memoAdd: BuiltinTool = {
  name: 'memo_add',
  description:
    '将对话中的重要信息写入双人共享备忘录。自动判断这条信息属于谁。当用户透露了偏好、约定、经历、计划、灵感等重要信息时调用。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '简短标题' },
      content: { type: 'string', description: '完整内容' },
      category: {
        type: 'string',
        enum: ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan'],
        description: '分类：preference 喜好/忌口、agreement 约定/承诺、experience 共同经历、info 事实信息、inspiration 灵感、plan 计划',
      },
      fromWho: { type: 'string', description: '说话方的昵称（如「白起」），即这条信息的来源' },
      toWho: { type: 'string', description: '信息归属方（如「肆佑」），即这条信息描述的是谁' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
      importance: { type: 'integer', minimum: 1, maximum: 5, description: '重要程度 1-5，默认 3' },
    },
    required: ['title', 'content'],
  },
  requiresConfirm: false,
  async execute(args) {
    const content = String(args.content ?? '').trim();
    if (!content) return '错误：content 不能为空';
    const category = String(args.category ?? 'info');
    const cat = RAG_CATEGORIES.includes(category as never) ? category : 'info';
    const importance = Math.min(5, Math.max(1, Math.round(Number(args.importance) || 3)));
    const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)).filter(Boolean) : [];

    // 自动获取档案来填 fromWho/toWho 默认值
    const allProfiles = db.select().from(profiles).all();
    const me = allProfiles.find((p) => p.isMe);
    const partner = allProfiles.find((p) => !p.isMe);
    const rawFrom = typeof args.fromWho === 'string' ? args.fromWho.trim() : '';
    const rawTo = typeof args.toWho === 'string' ? args.toWho.trim() : '';
    const finalFromWho = rawFrom || me?.nickname || '我';
    const finalToWho = rawTo || finalFromWho;
    // avatarSeed 用 toWho 对应 profile 的 avatarSeed
    const targetProfile = finalToWho === partner?.nickname ? partner : me;

    const title = String(args.title ?? '').trim() || '(无标题)';
    // 归属：关于对方（toWho=partner）→ 我记 TA（me）；关于我（toWho=me）→ TA 记我（partner）
    const ownerSide = finalToWho === partner?.nickname ? 'me' : finalToWho === me?.nickname ? 'partner' : 'me';
    await indexDocument({
      title,
      content,
      source: 'agent',
      authorType: 'agent',
      category: cat,
      tags: tags.length ? tags : undefined,
      importance,
      fromWho: finalFromWho,
      toWho: finalToWho,
      avatarSeed: targetProfile?.avatarSeed ?? null,
      ownerSide,
      status: 'archived', // AI 已给出标题/分类/归属 → 直接收录
    });
    // 有温度的结果说明：让 AI 据此自然地回应，而不是生硬地说「已记录」
    return `已为 ${finalToWho} 记下：${title}。我帮你记下了，以后不会忘的 🫶（${cat}）`;
  },
};

const memoUpdate: BuiltinTool = {
  name: 'memo_update',
  description:
    '更新一条已存在的备忘录。当用户纠正、补充或推翻之前记下的信息时调用（如「其实我不吃香菜」）。需要用户确认。',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: '要更新的备忘录 id' },
      newContent: { type: 'string', description: '更新后的完整内容' },
      reason: { type: 'string', description: '更新原因（可选）' },
    },
    required: ['documentId', 'newContent'],
  },
  requiresConfirm: true,
  async execute(args) {
    const documentId = String(args.documentId ?? '').trim();
    const newContent = String(args.newContent ?? '').trim();
    if (!documentId || !newContent) return '错误：documentId 与 newContent 不能为空';
    const reason = args.reason ? String(args.reason).trim() : undefined;
    try {
      const result = await updateDocument(documentId, newContent, reason);
      return `已更新备忘录 ${documentId}（${result.chunkCount} 块）。`;
    } catch (err) {
      return `更新失败：${(err as Error).message}`;
    }
  },
};

const memoDelete: BuiltinTool = {
  name: 'memo_delete',
  description: '删除一条备忘录（软删除）。当用户明确表示某条内容不再适用、或记错了要求删除时调用。需要用户确认。',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: '要删除的备忘录 id' },
      reason: { type: 'string', description: '删除原因（可选）' },
    },
    required: ['documentId'],
  },
  requiresConfirm: true,
  async execute(args) {
    const documentId = String(args.documentId ?? '').trim();
    if (!documentId) return '错误：documentId 不能为空';
    const ts = now();
    const result = db.update(ragDocuments).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragDocuments.id, documentId)).run();
    if (result.changes === 0) return '删除失败：备忘录不存在';
    db.update(ragChunks).set({ deletedAt: ts, updatedAt: ts }).where(eq(ragChunks.documentId, documentId)).run();
    db.delete(ragDocumentCollections).where(eq(ragDocumentCollections.documentId, documentId)).run();
    return `已删除备忘录 ${documentId}。`;
  },
};

const memoOrganize: BuiltinTool = {
  name: 'memo_organize',
  description:
    '整理一条未分类便签：给它起标题、分类、判断归属，把 status 从 unfiled 转为 archived。当系统提示词里出现「待整理备忘录」清单时，逐条调用本工具整理。',
  parameters: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: '草稿备忘录 id' },
      title: { type: 'string', description: '整理后的简短标题' },
      category: {
        type: 'string',
        enum: ['preference', 'agreement', 'experience', 'info', 'inspiration', 'plan', 'general'],
        description: '分类',
      },
      fromWho: { type: 'string', description: '谁记的（昵称），默认「我」' },
      toWho: { type: 'string', description: '为谁记的（昵称），即这条信息描述的是谁' },
      ownerSide: {
        type: 'string',
        enum: ['me', 'partner'],
        description: '归属方：me 我记 TA / partner TA 记我',
      },
      tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
      importance: { type: 'integer', minimum: 1, maximum: 5, description: '重要程度 1-5，默认 3' },
    },
    required: ['documentId', 'title'],
  },
  requiresConfirm: false,
  async execute(args) {
    const documentId = String(args.documentId ?? '').trim();
    if (!documentId) return '错误：documentId 不能为空';
    const row = db
      .select()
      .from(ragDocuments)
      .all()
      .find((d) => d.id === documentId && d.deletedAt == null);
    if (!row) return '整理失败：备忘录不存在';

    const allProfiles = db.select().from(profiles).all();
    const me = allProfiles.find((p) => p.isMe);
    const partner = allProfiles.find((p) => !p.isMe);
    const fromWho = (typeof args.fromWho === 'string' && args.fromWho.trim()) || me?.nickname || '我';
    const toWho = (typeof args.toWho === 'string' && args.toWho.trim()) || fromWho;
    const targetProfile = toWho === partner?.nickname ? partner : me;
    const category = String(args.category ?? 'info');
    const cat = RAG_CATEGORIES.includes(category as never) ? category : 'info';
    const importance = Math.min(5, Math.max(1, Math.round(Number(args.importance) || 3)));
    const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)).filter(Boolean) : [];
    const ownerSide =
      args.ownerSide === 'partner' || args.ownerSide === 'me'
        ? args.ownerSide
        : toWho === partner?.nickname
          ? 'me'
          : toWho === me?.nickname
            ? 'partner'
            : 'me';

    const set: Record<string, unknown> = {
      title: String(args.title ?? '').trim() || row.title,
      category: cat,
      fromWho,
      toWho,
      avatarSeed: targetProfile?.avatarSeed ?? null,
      ownerSide,
      status: 'archived',
      importance,
      updatedAt: now(),
    };
    if (tags.length) set.tags = JSON.stringify(tags);

    db.update(ragDocuments).set(set).where(eq(ragDocuments.id, documentId)).run();
    return `已整理：${set.title}（${cat}，为 ${toWho} 记的）`;
  },
};

/* ----------------------------------------------------------------------------
 * 手机控制工具（真·控手机：原生 Android 桥 ↔ 后端 SSE ↔ LLM）
 * 每个工具本质是把一条确定性指令经 phoneHub 发给手机上的原生端执行，
 * 这正是 Operit 式「模型推理 + 确定性工具层」三明治架构。
 * 只读类（ui_tree / screenshot / home / back / scroll）默认免确认；
 * 会改变设备状态/输入类（tap / swipe / input / open_app）需要用户确认。
 * ------------------------------------------------------------------------- */

function phoneResult(res: { ok: boolean; data?: unknown; error?: string }, fallback = ''): string {
  if (!res.ok) return `手机未连接或操作失败：${res.error ?? '未知错误'}`;
  if (res.data == null) return fallback || 'ok';
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

function phoneTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  tool: string,
  requiresConfirm: boolean,
  argMap?: (a: Record<string, unknown>) => Record<string, unknown>,
): BuiltinTool {
  return {
    name,
    description,
    parameters: { type: 'object', properties, required },
    requiresConfirm,
    async execute(args) {
      const payload = argMap ? argMap(args) : args;
      const res = await phoneHub.sendCommand(tool, payload);
      return phoneResult(res);
    },
  };
}

const phoneUiTree = phoneTool(
  'phone_ui_tree',
  '读取手机当前屏幕的界面结构（各可见元素的文本/内容描述与位置）。相当于让 AI「看到」当前手机界面，是执行任何点击/输入前先观察屏幕的第一步。只读，无需确认。',
  {},
  [],
  'ui_tree',
  false,
  () => ({}),
);

const phoneScreenshot = phoneTool(
  'phone_screenshot',
  '截取手机当前屏幕。只读，无需确认。返回图片在后端的可访问地址（仅本地/内网），不会上传到任何外部服务。',
  {},
  [],
  'screenshot',
  false,
  () => ({}),
);

const phoneTap = phoneTool(
  'phone_tap',
  '在手机上点击一个界面元素。优先用 text（元素的可见文本或内容描述）定位；也可给 x,y（0~1 比例坐标）精确点击。当用户要小蓝莓帮忙点开某个 App、按钮、链接、开关时使用。会改变设备状态，需要用户确认。',
  {
    text: { type: 'string', description: '要点击的元素文本或内容描述（优先）。例如「设置」「微信」' },
    x: { type: 'number', description: '点击横坐标，0~1 比例（与 text 二选一）' },
    y: { type: 'number', description: '点击纵坐标，0~1 比例（与 text 二选一）' },
  },
  [],
  'tap',
  true,
);

const phoneSwipe = phoneTool(
  'phone_swipe',
  '在手机屏幕上滑动。可给 direction（up/down/left/right）；也可给精确起止坐标 fromX/fromY/toX/toY（0~1 比例）。用于翻页、下拉刷新、返回上一层等。需要用户确认。',
  {
    direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滑动方向（快捷方式）' },
    fromX: { type: 'number', description: '起点横坐标 0~1' },
    fromY: { type: 'number', description: '起点纵坐标 0~1' },
    toX: { type: 'number', description: '终点横坐标 0~1' },
    toY: { type: 'number', description: '终点纵坐标 0~1' },
  },
  [],
  'swipe',
  true,
);

const phoneInput = phoneTool(
  'phone_input',
  '在当前聚焦的输入框里输入文字（先确保已 tap 到输入框）。用于发消息、搜素、填表。需要用户确认，避免误输入。',
  {
    text: { type: 'string', description: '要输入的文字内容' },
  },
  ['text'],
  'input',
  true,
);

const phoneOpenApp = phoneTool(
  'phone_open_app',
  '打开手机上的某个 App。可传 packageName（如 com.tencent.mm）；若不记得包名可传 appName（如「微信」「设置」），由原生端按已安装列表模糊匹配。需要用户确认。',
  {
    packageName: { type: 'string', description: 'Android 包名（优先），如 com.tencent.mm' },
    appName: { type: 'string', description: 'App 显示名（模糊匹配），如「微信」「设置」' },
  },
  [],
  'open_app',
  true,
);

const phoneHome = phoneTool(
  'phone_home',
  '按系统「返回桌面」（Home 键）。导航操作，相对安全，无需确认。',
  {},
  [],
  'home',
  false,
  () => ({}),
);

const phoneBack = phoneTool(
  'phone_back',
  '按系统「返回」键（上一级）。导航操作，无需确认。',
  {},
  [],
  'back',
  false,
  () => ({}),
);

const phoneScroll = phoneTool(
  'phone_scroll',
  '在当前界面内滚动。direction 为 up/down/left/right。用于浏览列表/长页面。只读式浏览，无需确认。',
  {
    direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
  },
  ['direction'],
  'scroll',
  false,
);

const PHONE_TOOLS: BuiltinTool[] = [
  phoneUiTree,
  phoneScreenshot,
  phoneTap,
  phoneSwipe,
  phoneInput,
  phoneOpenApp,
  phoneHome,
  phoneBack,
  phoneScroll,
];

/* ----------------------------------------------------------------------------
 * 灵感待办池 / 开源项目：让 AI 在对话里直接往这些清单写东西
 * （对应需求：灵感待办池可以 AI 自行添加；AI 还能对开源项目进行添加和更新）
 * ------------------------------------------------------------------------- */

const wishlistAdd: BuiltinTool = {
  name: 'wishlist_add',
  description:
    '把对话中冒出的灵感或待办写进两人的「灵感待办池」（/wishlist）。当用户说「记一下」「提醒我」「以后想…」「帮我存个 todo」「这个想法不错」等时调用。默认存为灵感；若是明确的待办任务可传 isTodo=true。',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '要记录的内容（灵感或待办的文字）' },
      isTodo: { type: 'boolean', description: 'true=待办任务（可勾选完成），false/缺省=灵感（Inbox）' },
    },
    required: ['content'],
  },
  requiresConfirm: false,
  async execute(args) {
    const content = String(args.content ?? '').trim();
    if (!content) return '错误：content 不能为空';
    const isTodo = args.isTodo === true;
    const id = newId();
    const ts = now();
    const maxRow = db
      .select({ max: pluginWishlist.sortOrder })
      .from(pluginWishlist)
      .all()
      .reduce((m, r) => Math.max(m, r.max ?? 0), 0);
    db.insert(pluginWishlist)
      .values({
        id,
        content,
        isTodo,
        completed: false,
        completedAt: null,
        sortOrder: maxRow + 10,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return `已写进灵感待办池（${isTodo ? '待办' : '灵感'}）：${content}`;
  },
};

const openSourceAdd: BuiltinTool = {
  name: 'open_source_add',
  description:
    '把用户提到的 GitHub 开源项目加入「开源项目关注清单」。传仓库地址（https://github.com/owner/repo 或 owner/repo）。加入后自动拉取星标与最新版本，有新版本时亮红点。已在清单里则提示已存在。',
  parameters: {
    type: 'object',
    properties: {
      repoUrl: { type: 'string', description: 'GitHub 仓库地址，如 https://github.com/owner/repo' },
      note: { type: 'string', description: '备注（可选）' },
    },
    required: ['repoUrl'],
  },
  requiresConfirm: false,
  async execute(args) {
    const repoUrl = String(args.repoUrl ?? '').trim();
    if (!repoUrl) return '错误：repoUrl 不能为空';
    try {
      const id = await addOpenSourceProject(repoUrl, args.note ? String(args.note) : undefined);
      return `已加入开源项目关注清单：${repoUrl}（id=${id}）。以后想查更新就说一声。`;
    } catch (e) {
      return `添加失败：${(e as Error).message}`;
    }
  },
};

/**
 * 备注（2026-10-19）：用户说「以后叫你 XX」「备注改成 XX」时，AI 直接把备注写进 settings。
 * 这个备注就是**聊天顶栏显示的名字**（前端 `profileStore.partnerRemark` 会在启动时同步）。
 * 为什么走后端：备注存在 localStorage 里的话 AI 碰不到。
 */
const setPartnerRemark: BuiltinTool = {
  name: 'set_partner_remark',
  description:
    '给 TA 起 / 改一个备注（聊天里显示的名字）。用户说「以后叫你 XX」「备注写 XX」「你就叫 XX 吧」「别叫小蓝莓了，叫 XX」时调用。只改备注，不改人设里的本名。备注限 12 个字以内。',
  parameters: {
    type: 'object',
    properties: {
      remark: { type: 'string', description: '新的备注（1~12 个字），例如「哥哥」' },
    },
    required: ['remark'],
  },
  requiresConfirm: false,
  async execute(args) {
    const remark = String(args.remark ?? '').trim().slice(0, 12);
    if (!remark) return '错误：remark 不能为空';
    setSetting('profile.partnerRemark', remark);
    return `已把备注改成「${remark}」。聊天顶栏和「小心思」那儿都会用这个名字（可能要点一下刷新）。`;
  },
};

const openSourceRefresh: BuiltinTool = {  name: 'open_source_refresh',
  description:
    '检查「开源项目关注清单」里有没有新版本发布（只读检查，不动本地依赖）。不传 id 检查全部；传 id 只查那一个。返回有多少项目有更新、哪些失败。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '只看某个项目时的项目 id（可选，缺省检查全部）' },
    },
    required: [],
  },
  requiresConfirm: false,
  async execute(args) {
    try {
      const r = await refreshOpenSource(typeof args.id === 'string' && args.id ? args.id : undefined);
      if (r.failed.length) {
        return `检查完成：有 ${r.updated} 个项目可更新；${r.failed.length} 个失败（${r.failed.map((f) => f.name).join('、')}）。`;
      }
      return r.updated > 0 ? `检查完成：${r.updated} 个项目有新版本。` : '检查完成：没有项目有新版本。';
    } catch (e) {
      return `检查更新失败：${(e as Error).message}`;
    }
  },
};

const BUILTIN_TOOLS: BuiltinTool[] = [
  webFetch,
  webSearch,
  saveCourses,
  memoAdd,
  memoUpdate,
  memoDelete,
  memoOrganize,
  wishlistAdd,
  openSourceAdd,
  openSourceRefresh,
  setPartnerRemark,
  ...PHONE_TOOLS,
];
const byName = new Map(BUILTIN_TOOLS.map((t) => [t.name, t]));

export function listBuiltinTools(): BuiltinTool[] {
  return BUILTIN_TOOLS;
}

export function getBuiltinTool(name: string): BuiltinTool | undefined {
  return byName.get(name);
}

export function hasBuiltinTool(name: string): boolean {
  return byName.has(name);
}

/** 转成 OpenAI function calling 的 ToolDef 格式 */
export function builtinToolDef(t: BuiltinTool): ToolDef {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}

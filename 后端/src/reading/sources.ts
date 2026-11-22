/**
 * 书架多源导入的解析工具（2026-10-19）。
 *
 * 边界说明（很重要）：
 * - **番茄**：页面里的 `window.__INITIAL_STATE__` 带有真实书名/作者/封面/全量目录，
 *   可以直接导入元数据与章节列表；但**正文是字体混淆的**（Private Use Area 字符），
 *   需要专门的字体映射才能还原，本文件不碰正文，只做「目录导入」。
 * - **通用链接**：给公开网页/公版书用，抓 HTML → 去脚本样式 → 纯文本。
 * - **微信读书**：没有稳定的公开接口，需要用户自己的登录 Cookie；本文件只做**纯解析**
 *   （把 `/web/shelf` 的 HTML、`/web/shelf/syncBook`、`/web/book/bookmarklist` 的
 *   JSON 归一化成统一结构），真正的网络抓取与凭证校验在 `routes/reading.ts` 里做。
 *
 * 纯函数、零 IO，方便单测。
 */

/* ───────────────────────── 通用工具 ───────────────────────── */

/**
 * 从 HTML 里抠出 `window.__INITIAL_STATE__ = {...}` 的 JSON。
 * 不能用正则截到 `</script>` —— 后面可能还有代码；这里做字符串感知的括号配对。
 */
export function extractInitialState(html: string): unknown | null {
  const marker = 'window.__INITIAL_STATE__=';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return null;
  }
}

/** 番茄链接 / 纯数字 → bookId */
export function parseFanqieUrl(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const m =
    raw.match(/fanqienovel\.com\/page\/(\d+)/i) ??
    raw.match(/fanqienovel\.com\/book\/(\d+)/i) ??
    raw.match(/^(\d{8,})$/);
  return m ? m[1] : null;
}

const PUA_RE = /[\uE000-\uF8FF]/;

/** 正文是否被字体混淆（番茄的 PUA 字符）。用来拒绝把乱码写进书架。 */
export function isObfuscatedText(text: string): boolean {
  return PUA_RE.test(text ?? '');
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

/** 通用网页正文抽取（够用就好，不引 Readability 依赖） */
export function extractReadable(html: string): { title: string; content: string } {
  const withoutNoise = (html ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  const title =
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(withoutNoise)?.[1]?.trim() ?? '') ||
    decodeEntities(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(withoutNoise)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '');

  const text = decodeEntities(
    withoutNoise
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');

  return { title, content: text.slice(0, 300_000) };
}

/* ───────────────────────── 番茄 ───────────────────────── */

export interface FanqieBookMeta {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  desc: string;
  totalChapters: number;
  /** 章节标题（最多 500 条，够阅读器分章） */
  toc: string[];
  /** 章节 itemId（与 toc 同序，最多 500 条；以后接正文用） */
  itemIds: string[];
}

interface FanqieChapter {
  itemId?: string;
  title?: string;
}

/**
 * 解析番茄书籍页。成功返回元数据 + 目录；失败返回 null（调用方给 502）。
 */
export function parseFanqiePage(html: string): FanqieBookMeta | null {
  const state = extractInitialState(html) as
    | {
        page?: {
          bookId?: string;
          bookName?: string;
          authorName?: string;
          author?: string;
          abstract?: string;
          description?: string;
          thumbUrl?: string;
          thumbUri?: string;
          chapterTotal?: number;
          chapterListWithVolume?: unknown;
        };
      }
    | null;
  const page = state?.page;
  if (!page?.bookName) return null;

  // chapterListWithVolume 可能是「数组」也可能是「数字键对象」，两种都拍平
  const raw = page.chapterListWithVolume;
  const volumes: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const chapters: FanqieChapter[] = volumes.flatMap((v) =>
    Array.isArray(v) ? (v as FanqieChapter[]) : [],
  );

  const toc = chapters
    .map((c) => (typeof c.title === 'string' ? c.title.trim() : ''))
    .filter(Boolean)
    .slice(0, 500);
  const itemIds = chapters
    .map((c) => (typeof c.itemId === 'string' ? c.itemId : ''))
    .filter(Boolean)
    .slice(0, 500);

  const cover = page.thumbUrl || page.thumbUri || '';
  return {
    bookId: String(page.bookId ?? ''),
    title: page.bookName.trim(),
    author: String(page.authorName || page.author || '').trim(),
    coverUrl: cover ? (cover.startsWith('//') ? `https:${cover}` : cover) : null,
    desc: String(page.abstract || page.description || '').trim().slice(0, 200),
    totalChapters: Math.max(toc.length, Number(page.chapterTotal) || 0, 1),
    toc,
    itemIds,
  };
}

/* ───────────────────────── 微信读书 ───────────────────────── */

/**
 * 微信读书（weread.qq.com）解析工具（2026-11-19）。
 *
 * 认证：用户粘贴登录后的 Cookie（核心字段 wr_vid / wr_skey / wr_rt 等）。
 * 官方没有稳定公开接口，以下解析都基于社区验证过的网页版内部端点，
 * **随时可能失效**，所以全部做成容错：解析不出就返回空，由路由层给提示。
 *
 * 这里只做**纯解析**（HTML / JSON → 统一结构），网络抓取与凭证校验在
 * `routes/reading.ts` 的 `/reading/import/weread` 里做。
 */

export interface WereadBookMeta {
  bookId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  desc: string;
  /** 阅读进度 0-100，可能缺失 */
  percent: number | null;
}

export interface WereadShelfParse {
  /** 已带详情的书 */
  books: WereadBookMeta[];
  /** 只有 ID、需要再调 syncBook 补详情的书 ID */
  pendingIds: string[];
  /** 页面登录态：vid/skey/name 全空视为未登录（Cookie 无效或过期时微信读书返回空书架页） */
  loggedIn: boolean;
}

function toPercent(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // 微信读书有时给 0-1 小数，有时给 0-100
  return n <= 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
}

function toEpoch(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 从 HTML 里宽松地抠 `window.__INITIAL_STATE__`（容忍 = 两侧空格） */
function extractInitialStateLoose(html: string): unknown | null {
  const marker = 'window.__INITIAL_STATE__';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const brace = html.indexOf('{', at);
  if (brace < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(brace, i + 1));
    }
  }
  return null;
}

function normWereadCover(v: unknown): string | null {
  const c = String(v ?? '').trim();
  if (!c) return null;
  return c.startsWith('//') ? `https:${c}` : c;
}

/** 把一条原始书架记录归一成 WereadBookMeta（字段名做多路兼容） */
function normWereadBook(b: Record<string, unknown>): WereadBookMeta | null {
  const bookId = String(b.bookId ?? b.book_id ?? '').trim();
  const title = String(b.title ?? b.bookName ?? b.name ?? '').trim();
  if (!bookId || !title) return null;
  return {
    bookId,
    title,
    author: String(b.author ?? b.authorName ?? '').trim(),
    coverUrl: normWereadCover(b.coverUrl ?? b.cover ?? b.thumbUrl ?? b.coverUrl_),
    desc: String(b.desc ?? b.abstract ?? b.description ?? '').trim().slice(0, 200),
    percent: toPercent(b.readingProgress ?? b.percent ?? b.progress),
  };
}

/**
 * 解析 `/web/shelf` 返回的 HTML：
 * `window.__INITIAL_STATE__.shelf` 里有 `rawBooks`（带详情）与 `rawIndexes`（全量 ID）。
 * 返回已带详情的书 + 待补详情的 ID 列表。解析不出返回 null。
 */
export function parseWereadShelf(html: string): WereadShelfParse | null {
  const state = extractInitialStateLoose(html) as
    | {
        shelf?: { rawBooks?: unknown; rawIndexes?: unknown };
        user?: { vid?: unknown; skey?: unknown; name?: unknown };
      }
    | null;
  const shelf = state?.shelf;
  if (!shelf) return null;

  const rawBooks = Array.isArray(shelf.rawBooks) ? shelf.rawBooks : [];
  const rawIndexes = Array.isArray(shelf.rawIndexes) ? shelf.rawIndexes : [];

  const books: WereadBookMeta[] = [];
  const seen = new Set<string>();
  for (const rb of rawBooks) {
    if (!rb || typeof rb !== 'object') continue;
    const meta = normWereadBook(rb as Record<string, unknown>);
    if (!meta || seen.has(meta.bookId)) continue;
    seen.add(meta.bookId);
    books.push(meta);
  }

  const pendingIds: string[] = [];
  for (const idx of rawIndexes) {
    const id =
      typeof idx === 'string'
        ? idx.trim()
        : String((idx as Record<string, unknown>)?.bookId ?? '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      pendingIds.push(id);
    }
  }

  // 登录态：Cookie 无效/过期时微信读书返回未登录的空书架页（user.vid/skey/name 全空）
  const user = state?.user;
  const loggedIn = Boolean(
    user &&
      ((user.vid != null && user.vid !== '') ||
        (user.skey != null && user.skey !== '') ||
        (user.name != null && user.name !== '')),
  );

  return { books, pendingIds, loggedIn };
}

/**
 * 解析 `/web/shelf/syncBook` 的返回（数组或 `{ books: [...] }`）：
 * 补全只有 ID 的书的详情。
 */
export function parseWereadSyncBook(data: unknown): WereadBookMeta[] {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).books)
      ? (data as Record<string, unknown>).books as unknown[]
      : [];
  const out: WereadBookMeta[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const meta = normWereadBook(item as Record<string, unknown>);
    if (!meta || seen.has(meta.bookId)) continue;
    seen.add(meta.bookId);
    out.push(meta);
  }
  return out;
}

export interface WereadBookmark {
  /** 划线文本 */
  text: string;
  /** 章节名（可能缺失） */
  chapterName: string;
  /** 微信读书侧的颜色值（原样保留） */
  color: string;
  /** 创建时间（秒），可能缺失 */
  createdAt: number | null;
}

/**
 * 解析 `/web/book/bookmarklist` 的返回：
 * 兼容 `{ bookmarks: [...] }` / `{ data: [...] }` / `{ list: [...] }` / 裸数组。
 * 每条划线的文本字段做多路兼容（markText / text / content）。
 */
export function parseWereadBookmarks(data: unknown): WereadBookmark[] {
  let arr: unknown[] = [];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    arr = (obj.bookmarks ?? obj.data ?? obj.list ?? []) as unknown[];
    if (!Array.isArray(arr)) arr = [];
  }
  const out: WereadBookmark[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const text = String(b.markText ?? b.text ?? b.content ?? '').trim();
    if (!text) continue;
    out.push({
      text,
      chapterName: String(b.chapterName ?? b.chapter ?? b.chapterTitle ?? '').trim(),
      color: String(b.color ?? b.style ?? 'yellow'),
      createdAt: toEpoch(b.createTime ?? b.create_time ?? b.createTs),
    });
  }
  return out;
}

/** 微信读书的颜色值归一化到本项目四色（yellow | green | blue | pink） */
export function normWereadColor(v: string): string {
  const c = (v ?? '').toLowerCase();
  if (c.includes('green')) return 'green';
  if (c.includes('blue')) return 'blue';
  if (c.includes('pink')) return 'pink';
  return 'yellow';
}

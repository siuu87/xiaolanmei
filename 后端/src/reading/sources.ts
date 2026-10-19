/**
 * 书架多源导入的解析工具（2026-10-19）。
 *
 * 边界说明（很重要）：
 * - **番茄**：页面里的 `window.__INITIAL_STATE__` 带有真实书名/作者/封面/全量目录，
 *   可以直接导入元数据与章节列表；但**正文是字体混淆的**（Private Use Area 字符），
 *   需要专门的字体映射才能还原，本文件不碰正文，只做「目录导入」。
 * - **通用链接**：给公开网页/公版书用，抓 HTML → 去脚本样式 → 纯文本。
 * - **微信读书**：没有稳定的公开接口，需要用户自己的凭证；本文件不实现抓取。
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

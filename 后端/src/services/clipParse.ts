/**
 * 链接剪藏解析（2026-11-14）。
 *
 * 用户要的是 flomoplus 那种「贴个链接就变成一张卡片」，这里负责把链接拆成
 * 标题 / 作者 / 封面 / 摘要 / 正文。**不同站点能拿到的深度差别很大**，所以每个
 * 平台单独一条路，抓不到就老实降级，不编内容：
 *
 *   GitHub   ✅ 公开 API：仓库名、描述、star、语言、topics、头像、README 正文
 *   B 站     ✅ 开放接口：标题、封面、UP 主、时长、简介
 *   公众号    ✅ 网页 OG（服务端一般能读到），图片前端要 no-referrer 才显示
 *   知乎      ⚠️ 直接 403，只能靠 OG，多数时候拿不到 —— 降级成链接卡
 *   小红书    ❌ 笔记页有设备指纹 + xsec_token 校验，服务端一律被挡
 *              （error_code=300031 当前笔记暂时无法浏览）。
 *              所以小书只能两条路：① 贴「分享→复制链接」的整段文案，从文案里
 *              拆出标题 / 作者 / 链接；② 用浏览器书签在你自己登录的页面上抓正文。
 *
 * 任何一条路失败都不抛给用户看，返回已拿到的部分 + warnings，让前端照实显示。
 */

export type ClipPlatform = 'xiaohongshu' | 'github' | 'bilibili' | 'wechat' | 'zhihu' | 'web';

export interface ParsedClip {
  url: string;
  title: string;
  author: string;
  platform: ClipPlatform;
  cover: string;
  excerpt: string;
  content: string;
  tags: string[];
  /** 没抓到的东西，照实告诉用户，不假装完整 */
  warnings: string[];
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIMEOUT = 9000;
/** 正文最多留这么多字，再长就是整本书了 */
const MAX_BODY = 20000;

/* ------------------------------------------------------------------ */
/* 基础工具                                                             */
/* ------------------------------------------------------------------ */

/** 从一段文字里挑出第一个 http(s) 链接（分享文案、带前缀的粘贴都能用） */
export function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s"'<>）)】]+/i);
  return m ? m[0].trim() : '';
}

/** 去掉追踪参数，留一个干净的原址 */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const drop = [
      'source',
      'xhsshare',
      'xsec_source',
      'share_from_user_hidden',
      'appuid',
      'apptime',
      'share_id',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'spm_id_from',
      'vd_source',
      'from_source',
      'share_token',
    ];
    for (const k of drop) u.searchParams.delete(k);
    // xsec_token 是小红书防盗链凭证，去掉就更打不开了 —— 留着
    return u.toString();
  } catch {
    return raw;
  }
}

/** 极简 HTML 实体解码：og 标签里的 &amp; &quot; &#39; 这些 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** 压缩空白 */
function squash(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** 取某个 meta 的 content（property 或 name 都认，顺序不定） */
function meta(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = html.match(re)?.[0];
  if (!tag) return '';
  const c = tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
  return c ? squash(decodeEntities(c)) : '';
}

/** <title> 内容 */
function docTitle(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? squash(decodeEntities(t)) : '';
}

/**
 * 从网页里粗抽正文。
 *
 * 故意做得很保守：只按 <p>/<h2> 段落取，去掉脚本样式和导航短句，
 * 宁可少抽一点也不要把「登录 / 关注 / 广告」这种脏东西塞进正文。
 */
function extractReadable(html: string): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const blocks = body.match(/<(p|h1|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of blocks) {
    const text = squash(
      decodeEntities(
        b
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' '),
      ),
    );
    if (text.length < 12) continue;
    if (/^(登录|注册|关注|分享|点赞|收藏|评论|广告|版权|上一篇|下一篇|扫码)/.test(text)) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.join('\n').length > MAX_BODY) break;
  }
  return out.join('\n\n').slice(0, MAX_BODY);
}

async function get(
  url: string,
  headers: Record<string, string> = {},
  timeout = TIMEOUT,
): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
}

async function getText(url: string): Promise<{ finalUrl: string; html: string }> {
  const r = await get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { finalUrl: r.url || url, html: await r.text() };
}

/* ------------------------------------------------------------------ */
/* 平台识别                                                             */
/* ------------------------------------------------------------------ */

const RESERVED_GH = new Set([
  'topics',
  'explore',
  'trending',
  'collections',
  'marketplace',
  'sponsors',
  'settings',
  'notifications',
  'pulls',
  'issues',
  'dashboard',
  'login',
  'join',
  'about',
  'pricing',
  'features',
  'search',
  'orgs',
  'users',
  'apps',
  'new',
]);

export function detectPlatform(rawUrl: string): ClipPlatform {
  let host = '';
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'web';
  }
  if (host.endsWith('xiaohongshu.com') || host === 'xhslink.com') return 'xiaohongshu';
  if (host === 'github.com' || host === 'gist.github.com' || host === 'raw.githubusercontent.com') return 'github';
  if (host.endsWith('bilibili.com') || host === 'b23.tv') return 'bilibili';
  if (host === 'mp.weixin.qq.com') return 'wechat';
  if (host.endsWith('zhihu.com')) return 'zhihu';
  return 'web';
}

/* ------------------------------------------------------------------ */
/* 小红书：分享文案拆解                                                  */
/* ------------------------------------------------------------------ */

/**
 * 小红书「分享 → 复制链接」粘出来长这样：
 *   19 【精致的撕信封交互教程 - 界面之外 | 小红书 - 你的生活兴趣社区】 😆 nkAnuNjSoYEY49l 😆 https://...
 *
 * 【】里是「标题 - 作者 | 小红书…」；前面的数字是点赞量。拆得出来就用，
 * 拆不出来也不硬编，标题留空让用户自己补。
 */
export function parseXhsShareText(text: string): { title: string; author: string } {
  const inner = text.match(/【([\s\S]+?)】/)?.[1] ?? '';
  if (!inner) return { title: '', author: '' };

  // 【标题 - 作者 | 小红书 ...】
  const noSuffix = inner.split(/\s*\|\s*小红书/)[0];
  // 标题里本身可能带「 - 」，所以只在末尾切一次：作者通常是最后那段
  const m = noSuffix.match(/^([\s\S]+?)\s+-\s+([^-|]{1,24})$/);
  if (m) return { title: squash(m[1]), author: squash(m[2]) };
  return { title: squash(noSuffix), author: '' };
}

/* ------------------------------------------------------------------ */
/* GitHub                                                              */
/* ------------------------------------------------------------------ */

interface GhRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  owner?: { login: string; avatar_url: string };
  html_url: string;
}

async function ghJson<T>(url: string): Promise<T | null> {
  try {
    const r = await get(url, { Accept: 'application/vnd.github+json' });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function parseGitHub(url: string, base: ParsedClip): Promise<ParsedClip> {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);

  // gist：没有 API 摘要，只能读页面标题
  if (u.hostname.startsWith('gist.')) {
    try {
      const { html } = await getText(url);
      const t = meta(html, 'og:title') || docTitle(html);
      return { ...base, title: t || base.title, platform: 'github', tags: ['GitHub', 'Gist'] };
    } catch {
      return { ...base, platform: 'github', warnings: [...base.warnings, '这个 Gist 没读到，只存了链接'] };
    }
  }

  const owner = parts[0] ?? '';
  const repo = parts[1] ?? '';
  if (!owner || !repo || RESERVED_GH.has(owner)) {
    return { ...base, platform: 'github', tags: ['GitHub'] };
  }

  const isIssue = parts[2] === 'issues' && /^\d+$/.test(parts[3] ?? '');
  const isPR = parts[2] === 'pull' && /^\d+$/.test(parts[3] ?? '');
  const n = parts[3];

  /**
   * 三个请求互不依赖，**全部一起发**。原来串行要等三个来回，一次剪藏
   * 十秒才出结果，粘贴完干等着，体感极差。
   *
   * 封面走仓库页的 social preview 图（`opengraph.githubassets.com/...`）。
   * 但那个页面有一兆多，是整条链路最慢的一环，所以**单独 3.5 秒掐掉**：
   * 拿不到封面就让它空着，前端画「G」占位，绝不为了张配图拖住整条剪藏。
   * 也不拿 owner 头像兜底 —— 正方形小图铺满卡片就是一张糊脸的大头贴。
   */
  const infoP = ghJson<GhRepo>(`https://api.github.com/repos/${owner}/${repo}`);

  /**
   * 封面：GitHub 给每个仓库自动生成的 social preview 卡片图。
   *
   * 这个地址里的 hash 段本来是 commit sha（用来做缓存失效），但实测填任意固定值
   * 都返回同一张图（200 / 83KB / 0.8s）。**所以不去拉那一兆多的仓库页面** ——
   * 之前为了一个 og:image 要等 9.8 秒，整条剪藏都被拖住。
   * 现在这里只拼字符串、零请求，图由浏览器自己加载，加载失败就露出「G」占位。
   */
  const cover = `https://opengraph.githubassets.com/1/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  /** 正文：issue/PR 取那个线程的正文，仓库主页取 README。只发一次请求。 */
  const detailP: Promise<{ body: string; title?: string; author?: string } | null> =
    isIssue || isPR
      ? ghJson<{ title: string; body: string | null; user: { login: string } }>(
          `https://api.github.com/repos/${owner}/${repo}/${isIssue ? 'issues' : 'pulls'}/${n}`,
        ).then((it) =>
          it ? { body: (it.body ?? '').slice(0, MAX_BODY), title: it.title, author: it.user?.login } : null,
        )
      : (async () => {
          try {
            const r = await get(`https://api.github.com/repos/${owner}/${repo}/readme`, {
              Accept: 'application/vnd.github.raw',
            });
            return { body: r.ok ? (await r.text()).slice(0, MAX_BODY) : '' };
          } catch {
            return { body: '' };
          }
        })();

  const [info, detail] = await Promise.all([infoP, detailP]);

  if (!info) {
    return {
      ...base,
      platform: 'github',
      title: base.title || `${owner}/${repo}`,
      tags: ['GitHub'],
      warnings: [...base.warnings, 'GitHub 接口没返回（可能被限流了），只存了链接'],
    };
  }

  let title = info.full_name;
  let excerpt = info.description ?? '';
  const content = detail?.body ?? '';
  let author = info.owner?.login ?? owner;

  if ((isIssue || isPR) && detail?.title) {
    title = `${isIssue ? 'Issue' : 'PR'} #${n} · ${detail.title}`;
    excerpt = squash(content.slice(0, 200));
    author = detail.author ?? author;
  }

  const cards: string[] = [];
  if (info.stargazers_count != null) cards.push(`★ ${info.stargazers_count}`);
  if (info.language) cards.push(info.language);

  return {
    ...base,
    url,
    platform: 'github',
    title,
    author,
    cover,
    excerpt: [excerpt, cards.join(' · ')].filter(Boolean).join('\n'),
    content,
    tags: ['GitHub', ...(info.topics ?? []).slice(0, 4)],
  };
}

/* ------------------------------------------------------------------ */
/* B 站                                                                */
/* ------------------------------------------------------------------ */

async function parseBilibili(url: string, base: ParsedClip): Promise<ParsedClip> {
  let target = url;
  // b23.tv 短链要先跟到真实地址才拿得到 BV 号
  if (new URL(url).hostname === 'b23.tv') {
    try {
      const r = await get(url);
      target = r.url || url;
    } catch {
      /* 跟不过去就用原链接 */
    }
  }

  const bv = target.match(/\/video\/(BV[0-9A-Za-z]{10})/)?.[1];
  const av = target.match(/\/video\/av(\d+)/)?.[1];
  const cv = target.match(/\/read\/cv(\d+)/)?.[1];

  if (bv || av) {
    const q = bv ? `bvid=${bv}` : `aid=${av}`;
    const j = await fetch(`https://api.bilibili.com/x/web-interface/view?${q}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT),
    })
      .then((r) => r.json() as Promise<any>)
      .catch(() => null);

    const d = j?.data;
    if (d) {
      const dur = Number(d.duration) || 0;
      const mm = String(Math.floor(dur / 60)).padStart(2, '0');
      const ss = String(dur % 60).padStart(2, '0');
      // B 站简介经常是「-」或者一串话题标签，没内容的别往摘要里塞
      const rawDesc = squash(d.desc ?? '');
      const desc = rawDesc.length >= 6 && /[\u4e00-\u9fa5a-zA-Z]{4}/.test(rawDesc) ? rawDesc.slice(0, 180) : '';
      const views = Number(d.stat?.view) || 0;
      const viewText =
        views >= 100_000_000
          ? `${(views / 100_000_000).toFixed(1)} 亿播放`
          : views >= 10_000
            ? `${(views / 10_000).toFixed(1)} 万播放`
            : `${views} 播放`;
      return {
        ...base,
        url: `https://www.bilibili.com/video/${d.bvid}`,
        platform: 'bilibili',
        title: d.title ?? '',
        author: d.owner?.name ?? '',
        // 接口给的封面是 http，https 页面会混合内容被拦，统一升一下
        cover: (d.pic ?? '').replace(/^http:/, 'https:'),
        excerpt: [desc, `${mm}:${ss} · ${viewText}`].filter(Boolean).join('\n'),
        content: rawDesc.slice(0, MAX_BODY),
        tags: ['B站', d.tname].filter(Boolean),
      };
    }
  }

  // 专栏 cv 号没有顺手的公开接口，退回 OG
  try {
    const { html } = await getText(target);
    return {
      ...base,
      platform: 'bilibili',
      title: meta(html, 'og:title') || base.title,
      cover: meta(html, 'og:image'),
      excerpt: meta(html, 'og:description'),
      content: extractReadable(html),
      tags: ['B站'],
      url: target,
    };
  } catch {
    return { ...base, platform: 'bilibili', tags: ['B站'], warnings: [...base.warnings, 'B 站这个页面没读到，只存了链接'] };
  }
}

/* ------------------------------------------------------------------ */
/* 通用网页                                                             */
/* ------------------------------------------------------------------ */

async function parseWeb(url: string, base: ParsedClip, platform: ClipPlatform): Promise<ParsedClip> {
  try {
    const { finalUrl, html } = await getText(url);
    const title = meta(html, 'og:title') || meta(html, 'twitter:title') || docTitle(html);
    const desc = meta(html, 'og:description') || meta(html, 'description') || meta(html, 'twitter:description');
    const cover = meta(html, 'og:image') || meta(html, 'twitter:image') || meta(html, 'og:image:url');
    const site = meta(html, 'og:site_name');
    const author = meta(html, 'og:article:author') || meta(html, 'author') || site;

    return {
      ...base,
      url: finalUrl,
      platform,
      title: title || base.title,
      author,
      cover,
      excerpt: desc,
      content: extractReadable(html).slice(0, MAX_BODY),
      tags: platform === 'web' ? (site ? [site] : []) : [platform === 'wechat' ? '公众号' : '知乎'],
    };
  } catch {
    return {
      ...base,
      platform,
      warnings: [...base.warnings, '这个网页没抓到内容（可能有登录墙或反爬），只存了链接'],
    };
  }
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

export async function parseClip(rawText: string): Promise<ParsedClip> {
  const url = extractUrl(rawText);
  if (!url) throw new Error('没找到链接');

  const cleaned = cleanUrl(url);
  const platform = detectPlatform(cleaned);
  const base: ParsedClip = {
    url: cleaned,
    title: '',
    author: '',
    platform,
    cover: '',
    excerpt: '',
    content: '',
    tags: [],
    warnings: [],
  };

  if (platform === 'github') return parseGitHub(cleaned, base);
  if (platform === 'bilibili') return parseBilibili(cleaned, base);

  if (platform === 'xiaohongshu') {
    const { title, author } = parseXhsShareText(rawText);
    return {
      ...base,
      title,
      author,
      tags: ['小红书'],
      warnings: [
        '小红书笔记页有设备指纹校验，服务端读不到正文和图片',
        '用书签抓一下就能带上正文和配图，或者自己补几句',
      ],
    };
  }

  if (platform === 'wechat' || platform === 'zhihu') return parseWeb(cleaned, base, platform);
  return parseWeb(cleaned, base, 'web');
}

/** 平台中文名，前端角标直接用 */
export const PLATFORM_LABEL: Record<ClipPlatform, string> = {
  xiaohongshu: '小红书',
  github: 'GitHub',
  bilibili: 'B 站',
  wechat: '公众号',
  zhihu: '知乎',
  web: '网页',
};

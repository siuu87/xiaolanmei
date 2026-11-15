/**
 * 剪藏（wish_clips）的前端配套：类型、接口、平台外观、书签脚本。
 *
 * 单独拆一个文件，因为「书签脚本」是一段要拼成字符串的 JS，
 * 混在页面组件里会很难读。
 */

export type ClipPlatform = 'xiaohongshu' | 'github' | 'bilibili' | 'wechat' | 'zhihu' | 'web';

export interface Clip {
  id: string;
  url: string;
  title: string;
  author: string;
  platform: ClipPlatform;
  cover: string;
  excerpt: string;
  content: string;
  note: string;
  tags: string[];
  folderId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ParsedClip {
  url: string;
  title: string;
  author: string;
  platform: ClipPlatform;
  cover: string;
  excerpt: string;
  content: string;
  tags: string[];
  /** 没抓到的东西，照实显示，不假装完整 */
  warnings: string[];
}

/**
 * 每个平台一个色 + 一个中文名。
 * 颜色取各家品牌色但压低饱和度 —— 这页整体是暖纸色，品牌色原样糊上去会很吵。
 */
export const PLATFORM: Record<ClipPlatform, { label: string; color: string; tint: string }> = {
  xiaohongshu: { label: '小红书', color: '#D2454F', tint: 'rgba(210,69,79,.12)' },
  github: { label: 'GitHub', color: '#4B5563', tint: 'rgba(75,85,99,.12)' },
  bilibili: { label: 'B 站', color: '#C85C84', tint: 'rgba(200,92,132,.12)' },
  wechat: { label: '公众号', color: '#3F8F5E', tint: 'rgba(63,143,94,.12)' },
  zhihu: { label: '知乎', color: '#3D74B8', tint: 'rgba(61,116,184,.12)' },
  web: { label: '网页', color: '#8A7A68', tint: 'rgba(138,122,104,.12)' },
};

const API = '/api/wish-clips';

export async function fetchClips(): Promise<Clip[]> {
  const r = await fetch(API);
  if (!r.ok) throw new Error('读取剪藏失败');
  return (await r.json()) as Clip[];
}

/** 只解析不落库：粘贴后先给用户看一眼对不对 */
export async function parseLink(text: string): Promise<ParsedClip> {
  const r = await fetch(`${API}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const d = (await r.json().catch(() => ({}))) as ParsedClip & { message?: string };
  if (!r.ok) throw new Error(d.message || '没认出这个链接');
  return d;
}

export async function saveClip(body: {
  text?: string;
  folderId?: string;
  title?: string;
  content?: string;
  note?: string;
  /** 自己打的标签；不传就用解析出来的（GitHub 会带 topics） */
  tags?: string[];
}): Promise<{ id: string; updated: boolean }> {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = (await r.json().catch(() => ({}))) as { id?: string; updated?: boolean; message?: string };
  if (!r.ok || !d.id) throw new Error(d.message || '没存上');
  return { id: d.id, updated: !!d.updated };
}

/** 书签抓回来的东西直接推进来（不再解析，页面已经渲染好了） */
export async function pushClip(p: {
  url: string;
  title?: string;
  author?: string;
  content?: string;
  cover?: string;
  platform?: string;
}): Promise<{ id: string; updated: boolean }> {
  const r = await fetch(`${API}/clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
  const d = (await r.json().catch(() => ({}))) as { id?: string; updated?: boolean; message?: string };
  if (!r.ok || !d.id) throw new Error(d.message || '没存上');
  return { id: d.id, updated: !!d.updated };
}

export async function patchClip(
  id: string,
  patch: { title?: string; note?: string; content?: string; folderId?: string; tags?: string[] },
): Promise<void> {
  const r = await fetch(`${API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error('没改上');
}

export async function removeClip(id: string): Promise<void> {
  await fetch(`${API}/${id}`, { method: 'DELETE' });
}

/** 相对时间，跟灵感的写法保持一致 */
export function clipTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * GitHub README 里的图片是相对路径，直接渲染会全是破图。
 * 统一补成 raw.githubusercontent（用 HEAD 指代默认分支，不用猜 main 还是 master）。
 */
export function fixGithubMarkdown(md: string, url: string): string {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return md;
  const [, owner, repo] = m;
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`;
  return md.replace(/!\[([^\]]*)\]\((?!https?:)([^)\s]+)\)/g, (_all, alt: string, src: string) => {
    const clean = src.replace(/^\.?\//, '');
    return `![${alt}](${base}${clean})`;
  });
}

/**
 * 书签小工具。
 *
 * 为什么不能直接 fetch 后端：小红书是 https 页面，浏览器把对 `http://localhost`
 * 的请求当作混合内容拦掉（实测 TypeError: Failed to fetch）。所以改成
 * **window.open 一个本地页，把抓到的内容塞在 URL hash 里带过去** ——
 * 顶层导航不受混合内容限制，本地页收到后自己 POST 到同源后端，存完自己关窗。
 *
 * 抓取顺序都是「先找具体节点，再退回 og，再退回整页文本」，因为小红书/公众号
 * 的 DOM 隔三差五就换一次，单靠一个选择器迟早失效。
 */
export function buildBookmarklet(origin: string): string {
  const base = origin.replace(/\/$/, '');
  const code = `(function(){
  var g=function(s){var e=document.querySelector(s);return e?((e.content||e.textContent||'')+'').trim():''};
  var meta=function(n){return g('meta[property="'+n+'"]')||g('meta[name="'+n+'"]')};
  var host=location.hostname;
  var platform='web';
  if(/xiaohongshu|xhslink/.test(host))platform='xiaohongshu';
  else if(/github/.test(host))platform='github';
  else if(/bilibili|b23\\.tv/.test(host))platform='bilibili';
  else if(/mp\\.weixin\\.qq\\.com/.test(host))platform='wechat';
  else if(/zhihu/.test(host))platform='zhihu';

  var title=meta('og:title')||document.title||'';
  var author=meta('article:author')||meta('author')||'';
  var body='';
  var cover=meta('og:image')||meta('twitter:image')||'';

  if(platform==='xiaohongshu'){
    title=g('#detail-title')||g('[class*="note-title"]')||title;
    author=g('.username')||g('[class*="user-name"]')||g('[class*="author"] .name')||author;
    body=g('#detail-desc')||g('.note-text')||g('[class*="note-desc"]')||g('[class*="desc"]')||'';
  }
  if(!body){
    var art=document.querySelector('article, .article, .rich_media_content, #js_content, .note-content');
    body=art?(art.innerText||''):'';
  }
  if(!body)body=window.getSelection?String(window.getSelection()):'';
  if(!body)body=meta('og:description')||meta('description')||'';
  if(!cover){
    var im=document.querySelector('#noteContainer img, .swiper-slide img, article img, .rich_media_content img');
    cover=im?(im.currentSrc||im.src||''):'';
  }

  title=title.replace(/\\s*[-|]\\s*小红书.*$/,'').slice(0,200);
  body=(body||'').replace(/\\n{3,}/g,'\\n\\n').slice(0,4000);

  var data={url:location.href,title:title,author:author,content:body,cover:cover,platform:platform};
  var u='${base}/wishlist#clip='+encodeURIComponent(JSON.stringify(data));
  var w=window.open(u,'bbclip','width=460,height=720,left=200,top=80');
  if(!w)alert('浏览器拦了弹窗，允许一下再点一次');
})();`;
  // javascript: URL 里换行会被当成语句结束，压成一行
  return 'javascript:' + encodeURIComponent(code).replace(/%20/g, ' ');
}

/** 从地址栏 hash 里取出书签推过来的数据 */
export function readClipFromHash(): {
  url: string;
  title?: string;
  author?: string;
  content?: string;
  cover?: string;
  platform?: string;
} | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash;
  const at = h.indexOf('clip=');
  if (at < 0) return null;
  try {
    return JSON.parse(decodeURIComponent(h.slice(at + 5)));
  } catch {
    return null;
  }
}

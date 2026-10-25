import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Remember-Me（记忆相册）反向代理（2026-10-25）。
 *
 * 背景：Remember-Me 出于安全策略对所有响应强制 `X-Frame-Options: DENY` +
 * `frame-ancestors 'none'`，因此**永远无法 iframe 内嵌**；而且它默认只监听
 * 127.0.0.1，绑定非回环地址又要强制 Bearer Token。VPS 远程访问时，浏览器既连不到
 * 内网回环地址、也禁止内嵌。
 *
 * 解法：后端反代。记住我继续跑在 127.0.0.1:8787（内部、无鉴权），浏览器只走已经
 * 对公网开放的 3001，由本代理转发 `/dashboard`、`/dashboard/static/*`、`/api/v1/*`
 * 到内部侧车。这样：
 *   - 不用在云安全组再开 8787 端口；
 *   - 不用给记住我设 Bearer Token；
 *   - 与已有的 xinchao / Ombre 代理思路一致。
 *
 * 范围：先覆盖「查看档案」这条主路径（全是 GET）。上传（POST /api/v1/assets）暂不在
 * 代理内，远程新增图片走主机侧或后续补；查看 / 检索 / 详情不受影响。
 */

const UPSTREAM_BASE = (
  process.env.REMEMBER_ME_URL ?? 'http://127.0.0.1:8787'
).replace(/\/+$/, '');

/** 仅转发 GET；URL 直接拼 `req.url`（已含 path + query）。 */
async function proxyGet(req: FastifyRequest, reply: FastifyReply) {
  const upstreamUrl = `${UPSTREAM_BASE}${req.url || '/'}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { accept: req.headers.accept ?? '*/*' },
      signal: AbortSignal.timeout(15000),
    });
    reply.code(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) reply.header('content-type', ct);
    const cache = upstream.headers.get('cache-control');
    if (cache) reply.header('cache-control', cache);
    // 去掉 framing 头（顶层导航其实不需要，但留着也无害；这里顺手清掉，避免任何内嵌尝试被拦）
    reply.header('x-frame-options', 'ALLOWALL');
    const buf = Buffer.from(await upstream.arrayBuffer());
    return reply.send(buf);
  } catch {
    // 侧车没起 / 中途断了：回 502，让前端走「重新检测」流程
    return reply.code(502).send({ message: 'remember-me 代理不可达' });
  }
}

export async function rememberMeProxyRoutes(app: FastifyInstance): Promise<void> {
  // 与记住我仪表盘的「绝对路径」一一对应，路径前缀必须与它一致，否则资源 404。
  // 用通配，避免漏掉仪表盘实际会调用的某个 /api/v1/* 读取接口。
  app.get('/dashboard', proxyGet);
  app.get('/dashboard/', proxyGet);
  app.get('/dashboard/static/*', proxyGet);
  app.get('/api/v1/*', proxyGet);
}

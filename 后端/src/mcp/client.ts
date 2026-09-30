import { spawn } from 'node:child_process';

/**
 * 极简 MCP 客户端（阶段 9）：只支持三种传输的最小可用子集——
 *   - http：POST JSON-RPC 2.0 到 url
 *   - sse：POST JSON-RPC 2.0 到 url，响应为 text/event-stream
 *   - stdio：spawn command，按行 JSON-RPC 2.0 通信（每次调用一个进程：initialize → 操作 → 关闭）
 * 只实现 initialize / tools/list / tools/call，够「接一个 MCP → 列出工具 → 调用」的闭环。
 */

export interface McpServerConfig {
  type: 'stdio' | 'sse' | 'http';
  url?: string; // http / sse
  headers?: Record<string, string>;
  command?: string; // stdio
  args?: string[];
  env?: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: string;
  isError: boolean;
}

const PROTOCOL_VERSION = '2024-11-05';

let idCounter = 0;
function nextId(): number {
  return ++idCounter;
}

function parseResult(json: any): unknown {
  if (json?.error) throw new Error(json.error.message ?? 'MCP 调用错误');
  return json?.result;
}

/** HTTP/SSE：POST JSON-RPC，兼容纯 JSON 与 text/event-stream 响应 */
async function httpRequest(
  url: string,
  headers: Record<string, string>,
  method: string,
  params: unknown,
): Promise<unknown> {
  const id = nextId();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`MCP 服务器错误：HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';

  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    let last: any = null;
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        if (obj.id === id) last = obj;
      } catch {
        /* ignore */
      }
    }
    if (last == null) throw new Error('MCP 服务器未返回有效 SSE 响应');
    return parseResult(last);
  }

  const json = (await res.json()) as any;
  return parseResult(json);
}

/** stdio：spawn 一个进程，按行 JSON-RPC 完成 initialize + 一次调用 */
function stdioRequest(
  config: McpServerConfig,
  method: string,
  params: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!config.command) {
      reject(new Error('stdio 类型 MCP 缺少 command'));
      return;
    }
    const child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const id = nextId();
    const opId = nextId();
    let buffer = '';
    let stderr = '';
    const pending = new Map<number, (v: unknown) => void>();
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(err);
    };

    const send = (rid: number, m: string, p: unknown, resolveFn: (v: unknown) => void) => {
      pending.set(rid, resolveFn);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method: m, params: p }) + '\n');
    };

    child.stdout.on('data', (d) => {
      buffer += d.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let obj: any;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        const r = pending.get(obj.id);
        if (r) {
          pending.delete(obj.id);
          r(obj);
        }
      }
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', fail);
    child.on('exit', () => {
      if (!settled) fail(new Error(`MCP stdio 进程提前退出${stderr ? `：${stderr.slice(0, 300)}` : ''}`));
    });

    // initialize → 操作 → 拿到结果即关闭
    send(id, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'little-blueberry', version: '1.0.0' },
    }, () => {
      send(opId, method, params, (resp: any) => {
        if (resp?.error) return fail(new Error(resp.error.message ?? 'MCP 调用错误'));
        if (settled) return;
        settled = true;
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        resolve(resp?.result);
      });
    });
  });
}

function call(config: McpServerConfig, method: string, params: unknown): Promise<unknown> {
  if (config.type === 'stdio') return stdioRequest(config, method, params);
  if (!config.url) return Promise.reject(new Error(`${config.type} 类型 MCP 缺少 url`));
  return httpRequest(config.url, config.headers ?? {}, method, params);
}

/** 列出服务器上的工具 */
export async function listTools(config: McpServerConfig): Promise<McpToolInfo[]> {
  const result = (await call(config, 'tools/list', {})) as {
    tools?: { name: string; description?: string; inputSchema?: Record<string, unknown> }[];
  };
  return (result?.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
  }));
}

/** 调用服务器上的工具，返回文本结果 */
export async function callTool(
  config: McpServerConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const result = (await call(config, 'tools/call', { name, arguments: args })) as {
    content?: { type: string; text?: string }[];
    isError?: boolean;
  };
  const parts = (result?.content ?? [])
    .map((c) => (c.type === 'text' ? c.text ?? '' : JSON.stringify(c)))
    .join('\n');
  return { content: parts, isError: !!result?.isError };
}

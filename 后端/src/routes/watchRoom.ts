import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';

/**
 * 「一起看」房间同步服务（方案 C：同步框架先行，片源可后接）
 *
 * 通道（跟 phoneControl.ts 的 SSE 写法对齐：hijack + 手写流，SSE 单向 + POST 上报）：
 * - `GET  /api/watch/room/:code/stream?sender=xxx`  —— SSE 长连接，服务端推 state / hello / source
 * - `POST /api/watch/room/:code/state`              —— 房主上报播放状态，服务端存快照并广播
 * - `GET  /api/watch/room/:code`                    —— 房间快照（验收 / 排障用）
 *
 * 设计要点：
 * 1. 同步的是「播放状态」（播放/暂停/进度/倍速），不是片源。两端可用各自的合法片源 URL。
 * 2. 房间纯内存，不落库：播放进度是瞬时状态，重启即失效，没必要污染 watch_items 表。
 * 3. 服务端按 sender 跳过回显；同一浏览器多标签页 sender 相同，靠前端 BroadcastChannel 互补，
 *    跨设备 sender 不同，靠这里的 SSE 广播。两条通道天然不重复。
 * 4. 新成员连上立刻补一份当前 state，不必等房主心跳，加入即对齐。
 */

type SyncEvent =
  | { kind: 'state'; room: string; sender: string; playing: boolean; time: number; rate: number; ts: number }
  | { kind: 'hello'; room: string; sender: string }
  | { kind: 'source'; room: string; sender: string; title: string };

interface Client {
  sender: string;
  raw: ServerResponse;
  /** 每条连接自己的保活定时器 */
  hb: ReturnType<typeof setInterval>;
}

interface Room {
  clients: Set<Client>;
  /** 房主最近一次完整状态，供后来者加入即对齐 */
  state?: Extract<SyncEvent, { kind: 'state' }>;
  lastActive: number;
}

const ROOM_TTL = 2 * 60 * 60 * 1000; // 2 小时无活动且无人在线 → 回收
const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  let r = rooms.get(code);
  if (!r) {
    r = { clients: new Set(), lastActive: Date.now() };
    rooms.set(code, r);
  }
  r.lastActive = Date.now();
  return r;
}

function writeEvent(client: Client, event: SyncEvent): void {
  try {
    client.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    /* 连接已断，close 事件会负责摘除 */
  }
}

/** 广播给房间内 sender 不同的连接（同设备的多标签页交给前端本地通道） */
function broadcast(room: Room, event: SyncEvent): void {
  for (const c of room.clients) {
    if (c.sender === event.sender) continue;
    writeEvent(c, event);
  }
}

/** 清洗上报体：只放行已知 kind 与合法字段，脏数据不进广播 */
function cleanEvent(raw: unknown, code: string): SyncEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const sender = typeof o.sender === 'string' ? o.sender.slice(0, 64) : '';
  if (!sender) return null;
  const base = { room: code, sender };
  if (o.kind === 'state') {
    const time = typeof o.time === 'number' && Number.isFinite(o.time) ? Math.max(0, o.time) : 0;
    const rate = typeof o.rate === 'number' && Number.isFinite(o.rate) ? Math.min(4, Math.max(0.25, o.rate)) : 1;
    return {
      ...base,
      kind: 'state',
      playing: o.playing === true,
      time,
      rate,
      ts: typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : Date.now(),
    };
  }
  if (o.kind === 'hello') return { ...base, kind: 'hello' };
  if (o.kind === 'source') {
    return { ...base, kind: 'source', title: typeof o.title === 'string' ? o.title.slice(0, 80) : '' };
  }
  return null;
}

// 定期回收空房间；unref 避免拖住进程退出
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.clients.size === 0 && now - r.lastActive > ROOM_TTL) rooms.delete(code);
  }
}, 60_000);
sweeper.unref();

const CODE_RE = /^\d{4}$/;

export async function watchRoomRoutes(app: FastifyInstance): Promise<void> {
  /** 房间快照：验收时确认「谁在线、当前进度多少」 */
  app.get('/watch/room/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    if (!CODE_RE.test(code)) return reply.code(400).send({ message: '房间号须为 4 位数字' });
    const r = rooms.get(code);
    return {
      room: code,
      clients: r?.clients.size ?? 0,
      senders: r ? [...new Set([...r.clients].map((c) => c.sender))] : [],
      state: r?.state ?? null,
    };
  });

  /** SSE：服务端单向推状态 */
  app.get('/watch/room/:code/stream', async (req, reply) => {
    const { code } = req.params as { code: string };
    const q = req.query as { sender?: string };
    if (!CODE_RE.test(code)) return reply.code(400).send({ message: '房间号须为 4 位数字' });

    const sender = (q.sender ?? '').trim().slice(0, 64) || `anon-${Math.random().toString(36).slice(2, 10)}`;
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const room = getRoom(code);
    const client: Client = {
      sender,
      raw,
      hb: setInterval(() => {
        try {
          raw.write(': keep-alive\n\n');
        } catch {
          /* 已断开 */
        }
      }, 15_000),
    };
    room.clients.add(client);

    // 握手 + 立刻补一份房主当前状态，加入即对齐
    raw.write(`event: ready\ndata: ${JSON.stringify({ room: code, sender, ok: true })}\n\n`);
    if (room.state) writeEvent(client, room.state);

    const cleanup = () => {
      clearInterval(client.hb);
      room.clients.delete(client);
      room.lastActive = Date.now();
      try {
        raw.end();
      } catch {
        /* 已关闭 */
      }
    };
    req.raw.on('close', cleanup);
    req.raw.on('error', cleanup);
  });

  /** 房主上报状态：存档 + 广播（hello/source 只广播不存档） */
  app.post('/watch/room/:code/state', async (req, reply) => {
    const { code } = req.params as { code: string };
    if (!CODE_RE.test(code)) return reply.code(400).send({ message: '房间号须为 4 位数字' });
    const event = cleanEvent(req.body, code);
    if (!event) return reply.code(400).send({ message: '无效的同步事件' });

    const room = getRoom(code);
    if (event.kind === 'state') room.state = event;
    broadcast(room, event);

    // 新成员问好：除广播给房主外，服务端也直接把已知状态回给 TA，避免房主不在线时干等
    if (event.kind === 'hello' && room.state) {
      for (const c of room.clients) {
        if (c.sender === event.sender) writeEvent(c, room.state);
      }
    }
    return { ok: true, clients: room.clients.size };
  });
}

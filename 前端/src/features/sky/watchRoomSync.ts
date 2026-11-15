/**
 * 「一起看」房间同步框架（方案 C：同步框架先行，片源可后接）
 *
 * 设计原则：同步的是「播放状态」（播放/暂停/进度/倍速），不是片源本身。
 * 房主和成员可以用各自的合法片源 URL，只要放的是同一部片，进度就能对齐。
 *
 * 双通道互补，WatchPlayer 的主控场/对齐逻辑完全不用关心底层：
 *  - 通道 A：BroadcastChannel（同源多标签页；不支持时降级 localStorage storage 事件）。
 *  - 通道 B：后端 SSE 房间服务（GET /api/watch/room/:code/stream + POST .../state），负责跨设备。
 *    服务端按 sender 跳过同设备连接，所以两条通道不会重复投递；后端不可用时 POST 静默失败，
 *    自动退化为纯本地同步，页面功能不受影响。
 *
 * ⚠️ 片源必须是合法来源：自建视频库 / 已购授权 / 用户自己粘贴的合法 URL。
 *    这里不提供、也不接受任何盗版站的抓取或集成。
 */

export type WatchSyncEvent =
  /** 房主广播的完整播放状态；成员收到后对齐 */
  | { kind: 'state'; room: string; sender: string; playing: boolean; time: number; rate: number; ts: number }
  /** 新成员进房间，向房主要一次当前状态 */
  | { kind: 'hello'; room: string; sender: string }
  /** 房主换了片源（成员可自行决定是否跟随，不强制覆盖本地片源） */
  | { kind: 'source'; room: string; sender: string; title: string };

export interface WatchTransport {
  publish: (event: WatchSyncEvent) => void;
  subscribe: (fn: (event: WatchSyncEvent) => void) => () => void;
  close: () => void;
}

/** 房间号：4 位数字，够短、好口述 */
export function makeRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function senderId(): string {
  const key = 'blueberry.watch.sender.v1';
  let id = '';
  try {
    id = localStorage.getItem(key) || '';
    if (!id) {
      id = `s-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
  } catch {
    id = `s-${Math.random().toString(36).slice(2, 10)}`;
  }
  return id;
}

/**
 * 建立一条房间通道：同时挂本地通道与 SSE，发布时两路并发。
 * 上层只调 publish/subscribe，不需要知道事件是从哪条路来的。
 */
export function createTransport(room: string): WatchTransport {
  const me = senderId();
  const listeners = new Set<(e: WatchSyncEvent) => void>();
  const channelName = `blueberry.watch.room.${room}`;
  let bc: BroadcastChannel | undefined;
  let es: EventSource | undefined;
  /** 心跳 state 会重复抵达，按 发送者+ts 做短时去重 */
  const seen = new Map<string, number>();

  const emit = (raw: unknown) => {
    const e = raw as WatchSyncEvent | undefined;
    // 自己发的事件不自己收，避免回声；房间号也必须一致
    if (!e || !e.kind || e.room !== room || e.sender === me) return;
    if (e.kind === 'state') {
      const key = `${e.sender}:${e.ts}`;
      const now = Date.now();
      if (now - (seen.get(key) ?? 0) < 700) return;
      seen.set(key, now);
      if (seen.size > 200) {
        for (const [k, t] of seen) if (now - t > 5000) seen.delete(k);
      }
    }
    listeners.forEach((fn) => fn(e));
  };

  /* --- 通道 A：本地同一浏览器多标签页（BroadcastChannel / storage 降级） --- */
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(channelName);
      bc.onmessage = (ev: MessageEvent) => emit(ev.data);
    } catch {
      bc = undefined;
    }
  }
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== channelName || !ev.newValue) return;
    try {
      emit(JSON.parse(ev.newValue));
    } catch {
      /* 忽略脏数据 */
    }
  };
  if (!bc && typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  /* --- 通道 B：跨设备 SSE（后端 /api/watch/room/:code/stream） --- */
  if (typeof EventSource !== 'undefined') {
    try {
      es = new EventSource(`${SSE_ENDPOINT.stream(room)}?sender=${encodeURIComponent(me)}`);
      es.onmessage = (ev: MessageEvent) => {
        try {
          emit(JSON.parse(ev.data));
        } catch {
          /* 忽略脏数据 */
        }
      };
      // 断线后 EventSource 会自动重连；期间发布仍走 POST，本地通道照常可用
      es.onerror = () => {};
    } catch {
      es = undefined;
    }
  }

  return {
    publish(event) {
      const payload = { ...event, sender: me, room } as WatchSyncEvent;
      // 本地通道始终发：服务端按 sender 跳过同设备连接，两条通道互补、不会重复
      if (bc) bc.postMessage(payload);
      else {
        try {
          // 加时间戳保证同一房间连续事件都触发 storage
          localStorage.setItem(channelName, JSON.stringify({ ...payload, _t: Date.now() }));
        } catch {
          /* 忽略配额不足 */
        }
      }
      // 跨设备通道：POST 不依赖 SSE 连接是否 established，后端不在时静默失败即可
      void fetch(SSE_ENDPOINT.publish(room), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
      seen.clear();
      bc?.close();
      es?.close();
      if (!bc && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    },
  };
}

/** 后端房间服务：SSE 单向推 + POST 上报（watchRoom.ts） */
export const SSE_ENDPOINT = {
  stream: (room: string) => `/api/watch/room/${room}/stream`,
  publish: (room: string) => `/api/watch/room/${room}/state`,
};

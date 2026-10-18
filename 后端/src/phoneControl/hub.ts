/**
 * 手机控制中枢（原生 Android 桥 ↔ 后端）。
 *
 * 通道设计（零新依赖）：
 * - 原生端（手机上的小蓝莓 Android 壳）连 `GET /api/phone-control/stream`（SSE）→ 后端把指令作为
 *   `command` 事件推下去；原生端执行完用 `POST /api/phone-control/result` 把结果回报。
 * - SSE 是单向的（server→client），结果回传走普通 POST。这样不需要引入 ws 库。
 *
 * 请求/响应关联：每次 sendCommand 生成一个 reqId，挂一个 Promise 在 pending Map 里；
 * 原生端回报对应 reqId 时解挂。超时（默认 30s）或手机离线则 reject/返回错误结果。
 *
 * 设计参考 Operit AI 的「三明治」架构：模型只负责推理，真正的设备操作走确定性的工具层
 * （Accessibility / ADB / Root），模型从不直接操作 UI。
 */

import { newId } from '../utils/id.js';

export interface PhoneCommandResult {
  ok: boolean;
  /** 执行成功的返回数据（原样透传原生端给的结构化结果，如 uiTree / screenshot 路径） */
  data?: unknown;
  /** 失败原因：PHONE_OFFLINE / TIMEOUT / NATIVE_ERROR / 原生端自定义文案 */
  error?: string;
}

export interface PhoneCommandEvent {
  reqId: string;
  tool: string;
  args: Record<string, unknown>;
}

type SendFn = (event: PhoneCommandEvent) => void;

interface Pending {
  resolve: (r: PhoneCommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

class PhoneControlHub {
  /** clientId → 推送函数（SSE 连接时注册） */
  private clients = new Map<string, SendFn>();
  /** 当前默认客户端：最后连上来的那个 */
  private activeClientId: string | null = null;
  private pending = new Map<string, Pending>();

  register(clientId: string, send: SendFn): void {
    this.clients.set(clientId, send);
    this.activeClientId = clientId;
  }

  unregister(clientId: string): void {
    if (this.clients.get(clientId)) {
      this.clients.delete(clientId);
    }
    if (this.activeClientId === clientId) {
      this.activeClientId = this.clients.size ? [...this.clients.keys()][0] : null;
    }
    // 该客户端未完成的请求一律超时回收，避免悬挂
    for (const [reqId, p] of this.pending) {
      if (p) {
        clearTimeout(p.timer);
        p.resolve({ ok: false, error: 'PHONE_OFFLINE' });
        this.pending.delete(reqId);
      }
    }
  }

  isConnected(): boolean {
    return this.clients.size > 0;
  }

  listClients(): string[] {
    return [...this.clients.keys()];
  }

  /**
   * 向已连接的原生端发一条指令并等待结果。
   * 多客户端时默认派给最近连上的；传入 clientId 可指定。
   */
  sendCommand(
    tool: string,
    args: Record<string, unknown>,
    opts: { timeoutMs?: number; clientId?: string } = {},
  ): Promise<PhoneCommandResult> {
    const clientId = opts.clientId ?? this.activeClientId;
    const send = clientId ? this.clients.get(clientId) : undefined;
    if (!send) {
      return Promise.resolve({ ok: false, error: 'PHONE_OFFLINE' });
    }
    const reqId = newId();
    const timeoutMs = opts.timeoutMs ?? 30_000;

    return new Promise<PhoneCommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        resolve({ ok: false, error: 'TIMEOUT' });
      }, timeoutMs);
      this.pending.set(reqId, { resolve, timer });
      try {
        send({ reqId, tool, args });
      } catch {
        clearTimeout(timer);
        this.pending.delete(reqId);
        resolve({ ok: false, error: 'PHONE_OFFLINE' });
      }
    });
  }

  /** 原生端回报结果，解挂对应 Promise。返回是否被接受（reqId 是否存在） */
  reportResult(reqId: string, result: PhoneCommandResult): boolean {
    const p = this.pending.get(reqId);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(reqId);
    p.resolve(result);
    return true;
  }
}

export const phoneHub = new PhoneControlHub();

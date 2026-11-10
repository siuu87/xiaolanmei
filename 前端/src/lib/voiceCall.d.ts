// 类型声明：voiceCall.js 是从 public/paivoice/voice-call.js 移植的 AGPL-3.0 上游代码（无类型）。
// 这里只声明 PaiVoiceStage 实际用到的接口，避免把整个协议客户端改写成 TS。

export interface VoiceCallHandlers {
  state?: (mode: string) => void;
  speech?: (v: boolean) => void;
  playing?: (v: boolean) => void;
  latency?: (ms: number) => void;
  transcript?: (msg: { text?: string }) => void;
  reply?: (msg: { text?: string }) => void;
  interrupted?: () => void;
  error?: (e?: string) => void;
  reconnecting?: () => void;
  resumed?: () => void;
  closed?: () => void;
  [key: string]: ((...args: never[]) => void) | undefined;
}

export interface VoiceCallOptions {
  url: string;
  video?: boolean;
  on?: VoiceCallHandlers;
  vad?: Record<string, number>;
}

export class VoiceCall {
  constructor(opts: VoiceCallOptions);
  playing: boolean;
  mode: string;
  start(): Promise<void>;
  hangup(): void;
  setMuted(yes: boolean): Promise<void>;
  barge(): boolean;
  sendText(text: string): void;
}

export default VoiceCall;

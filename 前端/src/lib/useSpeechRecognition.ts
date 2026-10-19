import { useCallback, useEffect, useRef, useState } from 'react';

export type STTStatus = 'idle' | 'listening' | 'unsupported' | 'error';

interface UseSTTOptions {
  lang?: string;
  /** 实时（未定稿）识别结果，用来给用户即时反馈 */
  onInterim?: (text: string) => void;
  /** 定稿结果 —— 拿到就直接交给调用方（这里是「转文字直接发出去」） */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

type RecCtor = new () => any;

function getRecognitionCtor(): RecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/**
 * 浏览器原生 Web Speech API 封装（语音识别 / STT）。
 *
 * - 不支持时（如某些无头环境 / 旧浏览器）`status='unsupported'`，调用方应优雅降级。
 * - `continuous=false` + `interimResults=true`：说一句、停一下就出定稿，拿到定稿立刻 `onFinal`。
 * - 只在定稿时回调一次（`doneRef` 防重），避免同一次说话被发两条。
 *
 * 真机（带麦克风的 Chrome / Edge）可用；无麦克风权限会走 `onError`。
 */
export function useSpeechRecognition(opts: UseSTTOptions) {
  const [status, setStatus] = useState<STTStatus>('idle');
  const recRef = useRef<any>(null);
  const doneRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus('unsupported');
      optsRef.current.onError?.('当前浏览器不支持语音识别');
      return;
    }
    doneRef.current = false;
    const rec = new Ctor();
    rec.lang = optsRef.current.lang ?? 'zh-CN';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = '';
      let finalText = '';
      for (let i = 0; i < (e.results?.length ?? 0); i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim && !doneRef.current) optsRef.current.onInterim?.(interim);
      if (finalText && !doneRef.current) {
        doneRef.current = true;
        setStatus('idle');
        optsRef.current.onFinal(finalText.trim());
      }
    };
    rec.onerror = (e: any) => {
      setStatus('error');
      const err = e?.error;
      optsRef.current.onError?.(
        err === 'not-allowed' || err === 'service-not-allowed'
          ? '麦克风权限被拒绝'
          : '语音识别出错，请重试',
      );
    };
    rec.onend = () => {
      setStatus('idle');
      optsRef.current.onEnd?.();
    };
    recRef.current = rec;
    try {
      rec.start();
      setStatus('listening');
    } catch {
      setStatus('error');
      optsRef.current.onError?.('无法启动语音识别');
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  return {
    status,
    listening: status === 'listening',
    isSupported: status !== 'unsupported',
    start,
    stop,
  };
}

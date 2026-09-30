import { nanoid } from 'nanoid';

/**
 * 生成全局唯一主键（同步就绪：nanoid 跨端不冲突，不用自增整数）。
 */
export function newId(): string {
  return nanoid();
}

/**
 * 统一毫秒时间戳，整数存储（同步就绪：last-write-wins 按它裁决）。
 */
export function now(): number {
  return Date.now();
}

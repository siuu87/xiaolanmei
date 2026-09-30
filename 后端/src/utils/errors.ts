import type { ErrorCode } from '../adapters/types.js';

/**
 * HTTP 状态码 → 统一错误码。
 * 上游（OpenAI 兼容）非 2xx 时用，前端据此给用户稳定的错误分类。
 */
export function mapHttpError(status: number): ErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 400 || status === 422) return 'invalid_request';
  return 'server_error';
}

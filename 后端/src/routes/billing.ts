import type { FastifyInstance } from 'fastify';
import { getAdapterConfig } from './stations.js';

/**
 * 账户余额（阶段 7 收尾）：从接入的 API 站子自动查询账户余额（人民币），不再让用户手动填。
 * 只支持提供余额查询接口的站子：DeepSeek（/user/balance）、Moonshot/Kimi（/users/me/balance）。
 * API Key 只存后端，这里用后端拿到的 key 直接请求上游，余额数字才下发前端。
 */

export interface BalanceResult {
  available: boolean;
  provider: string;
  currency: string; // CNY / USD
  balance: number; // 该货币下的余额
  source: string; // 展示用的来源 / 说明
}

const CACHE_TTL = 60_000; // 上游余额变动慢，60 秒内复用，避免前端每 30 秒刷新就打到上游
let cache: { at: number; result: BalanceResult } | null = null;

function detectProvider(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.includes('deepseek')) return 'deepseek';
    if (host.includes('moonshot')) return 'moonshot';
    if (host.includes('openai')) return 'openai';
    if (host.includes('anthropic') || host.includes('claude')) return 'anthropic';
    if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('ollama')) return 'local';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function unavailable(provider: string, source: string): BalanceResult {
  return { available: false, provider, currency: 'CNY', balance: 0, source };
}

async function fetchBalance(provider: string, origin: string, apiKey: string): Promise<BalanceResult> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const timeout = AbortSignal.timeout(8000);

  if (provider === 'deepseek') {
    // GET https://api.deepseek.com/user/balance → { is_available, balance_infos: [{ currency, total_balance, ... }] }
    const res = await fetch(`${origin}/user/balance`, { headers, signal: timeout });
    if (!res.ok) throw new Error(`DeepSeek 余额查询失败 (${res.status})`);
    const data = (await res.json()) as {
      is_available?: boolean;
      balance_infos?: { currency?: string; total_balance?: string | number }[];
    };
    const info = data.balance_infos?.[0];
    return {
      available: !!data.is_available,
      provider: 'deepseek',
      currency: info?.currency ?? 'CNY',
      balance: Number(info?.total_balance ?? 0),
      source: 'DeepSeek 账户余额',
    };
  }

  if (provider === 'moonshot') {
    // GET https://api.moonshot.cn/v1/users/me/balance → { data: { available_balance, ... } }
    const res = await fetch(`${origin}/v1/users/me/balance`, { headers, signal: timeout });
    if (!res.ok) throw new Error(`Moonshot 余额查询失败 (${res.status})`);
    const data = (await res.json()) as { data?: { available_balance?: number } };
    return {
      available: true,
      provider: 'moonshot',
      currency: 'CNY',
      balance: Number(data.data?.available_balance ?? 0),
      source: 'Moonshot 账户余额',
    };
  }

  throw new Error('该 API 暂不支持自动查余额');
}

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/billing/balance', async () => {
    const { baseUrl, apiKey } = getAdapterConfig();
    const provider = detectProvider(baseUrl);

    if (cache && Date.now() - cache.at < CACHE_TTL) return cache.result;

    const notSupported = (source: string) => {
      const result = unavailable(provider, source);
      cache = { at: Date.now(), result };
      return result;
    };

    if (provider === 'local') return notSupported('本地模型（Ollama）无需账户余额');
    if (!apiKey) return notSupported('尚未配置 API Key');
    if (provider === 'openai' || provider === 'anthropic') return notSupported('该站子需在网页端查看余额');

    let result: BalanceResult;
    try {
      result = await fetchBalance(provider, new URL(baseUrl).origin, apiKey);
    } catch (err) {
      result = unavailable(provider, (err as Error).message);
    }
    cache = { at: Date.now(), result };
    return result;
  });
}

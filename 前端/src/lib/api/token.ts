import { request } from './conversations';

export interface TokenBucket {
  input: number;
  output: number;
  total: number;
  cost: number;
  calls: number;
}

export interface TokenStats {
  totals: TokenBucket;
  byModel: (TokenBucket & { model: string; stationName: string })[];
  byStation: (TokenBucket & { stationId: string | null; name: string })[];
  byDay: (TokenBucket & { date: string })[];
  byFeature: (TokenBucket & { featureType: string })[];
  byConversation: { conversationId: string; title: string; total: number; calls: number; cost: number }[];
}

export interface TokenUsageRow {
  id: string;
  timestamp: number;
  conversationId: string | null;
  conversationTitle: string | null;
  featureType: string;
  model: string | null;
  tokenInput: number;
  tokenOutput: number;
  tokenTotal: number;
  estimatedCost: number | null;
  latencyMs: number | null;
  status: string;
}

export const getTokenStats = (days = 30) =>
  request<TokenStats>(`/api/token/stats?days=${days}`);

export const getTokenUsage = (limit = 50) =>
  request<TokenUsageRow[]>(`/api/token/usage?limit=${limit}`);

/** 下载 CSV：拼接后端导出接口，触发浏览器另存。 */
export async function exportTokenCsv(): Promise<void> {
  const res = await fetch('/api/token/export');
  if (!res.ok) throw new Error(`导出失败 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'token-usage.csv';
  a.click();
  URL.revokeObjectURL(url);
}

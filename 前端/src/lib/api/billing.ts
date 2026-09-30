import { request } from './conversations';

export interface BillingBalance {
  available: boolean;
  provider: string;
  currency: string; // CNY / USD
  balance: number; // 该货币下的余额
  source: string; // 展示用的来源 / 说明
}

/** 从后端自动查询接入 API 的账户余额（人民币，后端用 Key 直连上游）。 */
export const getBillingBalance = () => request<BillingBalance>('/api/billing/balance');

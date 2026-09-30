/**
 * 统一 API 客户端：前端只走 /api/*，由 Vite 代理到后端（生产由 nginx 反代）。
 * API Key 永远不经过前端。
 */
export const API_BASE = '/api';

export interface HealthResponse {
  status: string;
  service: string;
  port: number;
  time: number;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
}

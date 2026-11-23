import { request } from './conversations';

/** AI 生成的小游戏（后端 data/games 托管，前端只负责展示） */
export interface AiGame {
  id: string;
  title: string;
  description: string;
  createdAt: number;
}

export async function listAiGames(): Promise<AiGame[]> {
  try {
    const r = await request<{ games: AiGame[] }>('/api/games');
    return Array.isArray(r?.games) ? r.games : [];
  } catch {
    return [];
  }
}

export function aiGameFileUrl(id: string): string {
  return `/api/games/${encodeURIComponent(id)}/file`;
}

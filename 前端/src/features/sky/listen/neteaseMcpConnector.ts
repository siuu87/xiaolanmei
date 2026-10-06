// ===== 网易云音乐 MCP 接入点（占位）=====
// 后续接入真实网易云音乐 MCP 时，只需替换本文件的占位实现，
// 组件层（UserAuthWidget / PlayerCard / LyricsPanel / RecommendList）无需改动。
// 所有数据均为占位，不涉及真实账号。

export interface NeteaseUser {
  userId: string;
  nickname: string;
  avatarUrl: string;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
  translation?: string;
}

export interface PlaylistTab {
  key: string;
  label: string;
  tracks: Track[];
}

/** 模拟网络延迟，让占位接口更像真实的异步 MCP 调用 */
function mock<T>(data: T, delay = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), delay));
}

// MCP 接入点：连接状态
export function getMcpConnectionStatus(): Promise<{ connected: boolean; source: string }> {
  return mock({ connected: false, source: 'netease-cloud-music-mcp' });
}

// MCP 接入点：二维码登录（返回二维码与票据；真实实现调网易云 MCP 登录接口）
export function loginWithQrCode(): Promise<{ qrImageUrl: string; ticket: string }> {
  return mock({ qrImageUrl: '', ticket: 'placeholder-ticket' });
}

// MCP 接入点：用户资料（登录成功后拉取）
export function getUserProfile(): Promise<NeteaseUser> {
  return mock({ userId: 'placeholder-user', nickname: '小蓝莓', avatarUrl: '🫐' });
}

// MCP 接入点：当前播放曲目
export function getCurrentTrack(): Promise<Track> {
  return mock({ id: 'track-qingtian', name: '晴天', artist: '周杰伦', album: '叶惠美', durationMs: 269000 });
}

// MCP 接入点：歌词（含双语占位）
export function getLyrics(): Promise<LyricLine[]> {
  return mock([
    { timeMs: 0, text: '故事的小黄花', translation: 'The little yellow flower of the story' },
    { timeMs: 15000, text: '从出生那年就飘着', translation: 'Has been drifting since the year I was born' },
    { timeMs: 30000, text: '童年的荡秋千', translation: 'The swing of childhood' },
    { timeMs: 45000, text: '随记忆一直晃到现在', translation: 'Still swaying with my memory' },
    { timeMs: 60000, text: 'Re So So Si Do Si La', translation: '' },
    { timeMs: 75000, text: 'So La Si Si Si Si La Si La So', translation: '' },
    { timeMs: 90000, text: '吹着前奏望着天空', translation: 'Blowing the prelude, gazing at the sky' },
    { timeMs: 105000, text: '我想起花瓣试着掉落', translation: 'I think of petals trying to fall' },
  ]);
}

// MCP 接入点：推荐歌单（分 Tab 返回）
export function getRecommendPlaylist(): Promise<PlaylistTab[]> {
  return mock([
    {
      key: 'daily',
      label: '每日推荐',
      tracks: [
        { id: 'd1', name: '起风了', artist: '买辣椒也用券', album: '起风了', durationMs: 305000 },
        { id: 'd2', name: '光年之外', artist: '邓紫棋', album: '光年之外', durationMs: 235000 },
        { id: 'd3', name: '平凡之路', artist: '朴树', album: '猎户星座', durationMs: 301000 },
      ],
    },
    {
      key: 'mine',
      label: '我的歌单',
      tracks: [
        { id: 'm1', name: '晴天', artist: '周杰伦', album: '叶惠美', durationMs: 269000 },
        { id: 'm2', name: '后来', artist: '刘若英', album: '我等你', durationMs: 330000 },
      ],
    },
    {
      key: 'queue',
      label: '播放队列',
      tracks: [
        { id: 'q1', name: '晴天', artist: '周杰伦', album: '叶惠美', durationMs: 269000 },
        { id: 'q2', name: '夜曲', artist: '周杰伦', album: '十一月的萧邦', durationMs: 226000 },
      ],
    },
  ]);
}

/** 毫秒 → mm:ss */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

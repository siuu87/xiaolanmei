import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Headphones, UserRound } from 'lucide-react';
import { UserAuthWidget } from './listen/UserAuthWidget';
import { PlayerCard } from './listen/PlayerCard';
import { LyricsPanel } from './listen/LyricsPanel';
import { PlaylistSection } from './listen/PlaylistSection';
import { streamChat } from '@/lib/api/chatStream';
import {
  getCurrentTrack,
  getListeningHistory,
  getLyrics,
  type Track,
  type LyricLine,
} from './listen/neteaseMcpConnector';

/**
 * LISTEN（音乐播放页）：
 * 一起听状态栏 + 沉浸式播放区（无卡片）+ 歌词 + 推荐列表。
 * 黑金配色、无星空背景。预留网易云音乐 MCP 接入点（见 ./listen/neteaseMcpConnector.ts）。
 */
export function ListenPage() {
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [aiPicking, setAiPicking] = useState(false);

  useEffect(() => {
    getCurrentTrack().then(setTrack);
    getLyrics().then(setLines);
  }, []);

  // 模拟播放进度（接入真实 MCP 音频源后替换）
  useEffect(() => {
    if (!playing || !track) return;
    const timer = setInterval(() => {
      setProgressMs((p) => (p + 1000 >= track.durationMs ? 0 : p + 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, track]);

  const toggle = () => setPlaying((p) => !p);
  const seek = (ms: number) => setProgressMs(ms);
  // 上一曲 / 下一曲（占位）：真实实现切 MCP 播放队列
  const prev = () => setProgressMs(0);
  const next = () => setProgressMs(0);

  // 列表点播放：切到该曲并开始播放
  const playTrack = (t: Track) => {
    setTrack(t);
    setProgressMs(0);
    setPlaying(true);
  };

  // 双爱心：AI 选一首歌并播放
  const aiPick = async () => {
    if (aiPicking) return;
    setAiPicking(true);
    try {
      const history = await getListeningHistory();
      const list = history.map((t) => `${t.name} - ${t.artist}`).join('、');
      const prompt = `以下是用户最近的听歌记录：${list || '（暂无记录）'}。\n请据此推荐 1 首用户可能喜欢的中文歌。\n严格只返回一个 JSON 对象，形如 {"name":"歌名","artist":"歌手"}，不要输出任何其它文字。`;
      let acc = '';
      await streamChat([{ role: 'user', content: prompt }], {
        onDelta: (t) => {
          acc += t;
        },
        onError: () => {},
      });
      const m = acc.match(/\{[\s\S]*?\}/);
      if (m) {
        const obj = JSON.parse(m[0]) as { name?: unknown; artist?: unknown };
        if (obj && typeof obj.name === 'string' && obj.name.trim()) {
          setTrack({
            id: 'ai-pick',
            name: obj.name.trim(),
            artist: typeof obj.artist === 'string' ? obj.artist.trim() : '',
            album: '',
            durationMs: 240000,
          });
          setProgressMs(0);
          setPlaying(true);
        }
      }
    } catch {
      // 忽略解析 / 网络错误
    } finally {
      setAiPicking(false);
    }
  };

  return (
    <div className="relative min-h-full bg-black text-[#E0E0E0]">
      <div className="relative mx-auto w-full max-w-md px-4 py-6">
        {/* 顶部导航栏：标题 + 用户状态 */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/sky')}
              aria-label="返回"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#8A8A8A] transition hover:bg-white/10 hover:text-[#E0E0E0]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-bold text-[#E0E0E0]">LISTEN</h1>
          </div>
          <UserAuthWidget />
        </header>

        {/* 主体：一起听状态栏在最上方，其次才是歌曲信息 */}
        <div className="mt-6 space-y-6">
          {/* 一起听状态栏：两个头像连着一只耳机 */}
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#E6C45A] to-[#B8860B] ring-1 ring-[#D4AF37]/40">
              <UserRound className="h-3.5 w-3.5 text-black" />
            </div>
            <span className="h-px w-4 bg-[#D4AF37]/40" />
            <Headphones className="h-4 w-4 text-[#D4AF37]" />
            <span className="h-px w-4 bg-[#D4AF37]/40" />
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#8a6a1f] to-[#3c2f0d] ring-1 ring-[#D4AF37]/40">
              <UserRound className="h-3.5 w-3.5 text-[#E6C45A]" />
            </div>
            <span className="ml-1 text-xs text-[#8A8A8A]">一起听</span>
          </div>

          <PlayerCard
            track={track}
            playing={playing}
            progressMs={progressMs}
            onToggle={toggle}
            onPrev={prev}
            onNext={next}
            onSeek={seek}
            onAiPick={() => void aiPick()}
            aiPicking={aiPicking}
          />
          <LyricsPanel progressMs={progressMs} lines={lines} />
          <PlaylistSection onPlayTrack={playTrack} />
        </div>
      </div>
    </div>
  );
}

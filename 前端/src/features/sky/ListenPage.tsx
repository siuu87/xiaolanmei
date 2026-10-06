import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StarBackdrop } from './StarBackdrop';
import { UserAuthWidget } from './listen/UserAuthWidget';
import { PlayerCard } from './listen/PlayerCard';
import { LyricsPanel } from './listen/LyricsPanel';
import { PlaylistSection } from './listen/PlaylistSection';
import { getCurrentTrack, getLyrics, type Track, type LyricLine } from './listen/neteaseMcpConnector';

/**
 * 一起听（音乐播放页）：
 * 顶部导航栏（标题 + 用户登录）+ 核心播放卡片 + 歌词 + 推荐列表。
 * 默认手机模式：单列堆叠（先不做平板/桌面分栏）。
 * 预留网易云音乐 MCP 接入点（见 ./listen/neteaseMcpConnector.ts）。
 */
export function ListenPage() {
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);

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

  return (
    <div className="relative min-h-full bg-[#070b1a] text-slate-200">
      <StarBackdrop />

      <div className="relative mx-auto w-full max-w-md px-4 py-6">
        {/* 顶部导航栏：标题 + 用户状态 */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/sky')}
              aria-label="返回"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-bold text-slate-100">LISTEN</h1>
          </div>
          <UserAuthWidget />
        </header>

        {/* 主体：手机单列堆叠 */}
        <div className="space-y-6">
          <PlayerCard
            track={track}
            playing={playing}
            progressMs={progressMs}
            onToggle={toggle}
            onPrev={prev}
            onNext={next}
            onSeek={seek}
          />
          <LyricsPanel progressMs={progressMs} lines={lines} />
          <PlaylistSection />
        </div>
      </div>
    </div>
  );
}

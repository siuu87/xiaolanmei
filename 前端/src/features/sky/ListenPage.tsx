import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAuthWidget } from './listen/UserAuthWidget';
import { PlayerCard } from './listen/PlayerCard';
import { LyricsPanel } from './listen/LyricsPanel';
import { PlaylistSection } from './listen/PlaylistSection';
import { useProfileStore } from '@/stores/profileStore';
import { getCurrentTrack, getLyrics, type Track, type LyricLine } from './listen/neteaseMcpConnector';

/** 一起听声波：三根竖条随播放跳动，暂停时变短停止 */
function SoundWave({ playing }: { playing: boolean }) {
  const heights = [10, 20, 10];
  return (
    <div className="flex h-5 items-center gap-[3px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn('w-[3px] rounded-full bg-[#D4AF37] transition-all duration-300', playing && 'soundwave-bar')}
          style={{ height: playing ? h : 4, animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

/**
 * LISTEN（音乐播放页）：
 * 顶部「一起听」双头像 + 声波 + 沉浸式播放区 + 歌词 + 推荐列表。
 * 黑金配色、无星空背景。预留网易云音乐 MCP 接入点（见 ./listen/neteaseMcpConnector.ts）。
 */
export function ListenPage() {
  const navigate = useNavigate();
  const myAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';

  const [track, setTrack] = useState<Track | null>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progressMs, setProgressMs] = useState(0);

  useEffect(() => {
    getCurrentTrack().then(setTrack);
  }, []);

  // 歌词自动调取：切歌时按当前曲目重新拉取
  useEffect(() => {
    getLyrics(track).then(setLines);
  }, [track]);

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

        {/* 主体：手机单列堆叠 */}
        <div className="mt-6 space-y-6">
          {/* 顶部连接区：双头像 + 声波 */}
          <div className="flex items-center justify-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-2xl ring-1 ring-[#D4AF37]/30">
              {myAvatar}
            </div>
            <SoundWave playing={playing} />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-2xl ring-1 ring-[#D4AF37]/30">
              {taAvatar}
            </div>
          </div>

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
          <PlaylistSection onPlayTrack={playTrack} />
        </div>
      </div>
    </div>
  );
}

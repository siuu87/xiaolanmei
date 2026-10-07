import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAuthWidget } from './listen/UserAuthWidget';
import { PlayerCard } from './listen/PlayerCard';
import { LyricsPanel } from './listen/LyricsPanel';
import { PlaylistSection } from './listen/PlaylistSection';
import { useProfileStore } from '@/stores/profileStore';
import { usePlayerStore } from '@/stores/playerStore';
import { getLyrics, type LyricLine } from './listen/neteaseMcpConnector';

/** 一起听单边耳机头像：左头像戴左耳机罩，右头像戴右耳机罩（都朝内侧） */
function EarphoneAvatar({ emoji, side }: { emoji: string; side: 'left' | 'right' }) {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-2xl ring-1 ring-white/20">
      {emoji}
      <span
        className={cn(
          'absolute top-1/2 h-7 w-3 rounded-full bg-[#6B7280] ring-1 ring-white/20',
          side === 'left' ? '-right-2' : '-left-2',
        )}
      />
    </div>
  );
}

/**
 * LISTEN（音乐播放页）：
 * 双头像各戴单边耳机 → 耳机线（镰刀弧线）垂落到淡灰小卡片 → 歌词 + 推荐列表。
 * 播放状态来自全局 playerStore，与星空页黑胶播放器联动。
 */
export function ListenPage() {
  const navigate = useNavigate();
  const myAvatar = useProfileStore((s) => s.avatar) || '🫐';
  const taAvatar = useProfileStore((s) => s.partnerAvatar) || '🐰';

  const track = usePlayerStore((s) => s.track);
  const playing = usePlayerStore((s) => s.playing);
  const progressMs = usePlayerStore((s) => s.progressMs);
  const load = usePlayerStore((s) => s.load);
  const toggle = usePlayerStore((s) => s.toggle);
  const seek = usePlayerStore((s) => s.seek);
  const prev = usePlayerStore((s) => s.prev);
  const next = usePlayerStore((s) => s.next);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const [lines, setLines] = useState<LyricLine[]>([]);

  useEffect(() => {
    void load();
  }, [load]);

  // 歌词自动调取：切歌时按当前曲目重新拉取
  useEffect(() => {
    getLyrics(track).then(setLines);
  }, [track]);

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
          {/* 一起听 + 播放小卡片 */}
          <div>
            <div className="flex items-start justify-center gap-14">
              <EarphoneAvatar emoji={myAvatar} side="left" />
              <EarphoneAvatar emoji={taAvatar} side="right" />
            </div>
            {/* 耳机线（镰刀弧线）：从耳机罩垂落到卡片歌曲名处 */}
            <svg
              className="-mt-px h-9 w-full"
              viewBox="0 0 416 36"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden
            >
              <path d="M184 0 C 184 16 116 14 118 34" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M232 0 C 232 16 156 14 150 34" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="118" cy="34" r="2" fill="#9CA3AF" />
              <circle cx="150" cy="34" r="2" fill="#9CA3AF" />
            </svg>
            <PlayerCard
              track={track}
              playing={playing}
              progressMs={progressMs}
              onToggle={toggle}
              onPrev={prev}
              onNext={next}
              onSeek={seek}
            />
          </div>
          <LyricsPanel progressMs={progressMs} lines={lines} />
          <PlaylistSection onPlayTrack={playTrack} />
        </div>
      </div>
    </div>
  );
}

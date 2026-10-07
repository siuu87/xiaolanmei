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

/** 一起听声波：三根竖条随播放跳动，暂停时变短停止 */
function SoundWave({ playing }: { playing: boolean }) {
  const heights = [10, 20, 10];
  return (
    <div className="flex h-5 items-center gap-[3px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn('w-[3px] rounded-full bg-white transition-all duration-300', playing && 'soundwave-bar')}
          style={{ height: playing ? h : 4, animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

/** 一起听单边耳机头像（白色耳机塞，戴在外侧）：left 戴左耳机塞，right 戴右耳机塞 */
function EarphoneAvatar({ emoji, side }: { emoji: string; side: 'left' | 'right' }) {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-2xl ring-1 ring-white/20">
      {emoji}
      <span
        className={cn(
          'absolute top-1/2 h-3.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.35)]',
          side === 'left' ? '-left-1.5' : '-right-1.5',
        )}
      />
    </div>
  );
}

/**
 * LISTEN（音乐播放页）：
 * 左边 AI 戴左耳机（外侧）、右边我戴右耳机（外侧），中间声波随播放跳动，耳机线各自自然下垂到卡片。
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
          {/* 一起听 + 播放卡片（耳机线括号式内收，落进卡片内停在歌曲名两侧） */}
          <div className="relative">
            {/* 头像层：左 AI 戴左耳机 · 中间声波 · 右我戴右耳机（连线起点） */}
            <div className="relative h-[110px]">
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-5">
                <EarphoneAvatar emoji={taAvatar} side="left" />
                <SoundWave playing={playing} />
                <EarphoneAvatar emoji={myAvatar} side="right" />
              </div>
            </div>

            {/* 卡片 */}
            <div className="relative z-10 -mt-6">
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

            {/* 耳机线：z-20 覆盖在卡片之上，从耳机塞垂落并收口在歌曲名两侧 */}
            <svg
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[116px]"
              viewBox="0 0 416 116"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden
            >
              <path d="M121 42 C 108 78 182 78 182 116" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M295 42 C 308 78 234 78 234 116" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <LyricsPanel progressMs={progressMs} lines={lines} />
          <PlaylistSection onPlayTrack={playTrack} />
        </div>
      </div>
    </div>
  );
}

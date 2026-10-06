import { useEffect, useState } from 'react';
import { Check, Loader2, Play, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChat } from '@/lib/api/chatStream';
import {
  getDailyRecommendSongs,
  getListeningHistory,
  getPlayQueue,
  getUserPlaylists,
  type Playlist,
  type Track,
} from './neteaseMcpConnector';

type TabKey = 'daily' | 'playlists' | 'queue' | 'ai';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'daily', label: '每日推荐' },
  { key: 'playlists', label: '我的歌单' },
  { key: 'queue', label: '播放队列' },
  { key: 'ai', label: '专属推荐' },
];

/** 从 AI 回复文本里提取第一个 JSON 数组并解析为曲目列表 */
function parseTrackList(text: string): Track[] {
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as { name?: unknown; artist?: unknown }[];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.name === 'string' && x.name.trim())
      .map((x, i) => ({
        id: `ai-${i}`,
        name: String(x.name).trim(),
        artist: typeof x.artist === 'string' ? x.artist.trim() : '',
        album: '',
        durationMs: 0,
      }));
  } catch {
    return [];
  }
}

/** 单个曲目行：无封面图标，右侧「播放」+「添加」按钮；AI 推荐用金色 AI 角标 */
function TrackRow({
  track,
  ai,
  added,
  onAdd,
  onPlay,
}: {
  track: Track;
  ai?: boolean;
  added?: boolean;
  onAdd?: () => void;
  onPlay?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white/5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm text-[#E0E0E0]">
          <span className="truncate">{track.name}</span>
          {ai && (
            <span className="shrink-0 rounded-full bg-[#D4AF37]/15 px-1.5 py-0.5 text-[10px] text-[#D4AF37]">
              AI
            </span>
          )}
        </p>
        <p className="truncate text-xs text-[#8A8A8A]">{track.artist || '未知歌手'}</p>
      </div>
      {onPlay && (
        <button
          type="button"
          onClick={onPlay}
          aria-label="播放"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#D4AF37] transition hover:bg-[#D4AF37]/25"
        >
          <Play className="h-4 w-4" />
        </button>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={added ? '已添加' : '添加到队列'}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition',
            added ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'bg-white/10 text-[#E0E0E0] hover:bg-white/20',
          )}
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#8A8A8A]">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

function Empty({ text = '暂无内容' }: { text?: string }) {
  return <p className="py-10 text-center text-sm text-[#8A8A8A]">{text}</p>;
}

/** 底部列表区：每日推荐 / 我的歌单 / 播放队列 / AI 专属推荐 */
export function PlaylistSection({ onPlayTrack }: { onPlayTrack: (track: Track) => void }) {
  const [active, setActive] = useState<TabKey>('daily');
  const [daily, setDaily] = useState<Track[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [queue, setQueue] = useState<Track[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const [aiTracks, setAiTracks] = useState<Track[] | null>(null);
  const [aiFallback, setAiFallback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    getDailyRecommendSongs().then(setDaily).catch(() => setDaily([]));
    getUserPlaylists().then(setPlaylists).catch(() => setPlaylists([]));
    getPlayQueue().then(setQueue).catch(() => setQueue([]));
  }, []);

  // AI 专属推荐：点击 Tab 时触发（LLM 较慢，先展示加载动画）
  useEffect(() => {
    if (active !== 'ai') return;
    if (aiTracks || aiFallback || aiError || aiLoading) return;
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      try {
        const history = await getListeningHistory();
        const list = history.map((t) => `${t.name} - ${t.artist}`).join('、');
        const prompt = `以下是用户最近的听歌记录：${list || '（暂无记录）'}。\n请分析用户的音乐口味，推荐 5 首他可能喜欢的中文歌。\n请严格只返回一个 JSON 数组，每项含 name（歌名）和 artist（歌手）两个字段，例如：[{"name":"晴天","artist":"周杰伦"}]，不要输出任何其它文字。`;
        let acc = '';
        await streamChat([{ role: 'user', content: prompt }], {
          onDelta: (t) => {
            acc += t;
          },
          onError: (msg) => {
            setAiError(msg);
          },
        });
        if (cancelled) return;
        const tracks = parseTrackList(acc);
        if (tracks.length) setAiTracks(tracks);
        else if (acc.trim()) setAiFallback(acc.trim());
        else setAiError('AI 没有返回结果，稍后再试');
      } catch (err) {
        if (!cancelled) setAiError((err as Error).message);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, aiTracks, aiFallback, aiError, aiLoading]);

  const toggleAdd = (id: string) => {
    setAdded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-[#121212]">
      {/* Tab 切换：四等分 */}
      <div className="grid grid-cols-4 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              'relative py-3 text-center text-xs transition',
              active === t.key ? 'font-medium text-[#D4AF37]' : 'text-[#8A8A8A] hover:text-[#E0E0E0]',
            )}
          >
            {t.label}
            {active === t.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#D4AF37]" />}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div className="max-h-56 overflow-y-auto p-2">
        {active === 'daily' && (
          <>
            {daily === null ? (
              <Loading />
            ) : daily.length === 0 ? (
              <Empty text="今日推荐还未生成" />
            ) : (
              daily.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  added={added.has(t.id)}
                  onPlay={() => onPlayTrack(t)}
                  onAdd={() => toggleAdd(t.id)}
                />
              ))
            )}
          </>
        )}

        {active === 'playlists' && (
          <>
            {playlists === null ? (
              <Loading />
            ) : playlists.length === 0 ? (
              <Empty text="还没有歌单" />
            ) : (
              playlists.map((p) => (
                <div key={p.id} className="mb-2">
                  <p className="px-2 pb-1 text-xs font-medium text-[#8A8A8A]">
                    {p.name} · {p.tracks.length} 首
                  </p>
                  {p.tracks.map((t) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      added={added.has(t.id)}
                      onPlay={() => onPlayTrack(t)}
                      onAdd={() => toggleAdd(t.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {active === 'queue' && (
          <>
            {queue === null ? (
              <Loading />
            ) : queue.length === 0 ? (
              <Empty text="播放队列为空" />
            ) : (
              queue.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  added={added.has(t.id)}
                  onPlay={() => onPlayTrack(t)}
                  onAdd={() => toggleAdd(t.id)}
                />
              ))
            )}
          </>
        )}

        {active === 'ai' && (
          <>
            {aiLoading ? (
              <Loading text="正在品味你的听歌记录…" />
            ) : aiTracks && aiTracks.length ? (
              aiTracks.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  ai
                  added={added.has(t.id)}
                  onPlay={() => onPlayTrack(t)}
                  onAdd={() => toggleAdd(t.id)}
                />
              ))
            ) : aiFallback ? (
              <p className="whitespace-pre-wrap px-2 py-4 text-sm leading-6 text-[#E0E0E0]">{aiFallback}</p>
            ) : aiError ? (
              <p className="px-2 py-8 text-center text-sm text-[#8A8A8A]">{aiError}</p>
            ) : (
              <Empty text="点击后 AI 将为你生成专属推荐" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

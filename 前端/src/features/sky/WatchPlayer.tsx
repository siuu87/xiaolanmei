/**
 * WATCH · 一起看播放器（设计稿 6:8 精确还原）
 *
 * 固定深色沉浸页，不随主题换档。结构：顶栏 / 银幕 / 正在放映 / 幕标题三行画面 /
 * 进度条 / 播放控制 / 四胶囊 / 和 TA 一起看社交条。
 *
 * 方案 C：片源位先接占位画面，同步框架先跑通。
 *  - 片源：右上角「连接片源」填入合法视频直链，写入 <video src>；未填则用占位时钟。
 *  - 同步：房间状态走 watchRoomSync 的 transport（现为 BroadcastChannel，SSE 可平替）。
 *  - 房主控场，成员跟随；成员 ±15s 只做本地微调，不广播。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X, Copy, ListVideo } from 'lucide-react';
import { createTransport, makeRoomCode, type WatchTransport } from './watchRoomSync';

const SOURCE_KEY = 'blueberry.watch.source.v1';
const PLACEHOLDER_DURATION = 7110; // 01:58:30，占位片源的总时长
const RATES = [1, 1.25, 1.5, 2, 0.75];
const QUALITIES = ['1080P', '720P', '自动'];

/** 幕：按进度分段，用于「上一幕 / 下一幕」和幕标题 */
const ACTS = [
  {
    at: 0,
    title: '第一幕 · 雨夜的车',
    lines: ['路灯一盏盏往后退。', '她把额头贴在车窗上。', '收音机里放着很旧的歌。'],
  },
  {
    at: 2370,
    title: '第二幕 · 空荡的站台',
    lines: ['列车晚点了四十分钟。', '他买了两罐热咖啡。', '广播念了一串陌生的地名。'],
  },
  {
    at: 4740,
    title: '第三幕 · 海边的房间',
    lines: ['镜头从窗边慢慢推到床上。', '她翻了个身，灯还亮着。', '走廊尽头传来很轻的脚步声。'],
  },
];

function fmt(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

interface Source {
  url: string;
  title: string;
}

function readSource(): Source | null {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d.url === 'string' && d.url ? d : null;
  } catch {
    return null;
  }
}

function writeSource(s: Source | null) {
  try {
    if (s) localStorage.setItem(SOURCE_KEY, JSON.stringify(s));
    else localStorage.removeItem(SOURCE_KEY);
  } catch {
    /* 忽略隐私模式 */
  }
}

export function WatchPlayer({
  onBack,
  onOpenList,
}: {
  /** 一律回 /chat（项目约定：所有页面退出都回聊天） */
  onBack: () => void;
  onOpenList: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transportRef = useRef<WatchTransport | null>(null);

  const [source, setSource] = useState<Source | null>(() => readSource());
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(2530); // 00:42:10，与设计稿一致
  const [duration, setDuration] = useState(PLACEHOLDER_DURATION);
  const [rate, setRate] = useState(1);
  const [quality, setQuality] = useState('1080P');

  const [room, setRoom] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [peerTime, setPeerTime] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const [sourceOpen, setSourceOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  /* ----------------------------- 房间：从链接加入 ----------------------------- */
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');
    if (code && /^\d{4}$/.test(code)) {
      setRoom(code);
      setIsHost(false); // 从链接进来的一律是成员；房主是点「邀 TA」创建的那个人
    }
  }, []);

  /** 最新状态快照：transport 订阅是长生命周期闭包，必须读 ref 才拿得到当前值 */
  const stateRef = useRef({ playing, time, rate });
  stateRef.current = { playing, time, rate };

  type StatePatch = Partial<{ playing: boolean; time: number; rate: number }>;
  const broadcast = useCallback(
    (patch: StatePatch = {}) => {
      if (!isHost || !room) return;
      const cur = stateRef.current;
      transportRef.current?.publish({
        kind: 'state',
        room,
        sender: '',
        playing: patch.playing ?? cur.playing,
        time: patch.time ?? cur.time,
        rate: patch.rate ?? cur.rate,
        ts: Date.now(),
      });
    },
    [isHost, room],
  );

  /* ------------------------ 同步通道：状态对齐 + 心跳 ------------------------ */
  useEffect(() => {
    if (!room) return;
    const t = createTransport(room);
    transportRef.current = t;
    const off = t.subscribe((e) => {
      if (e.kind === 'hello') {
        // 房主收到新成员问候，立刻回一份当前状态
        if (isHost) broadcast();
        return;
      }
      if (e.kind === 'source') {
        setToast(`TA 换成了《${e.title}》`);
        return;
      }
      if (e.kind === 'state' && !isHost) {
        setPeerTime(e.time);
        setPlaying(e.playing);
        setRate(e.rate);
        // 容差 1.5s，避免每帧 seek 造成抖动；差距大才追平
        setTime((cur) => (Math.abs(cur - e.time) > 1.5 ? e.time : cur));
        const v = videoRef.current;
        if (v && Math.abs(v.currentTime - e.time) > 1.5) v.currentTime = e.time;
        if (v) {
          if (e.playing) void v.play().catch(() => {});
          else v.pause();
          v.playbackRate = e.rate;
        }
      }
    });
    // 房主建好房间立刻广播一份当前状态，成员加入即对齐，不用等 4s 心跳
    let initTimer: number | undefined;
    if (isHost) initTimer = window.setTimeout(() => broadcast(), 350);
    else t.publish({ kind: 'hello', room, sender: '' });
    return () => {
      if (initTimer) window.clearTimeout(initTimer);
      off();
      t.close();
      transportRef.current = null;
    };
    // broadcast 依赖 playing/time 变化会反复建通道，这里只在房间/角色变化时重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isHost]);

  /** 房主每 4 秒广播一次状态，成员落后时自动追平 */
  useEffect(() => {
    if (!isHost || !room) return;
    const id = window.setInterval(() => broadcast(), 4000);
    return () => window.clearInterval(id);
  }, [isHost, room, broadcast]);

  /* --------------------------- 占位时钟 / 真实视频 --------------------------- */
  useEffect(() => {
    if (source) return; // 有真实片源时由 <video> 驱动
    if (!playing) return;
    const id = window.setInterval(() => {
      setTime((t) => Math.min(duration, t + 0.25 * rate));
    }, 250);
    return () => window.clearInterval(id);
  }, [source, playing, rate, duration]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !source) return;
    v.playbackRate = rate;
    if (playing) void v.play().catch(() => {});
    else v.pause();
  }, [source, playing, rate]);

  /* --------------------------------- 控制 --------------------------------- */
  const seek = useCallback(
    (next: number, notify = true) => {
      const t = Math.max(0, Math.min(duration, next));
      setTime(t);
      const v = videoRef.current;
      if (v && source) v.currentTime = t;
      if (notify) broadcast({ time: t });
    },
    [duration, source, broadcast],
  );

  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    broadcast({ playing: next, time });
  };

  const jumpAct = (dir: -1 | 1) => {
    const idx = ACTS.reduce((acc, a, i) => (time >= a.at ? i : acc), 0);
    const target = ACTS[Math.max(0, Math.min(ACTS.length - 1, idx + dir))];
    seek(target.at);
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    broadcast({ rate: next });
  };

  const cycleQuality = () => setQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]);

  /* -------------------------------- 邀 TA -------------------------------- */
  const invite = async () => {
    const code = room || makeRoomCode();
    if (!room) {
      setRoom(code);
      setIsHost(true);
      const url = new URL(window.location.href);
      url.searchParams.set('room', code);
      window.history.replaceState({}, '', url.toString());
    }
    const link = `${window.location.origin}/watch?room=${code}`;
    // localhost 链接发给别的设备会指向 TA 自己的机器，必须提醒换成可互访的地址
    const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
    const hint = isLoopback ? '（跨设备请把 localhost 换成局域网 IP）' : '';
    try {
      await navigator.clipboard.writeText(link);
      setToast(`房间 ${code} · 链接已复制${hint}`);
    } catch {
      setToast(`房间 ${code} · 把 ${link} 发给 TA${hint}`);
    }
    window.setTimeout(() => setToast(''), 4000);
  };

  /* ------------------------------ 片源连接 ------------------------------ */
  const applySource = () => {
    const url = urlDraft.trim();
    if (!url) {
      setSource(null);
      writeSource(null);
      setDuration(PLACEHOLDER_DURATION);
      setSourceOpen(false);
      setToast('已回到占位画面');
      window.setTimeout(() => setToast(''), 3000);
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setToast('请填 http(s) 开头的视频直链');
      window.setTimeout(() => setToast(''), 3000);
      return;
    }
    const next: Source = { url, title: source?.title || '午夜场' };
    setSource(next);
    writeSource(next);
    setSourceOpen(false);
    setToast('片源已连接');
    window.setTimeout(() => setToast(''), 3000);
    if (isHost && room) {
      transportRef.current?.publish({ kind: 'source', room, sender: '', title: next.title });
    }
  };

  /* ------------------------ Esc：capture 阶段截住 ------------------------ */
  useEffect(() => {
    if (!sourceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      setSourceOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sourceOpen]);

  /* -------------------------------- 派生值 -------------------------------- */
  const act = useMemo(() => ACTS.reduce((acc, a) => (time >= a.at ? a : acc), ACTS[0]), [time]);
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const synced = !!room;
  const socialText = synced
    ? `和 TA 一起看 · 他看到 ${fmt(peerTime ?? time)} · 同步中`
    : '和 TA 一起看 · 点「邀 TA」创建放映厅';

  return (
    <div className="relative min-h-[var(--app-h)] w-full bg-watch-bg text-watch-fg">
      <div className="relative mx-auto flex min-h-[var(--app-h)] w-full max-w-[420px] flex-col px-[30px] pb-8 pt-[18px]">
        {/* 顶栏：返回圆 / 居中标题 / 右上角片源连接 */}
        <header className="relative flex h-[34px] shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回聊天"
            className="absolute left-0 top-0 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-watch-return text-[20px] leading-none text-watch-played transition hover:bg-watch-capsule"
          >
            ‹
          </button>
          <h1 className="text-[13px] tracking-[0.12em] text-watch-fg">一起看</h1>
          <button
            type="button"
            onClick={() => {
              setUrlDraft(source?.url ?? '');
              setSourceOpen(true);
            }}
            aria-label="连接片源"
            title="连接片源"
            className="absolute right-0 top-0 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-watch-return text-watch-played transition hover:bg-watch-capsule"
          >
            <Link2 className="h-[14px] w-[14px]" />
          </button>
        </header>

        {/* 银幕：有片源放 <video>，没片源显示占位画面 */}
        <button
          type="button"
          onClick={() => {
            setUrlDraft(source?.url ?? '');
            setSourceOpen(true);
          }}
          className="relative mt-[26px] flex h-[230px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-watch-surface text-left"
        >
          {source && (
            <video
              ref={videoRef}
              src={source.url}
              className="absolute inset-0 h-full w-full object-contain"
              playsInline
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
              }}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onEnded={() => setPlaying(false)}
              onError={() => {
                setToast('片源加载失败，请检查地址是否可直接播放');
                window.setTimeout(() => setToast(''), 4000);
              }}
            />
          )}
          {!source && (
            <>
              <span className="text-[18px] tracking-[0.08em] text-watch-fg">午夜场</span>
              <span className="absolute bottom-[18px] left-0 w-full text-center text-[11px] text-watch-dim">
                占位画面 · 点这里连接片源
              </span>
            </>
          )}
          {/* 银幕内时间（设计稿 y256，落在银幕下沿） */}
          <span className="absolute bottom-[8px] left-[14px] text-[11px] tabular-nums text-watch-meta">
            {fmt(time)} / {fmt(duration)}
          </span>
        </button>

        {/* 正在放映胶囊 */}
        <div className="mt-[22px] flex h-[22px] w-[96px] shrink-0 items-center justify-center rounded-[11px] bg-watch-capsule text-[11px] text-watch-gold">
          正在放映
        </div>

        {/* 幕标题 + 三行画面 */}
        <div className="mt-[66px] shrink-0">
          <p className="text-[14px] text-watch-fg">{act.title}</p>
          <div className="mt-[10px] space-y-0">
            {act.lines.map((line, i) => (
              <p key={line} className={`h-[24px] text-[13px] ${i === 1 ? 'text-watch-fg' : 'text-watch-dim'}`}>
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* 进度条 */}
        <div className="relative mt-[26px] h-[10px] shrink-0">
          <div className="absolute left-[20px] right-[20px] top-[3px] h-[4px] rounded-[2px] bg-watch-track" />
          <div
            className="absolute left-[20px] top-[3px] h-[4px] rounded-[2px] bg-watch-played"
            style={{ width: `calc((100% - 40px) * ${pct / 100})` }}
          />
          <span
            className="absolute top-[0px] h-[10px] w-[10px] rounded-full bg-watch-dot shadow"
            style={{ left: `calc(20px + (100% - 40px) * ${pct / 100} - 5px)` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={1}
            value={Math.min(time, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="播放进度"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-[10px] flex shrink-0 justify-between text-[11px] tabular-nums text-watch-dim">
          <span>{fmt(time)}</span>
          <span>{fmt(Math.max(0, duration - time))}</span>
        </div>

        {/* 播放控制：« / -15 / 大圆 / +15 / » */}
        <div className="mt-[30px] flex h-[64px] shrink-0 items-center justify-between">
          <button type="button" onClick={() => jumpAct(-1)} aria-label="上一幕" className="w-[40px] text-[18px] text-watch-meta">
            «
          </button>
          <button type="button" onClick={() => seek(time - 15, false)} aria-label="后退15秒" className="w-[44px] text-[13px] text-watch-meta">
            -15
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? '暂停' : '播放'}
            className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-watch-gold text-watch-bg shadow-lg transition hover:brightness-110"
          >
            {playing ? <span className="text-[13px]">暂停</span> : <span className="ml-[3px] text-[15px]">▶</span>}
          </button>
          <button type="button" onClick={() => seek(time + 15, false)} aria-label="前进15秒" className="w-[44px] text-[13px] text-watch-meta">
            +15
          </button>
          <button type="button" onClick={() => jumpAct(1)} aria-label="下一幕" className="w-[40px] text-[18px] text-watch-meta">
            »
          </button>
        </div>

        {/* 四胶囊 */}
        <div className="mt-[56px] flex shrink-0 items-center justify-between gap-[6px]">
          <button
            type="button"
            onClick={cycleRate}
            className="h-[30px] flex-1 rounded-[15px] bg-watch-capsule text-[11px] text-watch-played"
          >
            {rate.toFixed(2).replace(/\.00$/, '.0')}× 倍速
          </button>
          <button
            type="button"
            onClick={cycleQuality}
            className="h-[30px] flex-1 rounded-[15px] bg-watch-capsule text-[11px] text-watch-played"
          >
            画质 · {quality}
          </button>
          <button
            type="button"
            onClick={() => (synced ? setToast(`房间 ${room} · ${isHost ? '你是房主' : '跟随 TA 中'}`) : invite())}
            className="h-[30px] flex-1 rounded-[15px] bg-watch-capsule text-[11px] text-watch-played"
          >
            {synced ? '同步中' : '未同步'}
          </button>
          <button
            type="button"
            onClick={invite}
            className="h-[30px] flex-1 rounded-[15px] bg-watch-capsule text-[11px] text-watch-played"
          >
            邀 TA
          </button>
        </div>

        {/* 社交条 */}
        <div className="mt-[30px] flex h-[36px] shrink-0 items-center justify-center rounded-[18px] bg-watch-capsule px-3 text-[11px] text-watch-gold">
          <span className="truncate">{socialText}</span>
        </div>

        {/* 片单入口：原电视机 + 片单管理收在这里，功能不丢 */}
        <button
          type="button"
          onClick={onOpenList}
          className="mt-auto flex shrink-0 items-center justify-center gap-2 pt-6 text-[11px] text-watch-dim transition hover:text-watch-fg"
        >
          <ListVideo className="h-[13px] w-[13px]" />
          放映厅片单
        </button>
      </div>

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-[76px] z-[1500] -translate-x-1/2 rounded-full bg-watch-capsule px-4 py-2 text-[12px] text-watch-fg shadow-lg">
          {toast}
        </div>
      )}

      {/* 片源连接：整屏纯色不透明浮层 */}
      {sourceOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-watch-bg px-6 py-10 text-watch-fg"
            role="dialog"
            aria-modal="true"
            aria-label="连接片源"
          >
            <div className="w-full max-w-[420px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px]">连接片源</h2>
                <button
                  type="button"
                  onClick={() => setSourceOpen(false)}
                  className="flex items-center gap-1 rounded-full bg-watch-capsule px-3 py-[6px] text-[12px] text-watch-fg"
                >
                  <X className="h-[13px] w-[13px]" /> 退出
                </button>
              </div>

              <p className="mt-5 text-[12px] leading-6 text-watch-meta">
                填入<strong className="text-watch-fg">你有权使用</strong>的视频直链：自己服务器 / NAS / 云存储上的
                .mp4、.webm、.m3u8，或平台提供的合法播放地址。填好后两端用同一个地址即可；同步的是进度，不是片源本身。
              </p>

              <div className="mt-6 rounded-[12px] bg-watch-surface p-4">
                <p className="text-[11px] text-watch-dim">当前片源</p>
                <p className="mt-1 truncate text-[12px] text-watch-fg">
                  {source ? source.url : '占位画面（未连接）'}
                </p>
              </div>

              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://你的域名/videos/影片.mp4"
                className="mt-4 h-[42px] w-full rounded-[10px] bg-watch-surface px-3 text-[12px] text-watch-fg outline-none placeholder:text-watch-dim"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={applySource}
                  className="flex h-[38px] flex-1 items-center justify-center gap-1 rounded-[10px] bg-watch-gold text-[12px] text-watch-bg"
                >
                  <Copy className="h-[13px] w-[13px]" />
                  应用片源
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSource(null);
                    writeSource(null);
                    setUrlDraft('');
                    setToast('已回到占位画面');
                    window.setTimeout(() => setToast(''), 3000);
                  }}
                  className="h-[38px] rounded-[10px] bg-watch-capsule px-4 text-[12px] text-watch-played"
                >
                  清除
                </button>
              </div>

              <p className="mt-6 text-[11px] leading-5 text-watch-dim">
                ⚠️ 请勿填入盗版影视站地址（侵权且防盗链会导致播放不稳定）。DRM 加密流（Widevine / FairPlay）需要专用播放器与密钥服务，
                不能直接填进这里。
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default WatchPlayer;

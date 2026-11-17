import { useId, type ReactElement } from 'react';

/**
 * 小摆件（2026-11-17 新增礼物类型 object）：CSS/SVG 建模的小实物。
 *
 * 用户：「只要礼物，比如花束、css的建模，或者是什么别的，信件已经有了，
 * 悄悄话也可以在日记里」——信和悄悄话撤出礼物盒，礼物只留拿在手里的实物：
 * 花束（three.js 渲的）+ 这里的 SVG 小摆件。
 *
 * 每个模型一个 viewBox 200×170 的独立 SVG，浅深主题通用：
 * 玻璃用半透明白 + 高光弧，木头用暖棕，配色跟礼物盒页同一套暖调。
 */

export interface CharmPreset {
  id: CharmModelId;
  name: string;
  desc: string;
}

export type CharmModelId = 'star-jar' | 'moon-lamp' | 'snow-globe' | 'cake';

export const CHARM_PRESETS: CharmPreset[] = [
  { id: 'star-jar', name: '一瓶星星', desc: '折了一晚上的玻璃罐星星' },
  { id: 'moon-lamp', name: '月亮小夜灯', desc: '留给怕黑的人的窗台灯' },
  { id: 'snow-globe', name: '雪花球', desc: '摇一摇，就下一场小雪' },
  { id: 'cake', name: '小蛋糕', desc: '没有日子也想为你点的蜡烛' },
];

/* ------------------------------------------------------------------ */
/* ① 星星罐                                                            */
/* ------------------------------------------------------------------ */
function StarJar({ uid }: { uid: string }) {
  // 五角星路径（以原点为中心，外接半径 6）
  const star = (cx: number, cy: number, r: number, rot = 0, fill: string) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2 + (rot * Math.PI) / 180;
      pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`);
    }
    return <polygon key={`${cx}-${cy}`} points={pts.join(' ')} fill={fill} />;
  };
  return (
    <svg viewBox="0 0 200 170" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="1" stopColor="#CBDDE8" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {/* 罐身 */}
      <path
        d="M56 46 Q56 40 62 40 H138 Q144 40 144 46 V150 Q144 160 134 160 H66 Q56 160 56 150 Z"
        fill={`url(#${uid}-glass)`}
        stroke="#9FB9C9"
        strokeWidth="2.5"
      />
      {/* 罐口的罗纹 */}
      <rect x="52" y="34" width="96" height="12" rx="5" fill="#E8DCC8" stroke="#C9B694" strokeWidth="2" />
      <line x1="62" y1="37" x2="62" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      <line x1="74" y1="37" x2="74" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      <line x1="86" y1="37" x2="86" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      <line x1="98" y1="37" x2="98" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      <line x1="110" y1="37" x2="110" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      <line x1="122" y1="37" x2="122" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      <line x1="134" y1="37" x2="134" y2="43" stroke="#C9B694" strokeWidth="1.6" />
      {/* 罐底的星星堆 */}
      {star(76, 146, 7, 8, '#E8B4B8')}
      {star(95, 148, 8, -6, '#BBA9D8')}
      {star(114, 146, 7, 14, '#F2C98A')}
      {star(86, 132, 6, -12, '#9DB8D8')}
      {star(105, 131, 5.5, 20, '#E8B4B8')}
      {star(95, 119, 5, 0, '#BBA9D8')}
      {/* 玻璃高光 */}
      <path d="M66 52 Q64 90 66 140" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.7" fill="none" />
      <path d="M133 56 Q135 90 133 132" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.5" fill="none" />
      {/* 两颗飘起来的小星星（刚放进去的） */}
      {star(120, 86, 4, 10, '#F2C98A')}
      {star(72, 98, 3.6, -14, '#9DB8D8')}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ② 月亮小夜灯                                                        */
/* ------------------------------------------------------------------ */
function MoonLamp({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 200 170" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F6D98A" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#F6D98A" stopOpacity="0.18" />
          <stop offset="1" stopColor="#F6D98A" stopOpacity="0" />
        </radialGradient>
        <mask id={`${uid}-cut`}>
          <rect x="0" y="0" width="200" height="170" fill="#FFFFFF" />
          <circle cx="122" cy="62" r="34" fill="#000000" />
        </mask>
        <linearGradient id={`${uid}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE7A9" />
          <stop offset="1" stopColor="#F0C86A" />
        </linearGradient>
      </defs>
      {/* 灯的光晕 */}
      <circle cx="92" cy="66" r="62" fill={`url(#${uid}-glow)`} />
      {/* 月亮本体（右上挖圆 = 月牙） */}
      <g mask={`url(#${uid}-cut)`}>
        <circle cx="92" cy="66" r="38" fill={`url(#${uid}-moon)`} />
        {/* 月面的小坑 */}
        <circle cx="76" cy="54" r="5" fill="#E3B75B" opacity="0.75" />
        <circle cx="66" cy="74" r="3.4" fill="#E3B75B" opacity="0.6" />
        <circle cx="84" cy="86" r="2.6" fill="#E3B75B" opacity="0.6" />
      </g>
      {/* 挂绳 + 小木架 */}
      <line x1="92" y1="104" x2="92" y2="128" stroke="#B08C63" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M92 104 Q92 100 88 99" stroke="#B08C63" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {/* 木座 */}
      <path d="M56 128 H128 L120 144 H64 Z" fill="#C9A87C" />
      <rect x="58" y="126" width="70" height="6" rx="3" fill="#B08C63" />
      {/* 木座上的小刻痕 */}
      <line x1="72" y1="133" x2="72" y2="139" stroke="#A5825B" strokeWidth="1.6" />
      <line x1="92" y1="133" x2="92" y2="139" stroke="#A5825B" strokeWidth="1.6" />
      <line x1="112" y1="133" x2="112" y2="139" stroke="#A5825B" strokeWidth="1.6" />
      {/* 光的落影 */}
      <ellipse cx="92" cy="152" rx="40" ry="5" fill="#B08C63" opacity="0.2" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ③ 雪花球                                                            */
/* ------------------------------------------------------------------ */
function SnowGlobe({ uid }: { uid: string }) {
  const flakes: Array<{ x: number; y: number; r: number; o: number }> = [
    { x: 72, y: 74, r: 2.2, o: 0.9 },
    { x: 92, y: 58, r: 1.8, o: 0.8 },
    { x: 112, y: 76, r: 2.4, o: 0.9 },
    { x: 80, y: 92, r: 1.6, o: 0.7 },
    { x: 104, y: 90, r: 2, o: 0.8 },
    { x: 122, y: 96, r: 1.7, o: 0.7 },
    { x: 64, y: 96, r: 1.9, o: 0.8 },
    { x: 96, y: 104, r: 1.5, o: 0.6 },
  ];
  return (
    <svg viewBox="0 0 200 170" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-dome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#DCEBF4" stopOpacity="0.25" />
          <stop offset="1" stopColor="#CBDDE8" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* 玻璃罩 */}
      <circle cx="100" cy="86" r="56" fill={`url(#${uid}-dome)`} stroke="#9FB9C9" strokeWidth="2.5" />
      {/* 罩里的雪地 */}
      <path d="M46 92 Q70 82 100 88 Q132 94 154 90 L154 104 Q128 112 100 110 Q70 108 46 104 Z" fill="#F4F8FB" opacity="0.9" />
      {/* 小树两棵 */}
      <g>
        <path d="M86 88 L94 66 L102 88 Z" fill="#7D9270" />
        <rect x="92" y="88" width="4" height="6" fill="#8A6850" />
        <path d="M112 92 L118 74 L124 92 Z" fill="#8FA483" />
        <rect x="116" y="92" width="4" height="5" fill="#8A6850" />
      </g>
      {/* 小雪人 */}
      <g>
        <circle cx="70" cy="90" r="7" fill="#FFFFFF" stroke="#D5E2EB" strokeWidth="1" />
        <circle cx="70" cy="80" r="5" fill="#FFFFFF" stroke="#D5E2EB" strokeWidth="1" />
        <circle cx="68.4" cy="79" r="0.9" fill="#6B5340" />
        <circle cx="71.6" cy="79" r="0.9" fill="#6B5340" />
        <path d="M68 82 Q70 83.6 72 82" stroke="#C97B6E" strokeWidth="1" fill="none" strokeLinecap="round" />
      </g>
      {/* 雪花 */}
      {flakes.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.r} fill="#FFFFFF" opacity={f.o} />
      ))}
      {/* 玻璃高光 */}
      <path d="M64 58 Q60 76 66 96" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity="0.75" fill="none" />
      <path d="M136 62 Q140 78 136 92" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" opacity="0.5" fill="none" />
      {/* 木底座 */}
      <path d="M52 138 H148 L140 158 H60 Z" fill="#C9A87C" />
      <rect x="50" y="132" width="100" height="9" rx="4" fill="#B08C63" />
      {/* 底座金边 */}
      <rect x="54" y="134" width="92" height="2" rx="1" fill="#E8DCC8" opacity="0.8" />
      {/* 底影 */}
      <ellipse cx="100" cy="164" rx="52" ry="4.5" fill="#B08C63" opacity="0.18" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ④ 小蛋糕                                                            */
/* ------------------------------------------------------------------ */
function Cake({ uid }: { uid: string }) {
  return (
    <svg viewBox="0 0 200 170" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-sponge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5D9A8" />
          <stop offset="1" stopColor="#E9BE7C" />
        </linearGradient>
      </defs>
      {/* 蜡烛的火苗 */}
      <ellipse cx="100" cy="34" rx="10" ry="14" fill="#F6D98A" opacity="0.4" />
      <path d="M100 26 Q106 38 100 46 Q94 38 100 26 Z" fill="#F0A94A" />
      <path d="M100 32 Q103 39 100 44 Q97 39 100 32 Z" fill="#FBE7A9" />
      {/* 蜡烛 */}
      <rect x="96" y="46" width="8" height="26" rx="3" fill="#BBA9D8" />
      <line x1="100" y1="50" x2="100" y2="70" stroke="#A08FC4" strokeWidth="1.4" strokeDasharray="3 3" />
      {/* 上层奶油顶 */}
      <path
        d="M64 82 Q64 70 78 70 H122 Q136 70 136 82 Q136 88 130 88 Q128 80 124 88 Q120 94 114 88 Q108 96 100 88 Q92 96 86 88 Q80 94 76 88 Q72 80 70 88 Q64 88 64 82 Z"
        fill="#FFF7EA"
        stroke="#EDD9BC"
        strokeWidth="1.5"
      />
      {/* 上层蛋糕体 */}
      <path d="M68 88 H132 V108 Q132 112 128 112 H72 Q68 112 68 108 Z" fill={`url(#${uid}-sponge)`} />
      {/* 上层滴酱 */}
      <path d="M72 112 Q76 120 82 112" fill="#C97B6E" />
      <path d="M92 112 Q97 122 103 112" fill="#C97B6E" />
      <path d="M114 112 Q119 119 124 112" fill="#C97B6E" />
      {/* 下层奶油腰线 */}
      <path
        d="M52 118 Q52 112 60 112 H140 Q148 112 148 118 Q148 122 142 122 Q140 116 136 122 Q132 128 126 122 Q120 130 112 122 Q106 128 100 122 Q94 130 88 122 Q82 128 76 122 Q70 116 66 122 Q60 122 60 120 Q52 122 52 118 Z"
        fill="#FFF7EA"
        stroke="#EDD9BC"
        strokeWidth="1.5"
      />
      {/* 下层蛋糕体 */}
      <path d="M56 122 H144 V146 Q144 150 140 150 H60 Q56 150 56 146 Z" fill={`url(#${uid}-sponge)`} />
      {/* 下层滴酱 */}
      <path d="M62 150 Q68 158 75 150" fill="#C97B6E" />
      <path d="M88 150 Q94 160 101 150" fill="#C97B6E" />
      <path d="M118 150 Q124 157 130 150" fill="#C97B6E" />
      {/* 蛋糕上的小红果 */}
      <circle cx="78" cy="66" r="4" fill="#C97B6E" />
      <circle cx="124" cy="67" r="3.6" fill="#C97B6E" />
      {/* 盘子 */}
      <ellipse cx="100" cy="156" rx="62" ry="7" fill="#EFE6D6" />
      <ellipse cx="100" cy="154" rx="62" ry="6" fill="#FFFFFF" stroke="#DCCFB6" strokeWidth="1.5" />
      {/* 盘影 */}
      <ellipse cx="100" cy="166" rx="56" ry="3.5" fill="#B08C63" opacity="0.16" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const MODELS: Record<CharmModelId, (p: { uid: string }) => ReactElement> = {
  'star-jar': StarJar,
  'moon-lamp': MoonLamp,
  'snow-globe': SnowGlobe,
  cake: Cake,
};

/**
 * 小摆件渲染入口。
 * meta 没存 model 时按礼物 id 稳定挑一个（同一份礼物每次都长一样）。
 */
export function charmModelOf(id: string, meta?: string | null): CharmModelId {
  try {
    const m = (JSON.parse(meta ?? 'null') as { model?: unknown } | null)?.model;
    if (typeof m === 'string' && m in MODELS) return m as CharmModelId;
  } catch {
    /* meta 坏了就走 hash */
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CHARM_PRESETS[h % CHARM_PRESETS.length].id;
}

export function CharmView({ model, className }: { model: CharmModelId; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const M = MODELS[model];
  return (
    <div className={className}>
      <M uid={uid} />
    </div>
  );
}

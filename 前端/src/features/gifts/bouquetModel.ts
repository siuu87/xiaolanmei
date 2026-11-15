/**
 * 低多边形花束 · 程序化建模（2026-11-13）
 *
 * 移植自开源项目 CyberFlowerShop（frycarrot，MIT）的 `js/models.js`：
 * 花材全部用代码生成——花瓣是弯曲的小网格，一朵花就是"摆位置 + 换颜色"，
 * 同一朵花里同色的零件合并成一个 Mesh，一束十支也只有几十次绘制。
 *
 * 与原版的差别（都是为了让它在手机浏览器里轻一点）：
 * - 去掉了法线后处理描边（那套要多渲一遍全场景，手机上太重）；
 * - `MeshToonMaterial` 换成 `MeshLambertMaterial + flatShading`，低多边形的块面感还在；
 * - 花材目录写在这里（原版在 catalog 里），只留菜单要用的色号与花语。
 *
 * 除了 `buildBouquet()`，别的地方不要 import three 的几何 —— 花束只在这一处生成。
 */
import * as THREE from 'three';

const PI = Math.PI;
const V3 = THREE.Vector3;
type Vec3 = THREE.Vector3;

/* ------------------------------ 花材目录 ------------------------------ */

export type FlowerType = 'rose' | 'forgetmenot' | 'hyacinth' | 'sunflower' | 'hydrangea';

export interface FlowerSpec {
  name: string;
  /** 花语 */
  word: string;
  /** 一朵（一支）的直径，用来算整束的半径 */
  size: number;
  colors: { name: string; hex: string }[];
}

export const BOUQUET_CATALOG = {
  flowers: {
    rose: {
      name: '玫瑰',
      word: '永恒的爱',
      size: 0.3,
      colors: [
        { name: '烟粉', hex: '#E8B4B8' },
        { name: '豆沙红', hex: '#B5656B' },
        { name: '奶油白', hex: '#F6EFE6' },
        { name: '杏橘', hex: '#F0B183' },
        { name: '香槟', hex: '#E5CFA8' },
      ],
    },
    forgetmenot: {
      name: '勿忘我',
      word: '永恒的记忆',
      size: 0.1,
      colors: [
        { name: '雾蓝', hex: '#9AB6D6' },
        { name: '淡紫', hex: '#B9A8D6' },
        { name: '樱粉', hex: '#E9B8C6' },
        { name: '奶白', hex: '#F5F0E8' },
      ],
    },
    hyacinth: {
      name: '风信子',
      word: '说不出口的惦记',
      size: 0.14,
      colors: [
        { name: '灰紫', hex: '#8C80A8' },
        { name: '丁香紫', hex: '#A995C4' },
        { name: '雾蓝紫', hex: '#8E9BC4' },
      ],
    },
    sunflower: {
      name: '向日葵',
      word: '明目张胆的偏爱',
      size: 0.34,
      colors: [
        { name: '奶黄', hex: '#F2D06B' },
        { name: '杏橙', hex: '#E9A24E' },
        { name: '柠檬奶', hex: '#F5E3A0' },
        { name: '酒红', hex: '#A5503E' },
      ],
    },
    hydrangea: {
      name: '绣球',
      word: '满满当当的爱',
      size: 0.46,
      colors: [
        { name: '雾蓝', hex: '#A7C0D8' },
        { name: '雾紫', hex: '#BFB0D4' },
        { name: '樱粉', hex: '#E7C0CB' },
        { name: '奶绿', hex: '#C6D6BA' },
        { name: '奶白', hex: '#F3EFE6' },
      ],
    },
  } satisfies Record<FlowerType, FlowerSpec>,
  wrap: [
    { name: '牛皮', hex: '#C9A87C' },
    { name: '奶白', hex: '#F2E9DA' },
    { name: '雾粉', hex: '#E9C9CB' },
    { name: '鼠尾草绿', hex: '#B9C7AC' },
    { name: '雾蓝', hex: '#AFC1D2' },
    { name: '奶咖', hex: '#D8C3A9' },
  ],
  ribbon: [
    { name: '豆沙', hex: '#B4736E' },
    { name: '奶白', hex: '#F3EBDE' },
    { name: '雾蓝', hex: '#9DB3CA' },
    { name: '橄榄', hex: '#8C9470' },
    { name: '可可', hex: '#8A6850' },
    { name: '雾紫', hex: '#A895BC' },
  ],
  card: [
    { name: '奶白', hex: '#FBF5E9' },
    { name: '雾粉', hex: '#F6DCE0' },
    { name: '奶黄', hex: '#FAEBC0' },
    { name: '雾蓝', hex: '#DDE8F2' },
    { name: '薄荷', hex: '#DCEFE4' },
  ],
} as const;

export type CardShape = 'heart' | 'square' | 'round';

export interface BouquetOrder {
  /** type + 色号（从 1 开始）+ 支数；绣球每支按 2 支算容量 */
  flowers: { type: FlowerType; color: number; count: number }[];
  /** 包装纸色号（1 起） */
  wrap: number;
  /** 丝带色号（1 起） */
  ribbon: number;
  card: { shape: CardShape; color: number };
}

/** 一束最多 10 支（绣球算 2）；超了剪掉末尾 */
export function normalizeOrder(o: BouquetOrder): BouquetOrder {
  const out: BouquetOrder['flowers'] = [];
  let cap = 0;
  for (const f of o.flowers) {
    const w = f.type === 'hydrangea' ? 2 : 1;
    const n = Math.max(0, Math.min(f.count, Math.floor((10 - cap) / w)));
    if (n > 0) {
      out.push({ ...f, count: n });
      cap += n * w;
    }
    if (cap >= 10) break;
  }
  return {
    flowers: out.length ? out : [{ type: 'rose', color: 1, count: 3 }],
    wrap: Math.min(Math.max(1, o.wrap), BOUQUET_CATALOG.wrap.length),
    ribbon: Math.min(Math.max(1, o.ribbon), BOUQUET_CATALOG.ribbon.length),
    card: {
      shape: o.card?.shape ?? 'heart',
      color: Math.min(Math.max(1, o.card?.color ?? 1), BOUQUET_CATALOG.card.length),
    },
  };
}

/* ------------------------------ 材质与几何工具 ------------------------------ */

const GREEN = '#93A784';
const GREEN_DARK = '#7D9270';
const STEM = '#8C9E7B';
const BROWN = '#7E5F4A';
const BROWN_DARK = '#6B5040';
const POLLEN = '#EBDDAA';
const WOOD = '#CDB48F';

function mixHex(a: string, b: string, t: number): string {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return `#${c.getHexString()}`;
}

function shade(a: string, k: number): string {
  const c = new THREE.Color(a).multiplyScalar(k);
  return `#${c.getHexString()}`;
}

const matCache = new Map<string, THREE.MeshLambertMaterial>();
function mat(hex: string): THREE.MeshLambertMaterial {
  let m = matCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color: hex,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    matCache.set(hex, m);
  }
  return m;
}

/** 集合几何：丢掉 uv、重算法线（低多边形必须重算，否则块面是花的） */
function prep(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

const _o = new THREE.Object3D();
/** 先绕 Z、再绕 X（倾倒）、最后绕 Y（转角） */
function T(
  px: number,
  py: number,
  pz: number,
  rx?: number,
  ry?: number,
  rz?: number,
  s?: number | [number, number, number],
): THREE.Matrix4 {
  _o.position.set(px, py, pz);
  _o.rotation.set(rx || 0, ry || 0, rz || 0, 'YXZ');
  if (s == null) _o.scale.set(1, 1, 1);
  else if (typeof s === 'number') _o.scale.setScalar(s);
  else _o.scale.set(s[0], s[1], s[2]);
  _o.updateMatrix();
  return _o.matrix.clone();
}

const UP = new V3(0, 1, 0);
function align(pos: Vec3, dir: Vec3, spin?: number, s?: number | [number, number, number]): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  const sc =
    s == null
      ? new V3(1, 1, 1)
      : typeof s === 'number'
        ? new V3(s, s, s)
        : new V3(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(pos, q, sc);
}

const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => a.clone().multiply(b);

/** 按颜色合并零件，一种颜色一个 mesh */
class Parts {
  private buckets = new Map<string, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, hex: string) {
    const g = geo.clone().applyMatrix4(m);
    const list = this.buckets.get(hex);
    if (list) list.push(g);
    else this.buckets.set(hex, [g]);
  }

  build(userData?: Record<string, unknown>): THREE.Group {
    const group = new THREE.Group();
    this.buckets.forEach((list, hex) => {
      let n = 0;
      list.forEach((g) => {
        n += g.attributes.position.count;
      });
      const pos = new Float32Array(n * 3);
      const nor = new Float32Array(n * 3);
      let o = 0;
      list.forEach((g) => {
        pos.set(g.attributes.position.array as Float32Array, o);
        nor.set(g.attributes.normal.array as Float32Array, o);
        o += (g.attributes.position.array as Float32Array).length;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat(hex));
      if (userData) mesh.userData = userData;
      group.add(mesh);
    });
    if (userData) group.userData = userData;
    return group;
  }
}

/**
 * 花瓣 / 叶片 / 包装纸片：沿 +Y 生长，凹面朝 -Z。
 * round 0=尖头 1=圆头；kite=菱形纸片最宽处；cup=横向内卷；curl=末端外翻
 */
interface PetalOpts {
  len: number;
  wid: number;
  cup?: number;
  curl?: number;
  round?: number;
  rows?: number;
  cols?: number;
  kite?: number;
}

const petalCache = new Map<string, THREE.BufferGeometry>();
function petal(o: PetalOpts): THREE.BufferGeometry {
  const key = JSON.stringify(o);
  const hit = petalCache.get(key);
  if (hit) return hit;

  const { len, wid } = o;
  const cup = o.cup || 0;
  const curl = o.curl || 0;
  const round = o.round == null ? 0.5 : o.round;
  const rows = o.rows || 3;
  const cols = o.cols || 2;
  const pts: Vec3[] = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    let w: number;
    if (o.kite) {
      w =
        u < o.kite
          ? 0.16 + 0.84 * Math.sin((PI / 2) * (u / o.kite))
          : 1 - ((u - o.kite) / (1 - o.kite)) * 0.96;
      w *= wid;
    } else {
      w = wid * Math.pow(Math.max(0, Math.sin(PI * (0.06 + u * 0.94 * (1 - 0.4 * round)))), 0.75);
    }
    for (let j = 0; j <= cols; j++) {
      const v = -1 + (2 * j) / cols;
      pts.push(new V3(v * w, u * len, -cup * v * v * w + curl * u * u * len));
    }
  }
  const arr: number[] = [];
  const P = (i: number, j: number) => pts[i * (cols + 1) + j];
  const push = (p: Vec3) => arr.push(p.x, p.y, p.z);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = P(i, j);
      const b = P(i, j + 1);
      const c = P(i + 1, j + 1);
      const d = P(i + 1, j);
      push(a);
      push(b);
      push(c);
      push(a);
      push(c);
      push(d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  petalCache.set(key, g);
  return g;
}

interface RingOpts {
  r: number;
  y?: number;
  tilt: number;
  phase?: number;
  rng?: () => number;
  jitter?: number;
  tiltJitter?: number;
}

function ring(
  parts: Parts,
  M: THREE.Matrix4,
  n: number,
  geo: THREE.BufferGeometry,
  hex: string | ((k: number) => string),
  o: RingOpts,
) {
  for (let k = 0; k < n; k++) {
    const a = (o.phase || 0) + (k * 2 * PI) / n + (o.rng ? (o.rng() - 0.5) * (o.jitter || 0) : 0);
    const tilt = o.tilt + (o.rng ? (o.rng() - 0.5) * (o.tiltJitter || 0) : 0);
    const h = typeof hex === 'function' ? hex(k) : hex;
    parts.add(geo, mul(M, T(Math.sin(a) * o.r, o.y || 0, Math.cos(a) * o.r, tilt, a, 0)), h);
  }
}

const G = {
  ico0: prep(new THREE.IcosahedronGeometry(1, 0)),
  ico1: prep(new THREE.IcosahedronGeometry(1, 1)),
  cyl5: prep(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true)),
  disc10: prep(new THREE.CylinderGeometry(1, 1, 1, 10, 1, false)),
  dome8: prep(new THREE.SphereGeometry(1, 8, 3, 0, PI * 2, 0, PI / 2)),
  bell: prep(new THREE.ConeGeometry(1, 1, 5, 1, true)),
};

function stemBetween(parts: Parts, a: Vec3, b: Vec3, r: number, hex: string) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  const mid = new V3().addVectors(a, b).multiplyScalar(0.5);
  parts.add(G.cyl5, align(mid, dir, 0, [r, len, r]), hex);
}

function addLeaf(parts: Parts, pos: Vec3, dir: Vec3, spin: number, len: number, hex: string) {
  parts.add(
    petal({ len, wid: len * 0.3, cup: 0.4, curl: 0.18, round: 0, rows: 4 }),
    align(pos, dir, spin),
    hex,
  );
}

/* ------------------------------ 五种花 ------------------------------ */

type Rng = () => number;

function buildRose(parts: Parts, M: THREE.Matrix4, hex: string, rng: Rng) {
  const inner = shade(hex, 0.86);
  const mid = shade(hex, 0.94);
  parts.add(G.ico0, mul(M, T(0, 0.075, 0, 0.3, rng() * 3, 0, [0.05, 0.07, 0.05])), inner);
  ring(parts, M, 3, petal({ len: 0.12, wid: 0.07, cup: 0.9, round: 0.8 }), inner, {
    r: 0.02,
    tilt: 0.12,
    phase: rng() * 6,
  });
  ring(parts, M, 5, petal({ len: 0.15, wid: 0.095, cup: 0.75, round: 0.9, curl: 0.05 }), mid, {
    r: 0.032,
    tilt: 0.45,
    phase: rng() * 6,
    rng,
    jitter: 0.3,
    tiltJitter: 0.15,
  });
  ring(parts, M, 5, petal({ len: 0.165, wid: 0.115, cup: 0.55, round: 1, curl: 0.2 }), hex, {
    r: 0.045,
    tilt: 0.9,
    phase: rng() * 6,
    rng,
    jitter: 0.3,
    tiltJitter: 0.2,
  });
  ring(parts, M, 5, petal({ len: 0.08, wid: 0.025, cup: 0.3, round: 0 }), GREEN_DARK, {
    r: 0.02,
    y: -0.005,
    tilt: 1.95,
    phase: rng() * 6,
  });
  parts.add(G.ico0, mul(M, T(0, -0.005, 0, 0, 0, 0, [0.035, 0.03, 0.035])), GREEN_DARK);
}

function buildForgetMeNot(parts: Parts, M: THREE.Matrix4, hex: string, rng: Rng) {
  const light = mixHex(hex, '#FFFFFF', 0.25);
  const petalG = petal({ len: 0.036, wid: 0.03, cup: 0.25, round: 1, rows: 2 });
  const spots: [number, number, number][] = [[0, 0.135, 0]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2 + rng();
    const p = 0.75;
    spots.push([
      Math.sin(a) * Math.sin(p) * 0.075,
      0.07 + Math.cos(p) * 0.075,
      Math.cos(a) * Math.sin(p) * 0.075,
    ]);
  }
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * PI * 2 + rng();
    const p = 1.35;
    spots.push([
      Math.sin(a) * Math.sin(p) * 0.09,
      0.07 + Math.cos(p) * 0.09,
      Math.cos(a) * Math.sin(p) * 0.09,
    ]);
  }
  const base = new V3(0, 0, 0).applyMatrix4(M);
  spots.forEach((s, i) => {
    const local = new V3(s[0], s[1], s[2]);
    const dir = new V3(s[0], s[1] - 0.04, s[2]).normalize();
    const world = local.clone().applyMatrix4(M);
    const dirW = dir.clone().transformDirection(M);
    const F = align(world, dirW, rng() * 6);
    const col = i % 3 === 0 ? light : hex;
    ring(parts, F, 5, petalG, col, { r: 0.004, tilt: 1.3 });
    parts.add(G.ico0, mul(F, T(0, 0.004, 0, 0, 0, 0, 0.011)), POLLEN);
    stemBetween(parts, base, world.clone().sub(dirW.clone().multiplyScalar(0.006)), 0.0035, STEM);
  });
}

function buildHyacinth(parts: Parts, M: THREE.Matrix4, hex: string, rng: Rng) {
  const alt = shade(hex, 0.9);
  const light = mixHex(hex, '#FFFFFF', 0.2);
  const star = petal({ len: 0.026, wid: 0.017, cup: 0.2, round: 0.3, rows: 2 });
  stemBetween(parts, new V3(0, 0, 0).applyMatrix4(M), new V3(0, 0.34, 0).applyMatrix4(M), 0.012, STEM);
  const levels = 6;
  for (let L = 0; L < levels; L++) {
    const y = 0.03 + L * 0.052;
    const rr = 0.05 * (1 - L * 0.1);
    const cnt = L > 3 ? 5 : 6;
    for (let k = 0; k < cnt; k++) {
      const a = (k / cnt) * PI * 2 + L * 0.55 + rng() * 0.2;
      const dir = new V3(Math.sin(a), 0.35, Math.cos(a)).normalize();
      const F = mul(M, align(new V3(Math.sin(a) * rr, y, Math.cos(a) * rr), dir, rng() * 6));
      const col = (k + L) % 3 === 0 ? light : (k + L) % 2 ? alt : hex;
      parts.add(G.bell, mul(F, T(0, 0.018, 0, PI, 0, 0, [0.022, 0.036, 0.022])), col);
      ring(parts, F, 5, star, col, { r: 0.016, y: 0.034, tilt: 1.75 });
    }
  }
  const bud = mixHex(hex, GREEN, 0.35);
  parts.add(G.ico0, mul(M, T(0, 0.36, 0, 0, 0, 0, 0.022)), bud);
  parts.add(G.ico0, mul(M, T(0.022, 0.335, 0.01, 0, 0, 0, 0.018)), bud);
  parts.add(G.ico0, mul(M, T(-0.015, 0.338, -0.018, 0, 0, 0, 0.018)), bud);
}

function buildSunflower(parts: Parts, M: THREE.Matrix4, hex: string, rng: Rng) {
  ring(parts, M, 10, petal({ len: 0.085, wid: 0.035, cup: 0.3, round: 0.1 }), GREEN_DARK, {
    r: 0.06,
    y: -0.005,
    tilt: 1.8,
    phase: rng() * 6,
  });
  const ph = rng() * 6;
  ring(parts, M, 12, petal({ len: 0.12, wid: 0.04, cup: 0.35, round: 0.15, curl: 0.06 }), shade(hex, 0.92), {
    r: 0.08,
    y: 0.015,
    tilt: 1.3,
    phase: ph + PI / 12,
    rng,
    jitter: 0.12,
    tiltJitter: 0.2,
  });
  ring(parts, M, 12, petal({ len: 0.13, wid: 0.042, cup: 0.3, round: 0.15, curl: -0.04 }), hex, {
    r: 0.085,
    y: 0.022,
    tilt: 1.47,
    phase: ph,
    rng,
    jitter: 0.12,
    tiltJitter: 0.15,
  });
  parts.add(G.disc10, mul(M, T(0, 0.03, 0, 0, 0, 0, [0.095, 0.03, 0.095])), BROWN);
  parts.add(G.dome8, mul(M, T(0, 0.045, 0, 0, rng(), 0, [0.08, 0.03, 0.08])), BROWN_DARK);
  parts.add(G.ico0, mul(M, T(0, -0.01, 0, 0, 0, 0, [0.05, 0.03, 0.05])), GREEN_DARK);
}

function buildHydrangea(parts: Parts, M: THREE.Matrix4, hex: string, rng: Rng) {
  const light = mixHex(hex, '#FFFFFF', 0.22);
  const deep = shade(hex, 0.9);
  parts.add(G.ico1, mul(M, T(0, 0.08, 0, 0, rng() * 3, 0, [0.19, 0.13, 0.19])), shade(hex, 0.78));
  const petalG = petal({ len: 0.05, wid: 0.045, cup: 0.15, round: 1, rows: 2 });
  const N = 34;
  const ax = 0.2;
  const ay = 0.14;
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const polar = Math.acos(1 - t * 1.25);
    const az = i * 2.39996 + rng() * 0.3;
    const nx = Math.sin(polar) * Math.sin(az);
    const ny = Math.cos(polar);
    const nz = Math.sin(polar) * Math.cos(az);
    const pos = new V3(nx * ax, 0.08 + ny * ay, nz * ax);
    const nrm = new V3(nx / ax, ny / ay, nz / ax).normalize();
    const F = mul(M, align(pos, nrm, rng() * 6));
    const r = rng();
    const col = r < 0.3 ? light : r < 0.45 ? deep : hex;
    ring(parts, F, 4, petalG, col, { r: 0.004, tilt: 1.38, rng, tiltJitter: 0.3 });
    parts.add(G.ico0, mul(F, T(0, 0.006, 0, 0, 0, 0, 0.008)), POLLEN);
  }
}

const BUILDERS: Record<FlowerType, (p: Parts, M: THREE.Matrix4, hex: string, rng: Rng) => void> = {
  rose: buildRose,
  forgetmenot: buildForgetMeNot,
  hyacinth: buildHyacinth,
  sunflower: buildSunflower,
  hydrangea: buildHydrangea,
};

/* ------------------------------ 包装 / 蝴蝶结 / 贺卡 ------------------------------ */

const NECK_Y = -0.5;
const HS = 1.35;

function buildWrap(hex: string, R: number, rng: Rng): THREE.Group {
  const parts = new Parts();
  let topR = R + 0.12;
  const liner = mixHex(hex, '#FFFFFF', 0.35);
  const D = PI / 180;
  topR = R * 0.85 + 0.08;
  const layers = [
    { col: liner, h: 1.02, r: 0.05, wid: 1.0, angles: [180, 122, 238], fold: false },
    { col: hex, h: 0.86, r: 0.07, wid: 0.85, angles: [152, 208, 98, 262], fold: true },
  ];
  layers.forEach((L) => {
    const tilt = Math.atan((topR - L.r) / L.h);
    const len = L.h / Math.cos(tilt);
    const wid = topR * L.wid;
    const geo = petal({ len, wid, cup: 0.85, round: 1, curl: 0.12, rows: 6, cols: 6 });
    L.angles.forEach((deg) => {
      const a = deg * D + (rng() - 0.5) * 0.08;
      const t = tilt + (rng() - 0.5) * 0.06;
      const twist =
        L.fold && (deg < 120 || deg > 240) ? (deg < 120 ? -0.3 : 0.3) : (rng() - 0.5) * 0.1;
      parts.add(geo, T(Math.sin(a) * L.r, NECK_Y - 0.04, Math.cos(a) * L.r, t, a, twist), L.col);
    });
  });
  const lower = prep(new THREE.CylinderGeometry(0.1, 0.15, 0.6, 9, 1, true));
  parts.add(lower, T(0, NECK_Y - 0.3, 0, 0, 0.2, 0), shade(hex, 0.97));
  const lowerIn = prep(new THREE.CylinderGeometry(0.095, 0.135, 0.56, 9, 1, true));
  parts.add(lowerIn, T(0, NECK_Y - 0.29, 0, 0, 0, 0), liner);
  return parts.build();
}

function buildBow(hex: string): THREE.Group {
  const parts = new Parts();
  const dark = shade(hex, 0.88);
  const band = prep(new THREE.TorusGeometry(0.09, 0.02, 4, 10));
  parts.add(band, T(0, 0, 0, PI / 2, 0, 0, [1, 1, 0.9]), dark);
  const loop = prep(new THREE.TorusGeometry(0.1, 0.026, 4, 8));
  parts.add(loop, T(0.105, 0.025, 0.115, 0, 0.15, 0.3, [1, 0.6, 0.55]), hex);
  parts.add(loop, T(-0.105, 0.025, 0.115, 0, -0.15, -0.3, [1, 0.6, 0.55]), hex);
  const tail = petal({ len: 0.3, wid: 0.032, cup: 0.15, kite: 0.85, rows: 4 });
  parts.add(tail, T(0.02, -0.01, 0.115, 0.1, 0, PI + 0.32), dark);
  parts.add(tail, T(-0.02, -0.01, 0.12, 0.1, 0, PI - 0.38), hex);
  parts.add(G.ico0, T(0, 0, 0.118, 0.4, 0.3, 0, [0.035, 0.035, 0.03]), dark);
  const inner = parts.build();
  inner.scale.setScalar(1.2);
  inner.position.z = 0.02;
  const g = new THREE.Group();
  g.add(inner);
  g.position.y = NECK_Y;
  return g;
}

function cardShape(kind: CardShape): THREE.Shape {
  const s = new THREE.Shape();
  if (kind === 'heart') {
    s.moveTo(0, -0.13);
    s.bezierCurveTo(-0.05, -0.08, -0.15, -0.03, -0.15, 0.04);
    s.bezierCurveTo(-0.15, 0.1, -0.11, 0.135, -0.07, 0.135);
    s.bezierCurveTo(-0.03, 0.135, -0.005, 0.11, 0, 0.085);
    s.bezierCurveTo(0.005, 0.11, 0.03, 0.135, 0.07, 0.135);
    s.bezierCurveTo(0.11, 0.135, 0.15, 0.1, 0.15, 0.04);
    s.bezierCurveTo(0.15, -0.03, 0.05, -0.08, 0, -0.13);
  } else if (kind === 'round') {
    s.absarc(0, 0, 0.125, 0, PI * 2, false);
  } else {
    const w = 0.13;
    const r = 0.025;
    s.moveTo(-w + r, -w);
    s.lineTo(w - r, -w);
    s.quadraticCurveTo(w, -w, w, -w + r);
    s.lineTo(w, w - r);
    s.quadraticCurveTo(w, w, w - r, w);
    s.lineTo(-w + r, w);
    s.quadraticCurveTo(-w, w, -w, w - r);
    s.lineTo(-w, -w + r);
    s.quadraticCurveTo(-w, -w, -w + r, -w);
  }
  return s;
}

function buildCard(kind: CardShape, hex: string): THREE.Group {
  const parts = new Parts();
  const geo = new THREE.ExtrudeGeometry(cardShape(kind), {
    depth: 0.012,
    bevelEnabled: false,
    curveSegments: kind === 'round' ? 5 : 3,
  });
  geo.translate(0, 0, -0.006);
  parts.add(prep(geo), new THREE.Matrix4(), hex);
  const mini = new THREE.ExtrudeGeometry(cardShape('heart'), {
    depth: 0.004,
    bevelEnabled: false,
    curveSegments: 2,
  });
  parts.add(
    prep(mini),
    T(0, kind === 'heart' ? 0 : -0.06, 0.007, 0, 0, 0, [0.18, 0.18, 1]),
    shade(hex, 0.85),
  );
  parts.add(G.cyl5, T(0, -0.28, -0.004, 0, 0, 0, [0.006, 0.32, 0.006]), WOOD);
  return parts.build({ kind: 'card' });
}

/* ------------------------------ 整束 ------------------------------ */

function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface BouquetResult {
  root: THREE.Group;
  height: number;
  radius: number;
}

/**
 * 把一份「花束订单」变成一个 three group。
 * 同一个 order 每次生成的花完全一样（随机数用 order 的哈希做种子），
 * 所以同一份礼物不管打开几次、换哪台设备，都是同一束花。
 */
export function buildBouquet(order: BouquetOrder): BouquetResult {
  const o = normalizeOrder(order);
  const rng = mulberry32(hashStr(JSON.stringify(o)));

  const items: { type: FlowerType; color: number }[] = [];
  o.flowers.forEach((f) => {
    for (let i = 0; i < f.count; i++) items.push({ type: f.type, color: f.color });
  });
  const cat = BOUQUET_CATALOG.flowers;
  // 大花放中间
  items.sort((a, b) => cat[b.type].size - cat[a.type].size);

  const n = items.length;
  let area = 0;
  items.forEach((it) => {
    const s = cat[it.type].size;
    area += s * s;
  });
  const R = Math.max(0.12, 0.88 * HS * Math.sqrt(area));

  const root = new THREE.Group();
  const neck = new V3(0, NECK_Y + 0.02, 0);
  const focus = new V3(0, -1.0, 0);
  const rot0 = rng() * PI * 2;

  items.forEach((it, i) => {
    const spec = cat[it.type];
    const hex = spec.colors[it.color - 1]?.hex ?? spec.colors[0].hex;
    const r = n === 1 ? 0 : R * Math.sqrt(i / (n - 1)) * 0.92;
    const a = rot0 + i * 2.39996;
    const pos = new V3(
      Math.sin(a) * r,
      0.6 - 0.45 * r * r + (rng() - 0.5) * 0.04,
      Math.cos(a) * r,
    );
    if (it.type === 'hyacinth') pos.y -= 0.08;
    const dir = pos.clone().sub(focus).normalize();
    if (it.type === 'sunflower') {
      const outward = r > 0.02 ? new V3(pos.x, 0, pos.z).normalize() : new V3(0, 0, 1);
      dir.add(outward.multiplyScalar(0.75)).normalize();
    }
    dir.x += (rng() - 0.5) * 0.12;
    dir.z += (rng() - 0.5) * 0.12;
    dir.normalize();

    const M = align(pos, dir, rng() * PI * 2, HS);
    const parts = new Parts();
    BUILDERS[it.type](parts, M, hex, rng);

    const end = new V3((rng() - 0.5) * 0.05, neck.y, (rng() - 0.5) * 0.05);
    stemBetween(parts, pos.clone().sub(dir.clone().multiplyScalar(0.01)), end, 0.011, STEM);
    if (rng() < 0.6) {
      const lp = pos.clone().lerp(end, 0.35);
      const out = new V3(lp.x, 0, lp.z).normalize();
      if (!Number.isFinite(out.x)) out.set(1, 0, 0);
      addLeaf(parts, lp, out.multiplyScalar(0.8).add(new V3(0, 0.6, 0)), rng() * 6, 0.16, GREEN);
    }
    root.add(parts.build({ kind: 'flower', type: it.type }));
  });

  // 正面开口里的绿叶和花茎，衬在贺卡后面
  const filler = new Parts();
  const fz = Math.max(0.12, R * 0.3);
  for (let k = 0; k < 11; k++) {
    const fx = (k - 5) * 0.04;
    const top = new V3(fx * 2.6, 0.16 + rng() * 0.22, fz + 0.03 + (rng() - 0.5) * 0.05);
    stemBetween(filler, new V3(fx * 0.35, NECK_Y + 0.02, 0.02), top, 0.009, STEM);
    addLeaf(
      filler,
      top.clone().lerp(new V3(0, NECK_Y, 0), 0.22 + rng() * 0.1),
      new V3(fx * 5 + (rng() - 0.5), 1.1 + rng() * 0.5, 0.55),
      rng() * 6,
      0.15 + rng() * 0.08,
      k % 3 ? GREEN : GREEN_DARK,
    );
  }
  // 开口里再塞两片高一点的叶子，别让花纸的空白太抢眼（叶子必须留在纸筒内侧，
  // 一探出纸边就会变成悬空的绿叶）
  for (let k = 0; k < 3; k++) {
    const a = 0.7 + k * 1.9;
    const base = new V3(Math.sin(a) * R * 0.3, NECK_Y + 0.2, Math.cos(a) * R * 0.3);
    addLeaf(
      filler,
      base,
      new V3(Math.sin(a) * 0.5, 1.3, Math.cos(a) * 0.5 + 0.3),
      rng() * 6,
      0.19 + rng() * 0.05,
      k % 2 ? GREEN : GREEN_DARK,
    );
  }
  root.add(filler.build());

  root.add(buildWrap(BOUQUET_CATALOG.wrap[o.wrap - 1].hex, R, rng));
  root.add(buildBow(BOUQUET_CATALOG.ribbon[o.ribbon - 1].hex));

  const card = buildCard(o.card.shape, BOUQUET_CATALOG.card[o.card.color - 1].hex);
  card.children.forEach((m) => m.scale.setScalar(0.9));
  // 卡片别飘在花中间：压在包装口、往前推一点，像插在花里的小签名卡
  card.position.set(0.015, -0.2, Math.max(0.19, R * 0.32 + 0.14));
  card.rotation.set(-0.1, 0.05, 0.06, 'YXZ');
  root.add(card);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return {
    root,
    height: box.max.y - box.min.y,
    radius: Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z),
  };
}

/** 卸载时把几何都扔掉（材质是共享缓存的，不在这里清） */
export function disposeBouquet(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) m.geometry.dispose();
  });
}

/* ------------------------------ 预设与建议 ------------------------------ */

export interface BouquetPreset {
  id: string;
  name: string;
  desc: string;
  order: BouquetOrder;
}

export const BOUQUET_PRESETS: BouquetPreset[] = [
  {
    id: 'soft',
    name: '温柔混搭',
    desc: '烟粉玫瑰 + 雾蓝勿忘我，最不容易出错的一束',
    order: {
      flowers: [
        { type: 'rose', color: 1, count: 3 },
        { type: 'forgetmenot', color: 1, count: 3 },
        { type: 'hyacinth', color: 1, count: 2 },
      ],
      wrap: 2,
      ribbon: 1,
      card: { shape: 'heart', color: 2 },
    },
  },
  {
    id: 'sunny',
    name: '明目张胆',
    desc: '向日葵站中间，剩下几支奶黄配着',
    order: {
      flowers: [
        { type: 'sunflower', color: 1, count: 2 },
        { type: 'rose', color: 5, count: 3 },
        { type: 'forgetmenot', color: 4, count: 3 },
      ],
      wrap: 1,
      ribbon: 4,
      card: { shape: 'square', color: 3 },
    },
  },
  {
    id: 'mist',
    name: '雾蓝勿忘我',
    desc: '小小一束，全是蓝紫，适合说不出口的话',
    order: {
      flowers: [
        { type: 'forgetmenot', color: 1, count: 4 },
        { type: 'hyacinth', color: 3, count: 3 },
        { type: 'rose', color: 3, count: 2 },
      ],
      wrap: 5,
      ribbon: 3,
      card: { shape: 'round', color: 4 },
    },
  },
  {
    id: 'full',
    name: '满满当当',
    desc: '两球绣球压场，塞满一整束',
    order: {
      flowers: [
        { type: 'hydrangea', color: 1, count: 2 },
        { type: 'rose', color: 2, count: 4 },
        { type: 'forgetmenot', color: 2, count: 2 },
      ],
      wrap: 3,
      ribbon: 6,
      card: { shape: 'heart', color: 1 },
    },
  },
];

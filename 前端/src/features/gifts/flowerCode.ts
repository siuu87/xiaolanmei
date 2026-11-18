/**
 * 花束码（2026-11-18 二十八改）
 *
 * 花束礼物的渲染从自建 three 换成 **CyberFlowerShop 赛博花店**（frycarrot，MIT，
 * 用户指定：礼物盒的花束就用这个开源花店）。花店已自托管在 `public/flowershop/`，
 * 花束本体只是一行「花束码」：
 *
 *   [花束:玫瑰1×3,勿忘我1×2|包装纸2|丝带1|卡片:心形2|To:你|From:…|寄语:…]
 *
 * meta 里存 `{ code }` 就是花束码本体；旧礼物存的 `{ bouquet: presetId | order }`
 * 不用迁移 —— `flowerCodeOf()` 在读取时把旧格式转成码，同一个 order 转出来的码恒定。
 * 花材/色号目录和花店菜单一一对应（ bouquetModel.ts 本来就是从这家店移植的）。
 */
import { BOUQUET_CATALOG, BOUQUET_PRESETS, normalizeOrder, type BouquetOrder, type CardShape } from './bouquetModel';

/** 我们的花材 id → 花店菜单名（色号表完全一致） */
const FLOWER_NAMES: Record<keyof typeof BOUQUET_CATALOG.flowers, string> = {
  rose: '玫瑰',
  forgetmenot: '勿忘我',
  hyacinth: '紫风信子',
  sunflower: '向日葵',
  hydrangea: '绣球花',
};

const SHAPE_NAMES: Record<CardShape, string> = { heart: '心形', square: '方形', round: '圆形' };

export interface CodeOpts {
  to?: string;
  from?: string;
  message?: string;
}

/** 花店规则：字段值里不能出现 [ ] |（寄语放最后、标记单行） */
function clean(s: string): string {
  return s.replace(/[[\]|｜]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 一份花束订单 → 花束码（同一个 order 转出来的码恒定） */
export function orderToCode(order: BouquetOrder, opts: CodeOpts = {}): string {
  const o = normalizeOrder(order);
  const flowers = o.flowers.map((f) => `${FLOWER_NAMES[f.type]}${f.color}×${f.count}`).join(',');
  const segs = [`花束:${flowers}`, `包装纸${o.wrap}`, `丝带${o.ribbon}`, `卡片:${SHAPE_NAMES[o.card.shape]}${o.card.color}`];
  if (opts.to?.trim()) segs.push(`To:${clean(opts.to)}`);
  if (opts.from?.trim()) segs.push(`From:${clean(opts.from)}`);
  if (opts.message?.trim()) segs.push(`寄语:${clean(opts.message)}`);
  return `[${segs.join('|')}]`;
}

export interface FlowerGiftLike {
  id: string;
  meta?: string | null;
  content?: string;
  title?: string;
}

/**
 * 礼物 → 花束码。meta 有 `{ code }` 直接用；旧的 `{ bouquet }` 读取时转码；
 * 什么都没有就按礼物 id 稳定挑一个预设 —— 同一份礼物每次都是同一束。
 */
export function flowerCodeOf(gift: FlowerGiftLike): string {
  let raw: unknown = null;
  try {
    raw = gift.meta ? JSON.parse(gift.meta) : null;
  } catch {
    raw = null;
  }
  const m = (raw ?? {}) as { code?: unknown; bouquet?: unknown };
  if (typeof m.code === 'string' && m.code.includes('花束')) return m.code;

  const opts: CodeOpts = { to: '你', message: (gift.content ?? '').slice(0, 120) };
  const b = m.bouquet;
  if (typeof b === 'string') {
    const hit = BOUQUET_PRESETS.find((p) => p.id === b);
    if (hit) return orderToCode(hit.order, opts);
  }
  if (b && typeof b === 'object') return orderToCode(normalizeOrder(b as BouquetOrder), opts);
  let h = 0;
  const id = gift.id || 'gift';
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return orderToCode(BOUQUET_PRESETS[h % BOUQUET_PRESETS.length].order, opts);
}

/** 花束码 → 自托管花店地址（码放 hash，花店自己解析；bare=1 透明底，纪念架实物陈列用） */
export function flowerShopSrc(code: string, bare = false): string {
  return `/flowershop/index.html${bare ? '?bare=1' : ''}#${encodeURIComponent(code)}`;
}

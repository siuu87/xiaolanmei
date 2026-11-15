import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Mail, Smile, Sparkles, Flower2, Plus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/PageShell';
import { BottomSheet } from '@/components/BottomSheet';
import { useGiftStore, type Gift, type GiftType } from './giftStore';
import { patchGift } from '@/lib/api/gifts';
import {
  BOUQUET_PRESETS,
  BOUQUET_CATALOG,
  normalizeOrder,
  type BouquetOrder,
} from './bouquetModel';
import { BouquetView } from './BouquetView';

/**
 * 礼物盒（2026-11-13 改版：从冷调玻璃盒改成「暖光的纸盒 + 木架」）
 *
 * 用户：「我希望改的温馨一点，可以送花送什么的，要有渲染的实物」。
 * 所以：
 * - 底色、盒子、缎带全换成暖色纸与木头，不再是一片冷黑玻璃；
 * - 新增 **flower** 礼物：拆开是一束 three.js 渲的低多边形花，能拖着转；
 * - 拆过的礼物摆在一条木架子上，而不是丢进一个网格里。
 */

const TINT: Record<GiftType, { label: string; icon: LucideIcon; box: string; ribbon: string }> = {
  flower: { label: '花束', icon: Flower2, box: 'from-[#F6E2C8] to-[#E3BE95]', ribbon: '#B4736E' },
  letter: { label: '信', icon: Mail, box: 'from-[#F3E6D2] to-[#DCC7A6]', ribbon: '#8A6850' },
  whisper: { label: '悄悄话', icon: Heart, box: 'from-[#F8DFDC] to-[#E9B7B2]', ribbon: '#B5656B' },
  sticker: { label: '表情', icon: Smile, box: 'from-[#FAEBC0] to-[#EBD08D]', ribbon: '#C08A4A' },
  easter: { label: '彩蛋', icon: Sparkles, box: 'from-[#E2EBD8] to-[#C4D4B4]', ribbon: '#7D9270' },
};

/** meta 里读花束：可以是预设 id，也可以是完整 order；都没有就按 id 稳定挑一个 */
function resolveOrder(gift: Gift): BouquetOrder {
  let raw: unknown = null;
  try {
    raw = gift.meta ? JSON.parse(gift.meta) : null;
  } catch {
    raw = null;
  }
  const b = (raw as { bouquet?: unknown } | null)?.bouquet;
  if (typeof b === 'string') {
    const hit = BOUQUET_PRESETS.find((p) => p.id === b);
    if (hit) return hit.order;
  }
  if (b && typeof b === 'object') return normalizeOrder(b as BouquetOrder);
  // 没存：用 id 定一个，保证同一份礼物每次都长一样
  let h = 0;
  for (let i = 0; i < gift.id.length; i++) h = (h * 31 + gift.id.charCodeAt(i)) >>> 0;
  return BOUQUET_PRESETS[h % BOUQUET_PRESETS.length].order;
}

/** 花束的简称：三种主花的名字拼起来 */
function bouquetName(o: BouquetOrder): string {
  const names = o.flowers.map((f) => BOUQUET_CATALOG.flowers[f.type].name);
  return Array.from(new Set(names)).join(' · ');
}

/* ------------------------------------------------------------------ */
/* 封着的礼盒                                                          */
/* ------------------------------------------------------------------ */
function SealedBox({ gift, onOpen }: { gift: Gift; onOpen: (g: Gift) => void }) {
  const meta = TINT[gift.giftType];
  const Icon = meta.icon;
  const isFlower = gift.giftType === 'flower';
  return (
    <motion.button
      type="button"
      data-testid="gift-box"
      data-gift-type={gift.giftType}
      onClick={() => onOpen(gift)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="group relative flex w-full flex-col items-center gap-1.5"
    >
      <span className="relative block h-[86px] w-full">
        {/* 花束礼物：盒子后面先探出三支花（茎 + 花头），一眼能看出「这里面是花」 */}
        {isFlower && (
          <span aria-hidden className="absolute inset-x-0 top-0 flex justify-center">
            <svg width="56" height="20" viewBox="0 0 56 20" className="overflow-visible">
              <g stroke="#9BAE86" strokeWidth="1.1" fill="none" strokeLinecap="round">
                <path d="M28 20C28 15 22 12 17 9" />
                <path d="M28 20C28 15 28 12 28 6.5" />
                <path d="M28 20C28 15 34 12 39 9.5" />
              </g>
              {[
                { x: 17, y: 8, c: '#E8B4B8' },
                { x: 28, y: 5.5, c: '#BBA9D8' },
                { x: 39, y: 8.6, c: '#9DB8D8' },
              ].map((f, i) => (
                <g key={i} transform={`translate(${f.x} ${f.y})`}>
                  {[0, 72, 144, 216, 288].map((a) => (
                    <ellipse
                      key={a}
                      cx={Math.cos((a * Math.PI) / 180) * 3}
                      cy={Math.sin((a * Math.PI) / 180) * 3}
                      rx="2.8"
                      ry="2.8"
                      fill={f.c}
                    />
                  ))}
                  <circle r="1.6" fill="#F6E7C2" />
                </g>
              ))}
            </svg>
          </span>
        )}

        {/* 盒身 */}
        <span
          className={cn(
            'absolute inset-x-1 bottom-0 top-[18px] overflow-hidden rounded-[10px] bg-gradient-to-b shadow-[0_6px_12px_-6px_rgba(110,70,40,.35)]',
            meta.box,
          )}
        >
          {/* 盒盖 */}
          <span className="absolute inset-x-0 top-0 h-[18px] bg-white/25" />
          {/* 竖缎带 */}
          <span
            className="absolute inset-y-0 left-1/2 w-[7px] -translate-x-1/2 opacity-90"
            style={{ backgroundColor: meta.ribbon }}
          />
          {/* 横缎带 */}
          <span
            className="absolute inset-x-0 top-[18px] h-[6px] opacity-80"
            style={{ backgroundColor: meta.ribbon }}
          />
          <span className="absolute inset-0 flex items-center justify-center pt-3">
            <Icon className="h-4 w-4 text-[#6B4A32]/45" />
          </span>
        </span>

        {/* 蝴蝶结 */}
        <span aria-hidden className="absolute left-1/2 top-[14px] -translate-x-1/2">
          <span className="relative block h-3 w-6">
            <span
              className="absolute left-0 top-0 h-3 w-3 rounded-full"
              style={{ backgroundColor: meta.ribbon, opacity: 0.92 }}
            />
            <span
              className="absolute right-0 top-0 h-3 w-3 rounded-full"
              style={{ backgroundColor: meta.ribbon, opacity: 0.92 }}
            />
            <span
              className="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/70"
            />
          </span>
        </span>
      </span>

      <span className="line-clamp-1 w-full text-center text-[11px] text-[#6B5340] dark:text-[#D9C6AE]">
        {gift.title}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* 木架上的摆件                                                        */
/* ------------------------------------------------------------------ */
function Trinket({ gift, onOpen }: { gift: Gift; onOpen: (g: Gift) => void }) {
  const meta = TINT[gift.giftType];
  const Icon = meta.icon;
  return (
    <motion.button
      type="button"
      data-testid="gift-trinket"
      data-gift-type={gift.giftType}
      onClick={() => onOpen(gift)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="flex w-full flex-col items-center gap-1.5">
      {/* 影子：让摆件像「放在」木架上，而不是浮在木架前 */}
      <span aria-hidden className="relative block h-11 w-11">
        <span
          className="absolute inset-x-1.5 -bottom-1 h-2 rounded-[50%] bg-[#B08C63]/25 blur-[2px] dark:bg-black/40"
        />
        <span
          className="relative flex h-11 w-11 items-center justify-center rounded-full border bg-white/80 shadow-[0_3px_8px_-4px_rgba(110,70,40,.45)] dark:bg-white/10"
          style={{ borderColor: `${meta.ribbon}30` }}
        >
          <Icon className="h-4 w-4" style={{ color: meta.ribbon }} />
        </span>
      </span>
      <span className="line-clamp-1 w-full text-center text-[10.5px] text-[#6B5340] dark:text-[#D9C6AE]">
        {gift.title}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* 拆封层：整屏暖色舞台（纯色不透明），花束在这里渲                       */
/* ------------------------------------------------------------------ */
function UnboxOverlay({
  gift,
  onClose,
  onSwap,
}: {
  gift: Gift;
  onClose: () => void;
  onSwap: (presetId: string) => void;
}) {
  const isFlower = gift.giftType === 'flower';
  const [order, setOrder] = useState<BouquetOrder>(() => resolveOrder(gift));
  const presetId = useMemo(
    () => BOUQUET_PRESETS.find((p) => JSON.stringify(p.order) === JSON.stringify(order))?.id,
    [order],
  );

  return (
    <motion.div
      data-testid="unbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[1400] flex flex-col overflow-y-auto bg-[#FBF4E8] px-5 pb-6 pt-4 dark:bg-[#171310]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-[0.22em] text-[#A08A6E] dark:text-[#8C7A64]">
          {isFlower ? 'A BOUQUET FOR YOU' : 'A GIFT FOR YOU'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起"
          className="flex items-center gap-1 rounded-full border border-[#E4D3BB] bg-white/70 px-3 py-1.5 text-[12px] text-[#7A6249] active:scale-95 dark:border-[#3A2F25] dark:bg-[#221C16] dark:text-[#C9B69C]"
        >
          <X className="h-3.5 w-3.5" />
          收起
        </button>
      </div>

      {isFlower ? (
        <>
          <div className="relative mt-1 mx-auto w-full max-w-[420px]">
            {/* 桌上的光：花束底下那一圈暖光，让它像真的摆在桌上 */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 bottom-6 h-16 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(200,150,100,0.22),transparent_70%)]"
            />
            <BouquetView order={order} className="h-[52vh] min-h-[300px] w-full" />
          </div>

          <div className="mx-auto -mt-2 w-full max-w-[420px]">
            <p className="text-center text-[11px] tracking-[0.2em] text-[#A08A6E] dark:text-[#8C7A64]">
              {bouquetName(order)}
            </p>
            <h2 className="mt-1 text-center font-letter text-[19px] text-[#4A3A2A] dark:text-[#EADFCF]">
              {gift.title}
            </h2>
            {gift.content && (
              <p className="mt-2 whitespace-pre-wrap text-center text-[13px] leading-7 text-[#6B5340]/90 dark:text-[#C9B69C]/90">
                {gift.content}
              </p>
            )}

            {/* 换一束：只改这次的预览，不覆盖礼物本身的选择 */}
            <div className="mt-4 flex items-center justify-center gap-2">
              {BOUQUET_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`bouquet-preset-${p.id}`}
                  onClick={() => {
                    setOrder(p.order);
                    onSwap(p.id);
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition active:scale-95',
                    presetId === p.id
                      ? 'border-[#B4736E] bg-[#B4736E] text-white'
                      : 'border-[#E4D3BB] bg-white/60 text-[#8A7458] dark:border-[#3A2F25] dark:bg-[#221C16] dark:text-[#C9B69C]',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] text-[#A08A6E]/80 dark:text-[#8C7A64]/80">
              按住花束可以自己转
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-8 flex flex-col items-center">
            <span
              className={cn(
                'flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-b shadow-[0_10px_24px_-12px_rgba(110,70,40,.5)]',
                TINT[gift.giftType].box,
              )}
            >
              {(() => {
                const Icon = TINT[gift.giftType].icon;
                return <Icon className="h-8 w-8 text-[#6B4A32]/55" />;
              })()}
            </span>
            <p className="mt-4 text-[11px] tracking-[0.22em] text-[#A08A6E]">
              {TINT[gift.giftType].label}
            </p>
            <h2 className="mt-1 text-center text-[19px] text-[#4A3A2A] dark:text-[#EADFCF]">
              {gift.title}
            </h2>
            {gift.giftType === 'sticker' ? (
              <p className="mt-3 text-5xl leading-none">{gift.content}</p>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-center text-[13.5px] leading-8 text-[#6B5340]/90 dark:text-[#C9B69C]/90">
                {gift.content}
              </p>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        data-testid="unbox-keep"
        className="mx-auto mt-6 h-11 w-full max-w-[420px] rounded-2xl bg-[#B4736E] text-[14px] font-medium text-white shadow-[0_8px_20px_-10px_rgba(180,115,110,.8)] transition active:scale-[0.98]"
      >
        收下
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 摆件阅读层                                                          */
/* ------------------------------------------------------------------ */
function GiftReaderLayer({ gift, onClose }: { gift: Gift; onClose: () => void }) {
  const isFlower = gift.giftType === 'flower';
  const order = useMemo(() => resolveOrder(gift), [gift]);
  return (
    <motion.div
      data-testid="gift-reader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[1400] flex flex-col overflow-y-auto bg-[#FBF4E8] px-5 pb-6 pt-4 dark:bg-[#171310]"
      onClick={onClose}
    >
      <div className="flex items-center justify-end">
        <span className="flex items-center gap-1 rounded-full border border-[#E4D3BB] bg-white/70 px-3 py-1.5 text-[12px] text-[#7A6249] dark:border-[#3A2F25] dark:bg-[#221C16] dark:text-[#C9B69C]">
          轻点空白处收起
        </span>
      </div>
      {isFlower ? (
        <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[420px]">
          <BouquetView order={order} className="h-[50vh] min-h-[280px] w-full" />
          <p className="text-center text-[11px] tracking-[0.2em] text-[#A08A6E]">{bouquetName(order)}</p>
        </div>
      ) : null}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto mt-3 w-full max-w-[420px] rounded-2xl border border-[#E9DAC4] bg-white/70 p-5 dark:border-[#3A2F25] dark:bg-[#221C16]"
      >
        <h2 className="text-center text-[17px] text-[#4A3A2A] dark:text-[#EADFCF]">{gift.title}</h2>
        {gift.giftType === 'sticker' ? (
          <p className="mt-3 text-center text-5xl leading-none">{gift.content}</p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-center text-[13.5px] leading-8 text-[#6B5340]/90 dark:text-[#C9B69C]/90">
            {gift.content}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="gift-reader-close"
          className="mt-5 h-10 w-full rounded-xl border border-[#E4D3BB] bg-white/70 text-[13px] text-[#7A6249] active:scale-[0.98] dark:border-[#3A2F25] dark:bg-[#2A221A] dark:text-[#C9B69C]"
        >
          收回纪念架
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */
export function GiftBoxPage() {
  const gifts = useGiftStore((s) => s.gifts);
  const loaded = useGiftStore((s) => s.loaded);
  const load = useGiftStore((s) => s.load);
  const openGift = useGiftStore((s) => s.openGift);
  const seedDemo = useGiftStore((s) => s.seedDemo);
  const addGift = useGiftStore((s) => s.addGift);

  const [unboxing, setUnboxing] = useState<Gift | null>(null);
  const [reading, setReading] = useState<Gift | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded && gifts.length === 0) seedDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const unopened = gifts.filter((g) => !g.isOpened);
  const opened = gifts.filter((g) => g.isOpened);

  const handleOpen = (g: Gift) => {
    if (!g.isOpened) {
      openGift(g.id);
      setUnboxing(g);
    } else {
      setReading(g);
    }
  };

  /** 换一束：把选择写回这份礼物，下次打开还是这束 */
  const swapBouquet = (presetId: string) => {
    if (!unboxing) return;
    const meta = JSON.stringify({ bouquet: presetId });
    useGiftStore.setState((s) => ({
      gifts: s.gifts.map((g) => (g.id === unboxing.id ? { ...g, meta } : g)),
    }));
    void patchGift(unboxing.id, { meta }).catch(() => {});
  };

  return (
    <>
      <PageShell
        title="礼物盒"
        eyebrow="GIFTS"
        backTo="/chat"
        className="gift-page"
        right={
          <span className="rounded-full border border-[#E4D3BB] bg-white/60 px-2.5 py-1 text-[11px] text-[#8A7458] dark:border-[#3A2F25] dark:bg-[#221C16] dark:text-[#C9B69C]">
            {unopened.length} 待拆
          </span>
        }
      >
        {/* 未拆：一排礼盒 */}
        <section className="relative">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium tracking-[0.14em] text-[#6B5340] dark:text-[#D9C6AE]">
              未拆开的
            </h2>
            <button
              type="button"
              onClick={() => setSending(true)}
              data-testid="gift-send-flower"
              className="flex items-center gap-1 rounded-full bg-[#B4736E]/10 px-2.5 py-1 text-[11px] text-[#A05F5A] transition active:scale-95 dark:bg-[#B4736E]/20 dark:text-[#E0B4B0]"
            >
              <Plus className="h-3 w-3" />
              送一束花
            </button>
          </div>
          {unopened.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E4D3BB] bg-white/40 px-4 py-8 text-center text-[12px] text-[#A08A6E] dark:border-[#3A2F25] dark:bg-[#221C16]/60 dark:text-[#8C7A64]">
              暂时没有待拆的礼物
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-x-3 gap-y-4" data-testid="gift-unopened">
              {unopened.map((g) => (
                <SealedBox key={g.id} gift={g} onOpen={handleOpen} />
              ))}
            </div>
          )}
        </section>

        {/* 纪念架：木架 + 摆件 */}
        <section className="relative mt-8">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium tracking-[0.14em] text-[#6B5340] dark:text-[#D9C6AE]">
              纪念架
            </h2>
            <span className="text-[11px] text-[#A08A6E] dark:text-[#8C7A64]">{opened.length} 件</span>
          </div>
          {opened.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E4D3BB] bg-white/40 px-4 py-8 text-center text-[12px] text-[#A08A6E] dark:border-[#3A2F25] dark:bg-[#221C16]/60 dark:text-[#8C7A64]">
              拆开的礼物会摆在木架上
            </div>
          ) : (
            <div className="rounded-[14px] bg-gradient-to-b from-[#F3E3CC] to-[#E6CFAF] px-3 pb-2.5 pt-3 shadow-[0_10px_22px_-16px_rgba(110,70,40,.55)] dark:from-[#2A221A] dark:to-[#1F1913]">
              <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                {opened.map((g) => (
                  <Trinket key={g.id} gift={g} onOpen={handleOpen} />
                ))}
              </div>
              {/* 板面：木头的一条亮边 */}
              <div className="mt-2 h-1.5 rounded-full bg-[#C9A87C] shadow-[inset_0_1px_0_rgba(255,255,255,.5)] dark:bg-[#3A2F25]" />
            </div>
          )}
        </section>
      </PageShell>

      <AnimatePresence>
        {unboxing && (
          <UnboxOverlay
            key={unboxing.id}
            gift={unboxing}
            onClose={() => {
              setUnboxing(null);
              void load();
            }}
            onSwap={swapBouquet}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reading && <GiftReaderLayer key={reading.id} gift={reading} onClose={() => setReading(null)} />}
      </AnimatePresence>

      {/* 送一束花：挑一套预设，直接落成一份未拆礼物 */}
      <BottomSheet
        open={sending}
        onOpenChange={setSending}
        title="送一束花"
        testid="gift-send-sheet"
      >
        <div className="px-4 pb-6 pt-1">
          <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
            挑一束。送出去会先躺在「未拆开的」里，等对方自己拆。
          </p>
          <div className="space-y-2">
            {BOUQUET_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`gift-send-${p.id}`}
                onClick={() => {
                  addGift({
                    giftType: 'flower',
                    title: p.name,
                    content: '这一束是照着你的样子挑的。',
                    meta: JSON.stringify({ bouquet: p.id }),
                  });
                  setSending(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B4736E]/12">
                  <Flower2 className="h-4 w-4 text-[#B4736E]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] text-foreground">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

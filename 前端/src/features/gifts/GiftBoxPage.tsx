import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flower2, Orbit, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/PageShell';
import { BottomSheet } from '@/components/BottomSheet';
import { useGiftStore, type Gift } from './giftStore';
import { patchGift } from '@/lib/api/gifts';
import {
  BOUQUET_PRESETS,
} from './bouquetModel';
import { flowerCodeOf, orderToCode } from './flowerCode';
import { FlowerShopFrame } from './FlowerShopFrame';
import { keepsakeCodeOf, composeKeepsakeCode, KEEPSAKE_PRESETS, type KeepsakeRecipe } from './keepsakeCode';
import { KeepsakeFrame } from './KeepsakeFrame';
import { CHARM_PRESETS, CharmView, charmModelOf, type CharmModelId } from './CharmView';
import { ClassicBoxArt, ClassicBoxBody, ClassicBoxLid, TINT } from './GiftBoxArt';

/**
 * 礼物盒（2026-11-13 改版：从冷调玻璃盒改成「暖光的纸盒 + 木架」）
 *
 * 2026-11-17 收敛（用户：「只要礼物，比如花束、css的建模，或者是什么别的，
 * 信件已经有了，悄悄话也可以在日记里」）：
 * - letter（信）/ whisper（悄悄话）撤出礼物盒（信在信盒、悄悄话在日记）；
 * - 新增 object（SVG 小摆件：星星罐/月亮夜灯/雪花球/小蛋糕），拆开是建模实物。
 * 2026-11-18 二十七改：封着礼盒改回**经典方礼盒**（GiftBoxArt.tsx 共用组件），
 * 点开走拆箱动画（盖子抖→飞走、礼物弹簧升起、星星迸开）。
 * 2026-11-18 二十八改：花束礼物的渲染换成**赛博花店**（自托管 public/flowershop/，
 * 花束码进 hash，见 flowerCode.ts）——花材/色号目录就是从这家店移植的，无缝接上。
 * 2026-11-18 三十改：表情（sticker）退役（用户「不要表情」），旧数据后端迁成 easter。
 */

/* ------------------------------------------------------------------ */
/* 封着的礼盒（2026-11-18 二十七改：经典方礼盒——用户「变成方的，变成     */
/* 最经典的礼物盒样子」；点开走拆箱动画）                                 */
/* ------------------------------------------------------------------ */
function SealedBox({ gift, onOpen }: { gift: Gift; onOpen: (g: Gift) => void }) {
  const meta = TINT[gift.giftType];
  const Icon = meta.icon;
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
        <ClassicBoxArt colors={meta} className="absolute inset-0 h-full w-full" />
        {/* 类型小图标：右下角，淡淡的 */}
        <span className="absolute bottom-[6px] right-1">
          <Icon className="h-3.5 w-3.5 text-[#6B4A32]/40" />
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
/* 拆封层：整屏暖色舞台（纯色不透明）+ 拆箱动画                          */
/*   2026-11-18 二十七改（用户「打开礼物要点击礼物盒之后出一个动画」）：   */
/*   盖子先抖两下 → 整个飞走，礼物弹簧升起、星星迸开，文案随后浮现。       */
/*   全部走 framer-motion 关键帧，无定时器。                              */
/* ------------------------------------------------------------------ */

/** 迸开的星星（位置相对舞台） */
const UNBOX_SPARKS = [
  { l: '24%', b: '46%', c: '#F2C98A' },
  { l: '36%', b: '54%', c: '#E8B4B8' },
  { l: '50%', b: '58%', c: '#F2C98A' },
  { l: '63%', b: '52%', c: '#BBA9D8' },
  { l: '74%', b: '44%', c: '#F2C98A' },
  { l: '44%', b: '36%', c: '#E8B4B8' },
];

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
  const isCharm = gift.giftType === 'object';
  const isKeepsake = gift.giftType === 'keepsake';
  const keepCode = isKeepsake ? keepsakeCodeOf(gift) : '';
  const charm = isCharm ? charmModelOf(gift.id, gift.meta) : null;
  const charmName = charm ? CHARM_PRESETS.find((p) => p.id === charm)?.name ?? '' : '';
  const meta = TINT[gift.giftType];
  /** 当前展示的花束码：初始取礼物存的（旧格式读取时转码），换一束时重算 */
  const [code, setCode] = useState(() => flowerCodeOf(gift));
  const [presetId, setPresetId] = useState<string | null>(null);

  /** 盒子里冒出来的实物 */
  const contentNode = isFlower ? (
    <FlowerShopFrame code={code} className="h-[46vh] min-h-[280px] w-full" />
  ) : isKeepsake ? (
    <KeepsakeFrame code={keepCode} className="h-[46vh] min-h-[280px] w-full" />
  ) : charm ? (
    <CharmView model={charm} className="h-[44vh] min-h-[260px] w-full" />
  ) : (
    <div className="flex h-[36vh] min-h-[220px] items-center justify-center">
      <meta.icon className="h-[76px] w-[76px]" style={{ color: meta.ribbon }} />
    </div>
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

      {/* ---- 拆箱动画舞台 ---- */}
      <div className="relative mx-auto mt-1 w-full max-w-[420px]" data-testid="unbox-stage">
        {/* 桌上的光 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 bottom-6 h-16 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(200,150,100,0.22),transparent_70%)]"
        />
        {/* 礼物实物：盖子飞走的同时弹簧升起 */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 90, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.72, type: 'spring', stiffness: 110, damping: 15 }}
        >
          {contentNode}
        </motion.div>
        {/* 盒身：抖完之后往下沉、淡出 */}
        <motion.div
          className="pointer-events-none absolute left-1/2 -ml-[75px] w-[150px]"
          style={{ bottom: '6%' }}
          animate={{ opacity: [1, 1, 0], y: [0, 0, 30] }}
          transition={{ delay: 0.7, duration: 0.55, times: [0, 0.35, 1], ease: 'easeIn' }}
        >
          <ClassicBoxBody colors={meta} className="w-full" />
        </motion.div>
        {/* 盖子：先抖两下（rotate 摆），然后整个飞走 */}
        <motion.div
          className="pointer-events-none absolute left-1/2 -ml-[75px] w-[150px]"
          style={{ bottom: 'calc(6% + 97px)' }}
          animate={{
            rotate: [0, -3, 3, -2, 0, -9],
            y: [0, 0, 0, 0, 0, -190],
            opacity: [1, 1, 1, 1, 1, 0],
          }}
          transition={{ duration: 1.15, times: [0, 0.32, 0.48, 0.64, 0.76, 1], ease: 'easeIn' }}
        >
          <ClassicBoxLid colors={meta} className="w-full" />
        </motion.div>
        {/* 星星迸开 */}
        {UNBOX_SPARKS.map((s, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute text-[15px]"
            style={{ left: s.l, bottom: s.b, color: s.c }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1.3, 0.5], y: [0, -12, -22] }}
            transition={{ delay: 0.85 + i * 0.05, duration: 0.6, ease: 'easeOut' }}
          >
            ✦
          </motion.span>
        ))}
      </div>

      {/* ---- 文案：动画结束后浮现 ---- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.15, duration: 0.35 }}
        className="mx-auto -mt-2 w-full max-w-[420px]"
      >
        <p className="text-center text-[11px] tracking-[0.2em] text-[#A08A6E] dark:text-[#8C7A64]">
          {charm ? charmName : meta.label}
        </p>
        <h2 className="mt-1 text-center font-letter text-[19px] text-[#4A3A2A] dark:text-[#EADFCF]">
          {gift.title}
        </h2>
        {gift.content && gift.giftType !== 'flower' && (
          <p className="mt-2 whitespace-pre-wrap text-center text-[13px] leading-7 text-[#6B5340]/90 dark:text-[#C9B69C]/90">
            {gift.content}
          </p>
        )}

        {/* 换一束：只改这次的预览，不覆盖礼物本身的选择 */}
        {isFlower && (
          <>
            <div className="mt-4 flex items-center justify-center gap-2">
              {BOUQUET_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`bouquet-preset-${p.id}`}
                  onClick={() => {
                    setPresetId(p.id);
                    setCode(orderToCode(p.order, { to: '你', message: gift.content }));
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
              花束可以拖着转，贺卡上的字也在上面
            </p>
          </>
        )}
      </motion.div>

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
  const isCharm = gift.giftType === 'object';
  const isKeepsake = gift.giftType === 'keepsake';
  const charm = isCharm ? charmModelOf(gift.id, gift.meta) : null;
  const charmName = charm ? CHARM_PRESETS.find((p) => p.id === charm)?.name ?? '' : '';
  const code = useMemo(() => flowerCodeOf(gift), [gift]);
  const keepCode = useMemo(() => (isKeepsake ? keepsakeCodeOf(gift) : ''), [gift, isKeepsake]);
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
          <FlowerShopFrame code={code} className="h-[52vh] min-h-[300px] w-full" />
        </div>
      ) : isKeepsake ? (
        <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[420px]">
          <KeepsakeFrame code={keepCode} className="h-[52vh] min-h-[300px] w-full" />
        </div>
      ) : charm ? (
        <div onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-[380px]">
          <CharmView model={charm} className="h-[44vh] min-h-[260px] w-full" />
          <p className="text-center text-[11px] tracking-[0.2em] text-[#A08A6E]">{charmName}</p>
        </div>
      ) : null}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto mt-3 w-full max-w-[420px] rounded-2xl border border-[#E9DAC4] bg-white/70 p-5 dark:border-[#3A2F25] dark:bg-[#221C16]"
      >
        <h2 className="text-center text-[17px] text-[#4A3A2A] dark:text-[#EADFCF]">{gift.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-center text-[13.5px] leading-8 text-[#6B5340]/90 dark:text-[#C9B69C]/90">
          {gift.content}
        </p>
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
              data-testid="gift-send-open"
              className="flex items-center gap-1 rounded-full bg-[#B4736E]/10 px-2.5 py-1 text-[11px] text-[#A05F5A] transition active:scale-95 dark:bg-[#B4736E]/20 dark:text-[#E0B4B0]"
            >
              <Plus className="h-3 w-3" />
              送礼物
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

      {/* 送礼物：花束 / 小摆件两个区，挑中一个直接落成一份未拆礼物 */}
      <BottomSheet
        open={sending}
        onOpenChange={setSending}
        title="送礼物"
        testid="gift-send-sheet"
      >
        <div className="px-4 pb-6 pt-1">
          <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
            挑一件。送出去会先躺在「未拆开的」里，等对方自己拆。
          </p>
          <p className="mb-1.5 text-[11px] tracking-[0.18em] text-[#A08A6E] dark:text-[#8C7A64]">花束</p>
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
          <p className="mb-1.5 mt-4 text-[11px] tracking-[0.18em] text-[#A08A6E] dark:text-[#8C7A64]">小摆件</p>
          <div className="space-y-2">
            {CHARM_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`gift-send-charm-${p.id}`}
                onClick={() => {
                  addGift({
                    giftType: 'object',
                    title: p.name,
                    content: p.desc,
                    meta: JSON.stringify({ model: p.id }),
                  });
                  setSending(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8A7B66]/12">
                  <CharmView model={p.id as CharmModelId} className="h-8 w-8" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] text-foreground">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mb-1.5 mt-4 text-[11px] tracking-[0.18em] text-[#A08A6E] dark:text-[#8C7A64]">纪念品</p>
          <div className="space-y-2">
            {KEEPSAKE_PRESETS.map((p) => (
              <button
                key={p.recipe}
                type="button"
                data-testid={`gift-send-keepsake-${p.recipe}`}
                onClick={() => {
                  addGift({
                    giftType: 'keepsake',
                    title: p.name,
                    content: '每个部分都交给星星来决定，拆开才知道它长什么样。',
                    meta: JSON.stringify({ code: composeKeepsakeCode(p.recipe as KeepsakeRecipe) }),
                  });
                  setSending(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7C6BA8]/12">
                  <Orbit className="h-4 w-4 text-[#7C6BA8]" />
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
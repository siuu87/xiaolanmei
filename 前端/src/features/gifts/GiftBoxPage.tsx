import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Mail, Smile, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageShell } from '@/components/PageShell';
import {
  useGiftStore,
  type Gift,
  type GiftType,
} from './giftStore';

/** 四类礼物的视觉元数据（暗色通透、去贴纸化：只用淡色渐变 + 细描边 + 同色光晕） */
const GIFT_META: Record<GiftType, { label: string; icon: LucideIcon; ring: string; glow: string }> = {
  letter: { label: '信', icon: Mail, ring: 'ring-rose-300/25', glow: 'shadow-[0_0_28px_-6px_rgba(251,113,133,0.55)]' },
  whisper: { label: '悄悄话', icon: Heart, ring: 'ring-violet-300/25', glow: 'shadow-[0_0_28px_-6px_rgba(167,139,250,0.55)]' },
  sticker: { label: '表情', icon: Smile, ring: 'ring-amber-300/25', glow: 'shadow-[0_0_28px_-6px_rgba(251,191,36,0.55)]' },
  easter: { label: '彩蛋', icon: Sparkles, ring: 'ring-emerald-300/25', glow: 'shadow-[0_0_28px_-6px_rgba(52,211,153,0.55)]' },
};

/* ------------------------------------------------------------------ */
/* 封着的礼物盒（网格里那一枚枚待拆的盒子）                              */
/* ------------------------------------------------------------------ */
function SealedBox({ gift, onOpen }: { gift: Gift; onOpen: (g: Gift) => void }) {
  const meta = GIFT_META[gift.giftType];
  const Icon = meta.icon;
  return (
    <motion.button
      type="button"
      data-testid="gift-box"
      onClick={() => onOpen(gift)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={cn(
        'group relative flex aspect-square w-full flex-col items-center justify-center gap-2',
        'rounded-2xl border border-white/10 bg-white/[0.04] ring-1',
        meta.ring,
        meta.glow,
      )}
    >
      {/* 盒身 */}
      <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06]">
        {/* 横缎带 */}
        <span className="absolute inset-x-1 top-1/2 h-[3px] -translate-y-1/2 bg-white/25" />
        {/* 竖缎带 */}
        <span className="absolute inset-y-1 left-1/2 w-[3px] -translate-x-1/2 bg-white/25" />
        {/* 蝴蝶结 */}
        <span className="absolute -top-1.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5">
          <span className="h-2.5 w-2.5 rounded-full border border-white/30 bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full border border-white/30 bg-white/15" />
        </span>
        <Icon className="h-4 w-4 text-white/70" />
      </span>
      <span className="max-w-[90%] truncate text-[11px] font-light tracking-wide text-white/55">
        {gift.title}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* 纪念架上的摆件（拆开后落在这里）                                      */
/* ------------------------------------------------------------------ */
function Trinket({ gift, onOpen }: { gift: Gift; onOpen: (g: Gift) => void }) {
  const meta = GIFT_META[gift.giftType];
  const Icon = meta.icon;
  return (
    <motion.button
      type="button"
      data-testid="gift-trinket"
      onClick={() => onOpen(gift)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'flex w-full flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 ring-1',
        meta.ring,
      )}
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06]', meta.glow)}>
        <Icon className="h-4 w-4 text-white/75" />
      </span>
      <span className="line-clamp-1 w-full text-center text-[11px] font-light tracking-wide text-white/65">
        {gift.title}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* 拆封层：层层展开的动效（盒盖掀起 → 光晕炸开 → 内容浮现）              */
/* 纯色不透明底（规则 1：开新页面 = 整页不透明，禁模糊遮罩）             */
/* ------------------------------------------------------------------ */
function UnboxOverlay({ gift, onClose }: { gift: Gift; onClose: () => void }) {
  const meta = GIFT_META[gift.giftType];
  const Icon = meta.icon;
  return (
    <motion.div
      data-testid="unbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[1400] flex flex-col items-center justify-center bg-[#0a0a0f] px-6 text-white"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.08),transparent_60%)]" />

      <div className="relative flex h-52 w-52 items-center justify-center">
        {/* 光晕炸开 */}
        <motion.span
          aria-hidden
          initial={{ scale: 0.5, opacity: 0.9 }}
          animate={{ scale: 2.1, opacity: 0 }}
          transition={{ duration: 0.85, delay: 0.35, ease: 'easeOut' }}
          className={cn('absolute h-32 w-32 rounded-full bg-white/20 blur-2xl', meta.glow)}
        />
        {/* 盒身（留在原地） */}
        <span className="absolute h-24 w-24 rounded-2xl border border-white/10 bg-white/[0.05]" />
        {/* 横缎带 */}
        <motion.span
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="absolute h-24 w-[6px] bg-white/25"
        />
        {/* 竖缎带 */} 
        <motion.span
          aria-hidden
          initial={{ opacity: 1, y: 0 }}
          animate={{ opacity: 0, y: -60 }}
          transition={{ duration: 0.45, delay: 0.3, ease: 'easeIn' }}
          className="absolute h-[6px] w-24 bg-white/25"
        />
        {/* 盒盖掀起 */}
        <motion.span
          aria-hidden
          initial={{ y: 0, rotate: 0, opacity: 1 }}
          animate={{ y: -70, rotate: -10, opacity: 0 }}
          transition={{ duration: 0.55, delay: 0.25, ease: 'easeIn' }}
          className="absolute -top-1 h-10 w-24 rounded-t-2xl border border-white/15 bg-white/[0.09]"
        />
        {/* 蝴蝶结飘散 */}
        <motion.span
          aria-hidden
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 0.4, y: -40 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="absolute -top-3 left-1/2 flex -translate-x-1/2 gap-1"
        >
          <span className="h-4 w-4 rounded-full border border-white/30 bg-white/20" />
          <span className="h-4 w-4 rounded-full border border-white/30 bg-white/20" />
        </motion.span>

        {/* 内容卡浮现 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.82, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
          className="absolute bottom-[-10px] flex flex-col items-center"
        >
          <span className={cn('flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] ring-1', meta.ring, meta.glow)}>
            <Icon className="h-5 w-5 text-white/85" />
          </span>
        </motion.div>
      </div>

      {/* 内容卡 */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7, ease: 'easeOut' }}
        className="relative z-10 mt-6 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.05] p-5"
      >
        <p className="text-center text-[11px] font-light tracking-[0.2em] text-white/45">
          {meta.label}
        </p>
        <h2 className="mt-1 text-center text-[17px] font-medium tracking-tight text-white">
          {gift.title}
        </h2>
        {gift.giftType === 'sticker' ? (
          <p className="mt-3 text-center text-5xl leading-none">{gift.content}</p>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-center text-[13px] leading-7 font-light text-white/75">
            {gift.content}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="unbox-keep"
          className="mt-5 h-10 w-full rounded-xl bg-white/10 text-sm font-medium text-white transition hover:bg-white/15 active:scale-[0.98]"
        >
          收下
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 摆件阅读层：拆开后回头看内容                                          */
/* ------------------------------------------------------------------ */
function GiftReaderLayer({ gift, onClose }: { gift: Gift; onClose: () => void }) {
  const meta = GIFT_META[gift.giftType];
  const Icon = meta.icon;
  return (
    <motion.div
      data-testid="gift-reader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[1400] flex flex-col items-center justify-center bg-[#0a0a0f] px-6 text-white"
      onClick={onClose}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.07),transparent_60%)]" />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.05] p-6"
      >
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] ring-1', meta.ring)}>
            <Icon className="h-4 w-4 text-white/80" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-light tracking-[0.2em] text-white/40">{meta.label}</p>
            <h2 className="truncate text-[16px] font-medium tracking-tight text-white">{gift.title}</h2>
          </div>
        </div>
        {gift.giftType === 'sticker' ? (
          <p className="mt-5 text-center text-6xl leading-none">{gift.content}</p>
        ) : (
          <p className="mt-4 whitespace-pre-wrap text-[14px] leading-8 font-light text-white/80">
            {gift.content}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="gift-reader-close"
          className="mt-6 h-10 w-full rounded-xl bg-white/10 text-sm font-medium text-white transition hover:bg-white/15 active:scale-[0.98]"
        >
          收回纪念架
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 礼物盒页                                                            */
/* ------------------------------------------------------------------ */
export function GiftBoxPage() {
  const gifts = useGiftStore((s) => s.gifts);
  const loaded = useGiftStore((s) => s.loaded);
  const load = useGiftStore((s) => s.load);
  const openGift = useGiftStore((s) => s.openGift);
  const seedDemo = useGiftStore((s) => s.seedDemo);

  const [unboxing, setUnboxing] = useState<Gift | null>(null);
  const [reading, setReading] = useState<Gift | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 第一次进来且库是空的：塞几件演示礼物，方便直接看到效果（可随手删）
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

  return (
    <>
      <PageShell
        title="礼物盒"
        eyebrow="GIFTS"
        backTo="/chat"
        className="bg-[#0a0a0f]"
        right={
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-light text-white/55">
            {unopened.length} 待拆
          </span>
        }
      >
        {/* 暗色环境光 */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_55%)]" />

        {/* 未拆礼物区 */}
        <section className="relative">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium tracking-[0.15em] text-white/70">未拆开的</h2>
            <span className="text-[11px] font-light text-white/35">点一下，拆开看看</span>
          </div>
          {unopened.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-[12px] font-light text-white/40">
              暂时没有待拆的礼物
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {unopened.map((g) => (
                <SealedBox key={g.id} gift={g} onOpen={handleOpen} />
              ))}
            </div>
          )}
        </section>

        {/* 专属纪念架 */}
        <section className="relative mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium tracking-[0.15em] text-white/70">专属纪念架</h2>
            <span className="text-[11px] font-light text-white/35">{opened.length} 件</span>
          </div>
          {opened.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-[12px] font-light text-white/40">
              拆开的礼物会摆在这里
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {opened.map((g) => (
                  <Trinket key={g.id} gift={g} onOpen={handleOpen} />
                ))}
              </div>
              {/* 玻璃搁板 */}
              <div className="mt-1 h-1 rounded-full bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
            </>
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
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reading && (
          <GiftReaderLayer
            key={reading.id}
            gift={reading}
            onClose={() => setReading(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

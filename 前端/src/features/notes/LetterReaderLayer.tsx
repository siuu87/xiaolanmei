import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotesStore } from './notesStore';
import { NOTE_AUTHOR, formatNoteDate, normalizeLetterTheme } from './notesData';
import { meeLetterParts } from './LetterArt';
import { EnvelopeArt } from './LetterEnvelope';
import { MEE, MeeGrain, MeeRibbon, StarSprinkles } from './MeeSkin';

/**
 * 拆信弹窗（2026-10-20 重做）
 *
 * 用户要求「点开卡片是一个弹窗」，所以从信箱点信封不再是跳整页，而是**原地弹一个拆信窗**：
 *
 * - **背景是纯色不透明**（不是 `bg-black/70 + backdrop-blur`）。项目里有一条硬规矩：
 *   叠层不许半透明，否则会透出底下的聊天对话。这里照样做成弹窗的样子
 *   （整屏舞台 + 居中卡片 + 点空白收起），但那层"舞台"是页面 token 的纯色底，不透对话。
 * - **拆信动作分三步**（2026-10-22 富版）：信封先落地（0.24s spring）→ `opened` 置真后
 *   ① 火漆裂光淡出、② 封盖回弹翻开（delay 160ms）、③ 信纸带 `rotateX` 微展并从信封口抽出来
 *   （framer `delay 0.18s`，弹簧）。一步到位会变成"弹出一张图"，错开才有"亲手拆"的感觉。
 * - **三种关法**：右上角 ✕、点空白处、Esc。
 * - 打开即已读（红点熄灭），跟以前一致。
 */
export function LetterReaderLayer({ id, onClose }: { id: string; onClose: () => void }) {
  const notes = useNotesStore((s) => s.notes);
  const loaded = useNotesStore((s) => s.loaded);
  const load = useNotesStore((s) => s.load);
  const markRead = useNotesStore((s) => s.markRead);

  /** 拆封阶段：false = 封着，true = 已翻开 */
  const [opened, setOpened] = useState(false);

  // 直达（比如刷新在 /letter/xxx）时先把信拉下来，否则会误判成「信不存在」
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // 打开即已读
  useEffect(() => {
    if (id) markRead(id);
  }, [id, markRead]);

  // 信封先落地，再掀盖
  useEffect(() => {
    const t = window.setTimeout(() => setOpened(true), 240);
    return () => window.clearTimeout(t);
  }, []);

  // Esc 关。抽屉里也可能点开这层，所以在 capture 阶段吃掉，别让抽屉跟着一起关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const note = notes.find((n) => n.id === id) ?? null;
  const theme = normalizeLetterTheme(note?.letterTheme);
  const parts = meeLetterParts(theme);
  // 长回信正文自带「—— 小蓝莓」落款，右下角就别再印一次名字了，改成邮戳式的小标签
  const hasSignature = /^\s*[—–－-]{1,2}\s*.{1,12}\s*$/m.test(note?.content ?? '');

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center px-6"
      data-testid="letter-page"
      data-letter-theme={theme}
      data-opened={opened ? '1' : '0'}
    >
      {/* 舞台：一整张奶油米白纸（**纯色不透明**，项目硬规矩）。
          纸纹和淡蓝手绘星星只是画在纸上的装饰，不是半透明遮罩，不会透出底下的聊天。 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        data-testid="letter-page-mask"
        className="absolute inset-0"
        style={{ background: MEE.page }}
      >
        <MeeGrain />
        <StarSprinkles preset="page" />
      </motion.div>

      {/* 右上角关闭：白色圆片 + 蓝字，像手帐上贴的一枚圆贴纸 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="收起这封信"
        data-testid="letter-page-close"
        className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_-4px_rgba(80,70,50,0.45)] transition hover:bg-[#FFFDF5] active:scale-95"
        style={{ color: MEE.blue }}
      >
        <X size={16} />
      </button>

      {/* 信封 + 抽出来的信纸 */}
      <div className="relative w-full max-w-[min(440px,92vw)]">
        {/*
          信封：整枚压在信纸**后面并往下沉**，只露出下半截。
          信纸的底边要落进信封内部（不是贴在信封上沿），否则中间会裂出一条缝，
          看起来像「信纸浮在空中」。这条缝以前踩过，别再把 bottom 调小。
        */}
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 26, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="absolute -inset-x-4 bottom-[-112px] z-0"
          data-testid="letter-page-envelope"
        >
          <EnvelopeArt
            theme={theme}
            opened={opened}
            seal={false}
            ribbon={false}
            className="aspect-[5/3] w-full"
          />
        </motion.div>

        {/* 信纸：从信封口抽出来 */}
        <AnimatePresence>
          {note && (
            <motion.div
              data-testid="letter-paper"
              initial={{ scaleY: 0.04, y: 62, opacity: 0, rotateX: 14 }}
              animate={{
                scaleY: opened ? 1 : 0.04,
                y: opened ? 0 : 62,
                opacity: opened ? 1 : 0,
                rotateX: opened ? 0 : 14,
              }}
              exit={{ scaleY: 0.04, y: 62, opacity: 0, rotateX: 14 }}
              transition={{ type: 'spring', stiffness: 190, damping: 26, mass: 0.9, delay: 0.18 }}
              style={{ transformOrigin: 'bottom center' }}
              className={cn(
                'relative z-10 mb-[72px] max-h-[82vh] overflow-y-auto rounded-[3px] border border-[#EDE7D7] px-7 py-8',
                'shadow-[0_4px_18px_-14px_rgba(80,70,50,0.5)]',
                'font-hand',
                parts.paper,
                parts.ink,
              )}
            >
              {/* 淡蓝大引号：手帐信纸的起手式 */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-4 top-1 select-none text-[40px] leading-none"
                style={{ color: MEE.blueLight }}
              >
                “
              </span>

              {/* 奶油黄抬头药丸，跟 Mee 那封「一封来自 Mee 的信」同一个位置 */}
              <div className="relative mb-5 flex justify-end pt-3">
                <MeeRibbon />
              </div>

              <p className="whitespace-pre-wrap break-words text-[15px] leading-[30px] tracking-[0.01em]">
                {note.content}
              </p>

              <div className="mt-7 flex flex-col items-end gap-0.5">
                <span className={cn('font-hand text-[11px]', parts.meta)}>
                  {formatNoteDate(note.createdAt)}
                </span>
                <span className={cn('font-hand-title text-[14px] opacity-80', parts.meta)}>
                  {hasSignature ? '深夜来信' : NOTE_AUTHOR}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!note && (
          <div
            data-testid="letter-paper"
            className={cn(
              'relative z-10 flex h-32 items-center justify-center rounded-[3px] border border-[#EDE7D7] px-5',
              'font-hand text-[13px] shadow-[0_4px_18px_-14px_rgba(80,70,50,0.5)]',
              parts.paper,
              parts.meta,
            )}
          >
            {loaded ? '这封信找不到了' : '取信中…'}
          </div>
        )}
      </div>

      <span
        className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 text-center font-hand text-[12px] tracking-wide"
        style={{ color: MEE.blue }}
      >
        轻点空白处收起 →
      </span>
    </div>,
    document.body,
  );
}

/**
 * 酒馆「小手机」模块 —— 朋友圈（发现页）
 *
 * 数据全部为本地占位：示例动态 + 我发布的动态（localStorage 持久化）。
 * 支持：浏览动态流、发布（文字 + 占位图）、点赞、评论。
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, MessageCircle, PenLine, Send, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhoneStore } from './phoneStore';
import { PhoneNavBar } from './PhoneShell';
import { EmptyState, PhoneDialog } from './ChatViews';
import { MOMENT_LOCATIONS } from './sampleData';
import type { Moment, MomentImage } from './types';

/* ------------------------------ 时间格式化 ------------------------------ */

function momentTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const d = Math.floor(hr / 24);
  if (d === 1) return '昨天';
  if (d < 30) return `${d}天前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 占位图片块：用色相生成渐变，不依赖外部图片资源 */
function PlaceholderImage({ image, className }: { image: MomentImage; className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-[3px] text-[10px] font-medium text-white/85',
        className,
      )}
      style={{
        background: `linear-gradient(135deg,
          hsl(${image.hue} 45% 72%) 0%,
          hsl(${(image.hue + 24) % 360} 42% 56%) 55%,
          hsl(${(image.hue + 48) % 360} 38% 44%) 100%)`,
      }}
      aria-label={image.label}
    >
      <span className="rounded bg-black/20 px-1 py-0.5 backdrop-blur-sm">{image.label}</span>
    </span>
  );
}

/** 九宫格 / 单图 / 多图 布局 */
function MomentImages({ images }: { images: MomentImage[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return <PlaceholderImage image={images[0]} className="mt-2 h-40 w-40" />;
  }
  const cols = images.length === 2 || images.length === 4 ? 2 : 3;
  return (
    <div
      className="mt-2 grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols * 78 }}
    >
      {images.map((im, i) => (
        <PlaceholderImage key={i} image={im} className="aspect-square w-full" />
      ))}
    </div>
  );
}

/** 点赞/评论操作条 */
function ActionRow({
  moment,
  onLike,
  onComment,
}: {
  moment: Moment;
  onLike: () => void;
  onComment: () => void;
}) {
  const liked = moment.likes.includes('我');
  return (
    <div className="mt-2 flex items-center justify-end gap-6">
      <button
        type="button"
        onClick={onComment}
        aria-label="评论"
        className="flex items-center gap-1 text-[12px] text-[#3C3C43] transition active:opacity-60"
      >
        <MessageCircle className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </button>
      <button
        type="button"
        onClick={onLike}
        aria-label={liked ? '取消赞' : '赞'}
        className={cn(
          'flex items-center gap-1 text-[12px] transition active:scale-90',
          liked ? 'text-[#FF3B30]' : 'text-[#3C3C43]',
        )}
      >
        <Heart
          className={cn('h-[18px] w-[18px] transition', liked && 'fill-[#FF3B30]')}
          strokeWidth={1.9}
        />
      </button>
    </div>
  );
}

/** 点赞名单 + 评论区 */
function InteractionBlock({ moment, onReply }: { moment: Moment; onReply: (author: string) => void }) {
  const hasLikes = moment.likes.length > 0;
  const hasComments = moment.comments.length > 0;
  if (!hasLikes && !hasComments) return null;
  return (
    <div className="mt-2 overflow-hidden rounded-md bg-[#f5f5f7] px-2.5 py-2">
      {hasLikes && (
        <div className="flex items-start gap-1 text-[12px] leading-5">
          <Heart className="mt-1 h-3 w-3 shrink-0 fill-[#007AFF] text-[#007AFF]" />
          <span className="flex-1 text-[#007AFF]">
            {moment.likes.map((name, i) => (
              <span key={i}>
                {i > 0 && '、'}
                {name}
              </span>
            ))}
          </span>
        </div>
      )}
      {hasLikes && hasComments && <div className="my-1.5 border-t border-black/[0.06]" />}
      {hasComments && (
        <div className="space-y-1">
          {moment.comments.map((c) => (
            <div key={c.id} className="text-[12px] leading-5">
              <button
                type="button"
                onClick={() => onReply(c.author)}
                className={cn('font-medium', c.mine ? 'text-[#007AFF]' : 'text-[#007AFF]')}
              >
                {c.author}
              </button>
              <span className="text-[#000000]">：{c.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== 发布弹层 ============================== */

export function PublishSheet({ onClose }: { onClose: () => void }) {
  const publishMoment = usePhoneStore((s) => s.publishMoment);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<MomentImage[]>([]);
  const [location, setLocation] = useState('');

  const canPublish = content.trim().length > 0 || images.length > 0;

  const addImage = () => {
    if (images.length >= 9) return;
    const hue = Math.floor(Math.random() * 360);
    setImages((im) => [...im, { hue, label: `图${im.length + 1}` }]);
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-white">
      <div className="flex h-11 shrink-0 items-center justify-between px-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="取消"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#3C3C43] active:bg-black/10"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold text-[#000000]">发表动态</span>
        <button
          type="button"
          disabled={!canPublish}
          onClick={() => {
            publishMoment(content, images, location);
            onClose();
          }}
          className={cn(
            'flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition',
            canPublish ? 'bg-[#007AFF] text-white active:scale-95' : 'bg-[#E9E9EB] text-[#8e8e93]',
          )}
        >
          <Send className="h-3.5 w-3.5" /> 发表
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="这一刻的想法…"
          rows={5}
          className="w-full resize-none bg-transparent text-[15px] leading-7 text-[#000000] outline-none placeholder:text-[#8e8e93]"
        />

        {/* 已选图片 */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <AnimatePresence initial={false}>
            {images.map((im, i) => (
              <motion.div
                key={`${im.hue}-${i}`}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="relative"
              >
                <PlaceholderImage image={im} className="aspect-square w-full" />
                <button
                  type="button"
                  onClick={() => setImages((arr) => arr.filter((_, idx) => idx !== i))}
                  aria-label="移除图片"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {images.length < 9 && (
            <button
              type="button"
              onClick={addImage}
              className="flex aspect-square items-center justify-center rounded-[3px] border border-dashed border-[#C7C7CC] text-[#8e8e93] transition active:bg-black/[0.03]"
            >
              <PenLine className="h-6 w-6" strokeWidth={1.5} />
            </button>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-black/[0.06] pt-3">
          <span className="text-[13px] text-[#8e8e93]">所在位置</span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {MOMENT_LOCATIONS.map((loc) => (
              <button
                key={loc || 'none'}
                type="button"
                onClick={() => setLocation(loc)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[12px] transition',
                  location === loc ? 'bg-[#007AFF]/12 text-[#007AFF] ring-1 ring-[#007AFF]/40' : 'bg-[#E9E9EB] text-[#3C3C43]',
                )}
              >
                {loc || '不显示'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== 评论输入 ============================== */

function CommentBar({
  replyTo,
  onCancel,
  onSubmit,
}: {
  replyTo: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="flex items-center gap-2 border-t border-black/[0.06] bg-white px-3 py-2">
      <span className="shrink-0 text-[12px] text-[#8e8e93]">回复 {replyTo}</span>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            if (text.trim()) onSubmit(text);
          }
        }}
        placeholder="写评论…"
        className="h-8 flex-1 rounded-lg bg-[#E9E9EB] px-2.5 text-[13px] text-[#000000] outline-none placeholder:text-[#8e8e93]"
      />
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 text-[13px] text-[#8e8e93] transition active:opacity-60"
      >
        取消
      </button>
      <button
        type="button"
        disabled={!text.trim()}
        onClick={() => onSubmit(text)}
        className={cn(
          'shrink-0 rounded-full px-3 py-1 text-[13px] font-medium transition',
          text.trim() ? 'bg-[#007AFF] text-white' : 'bg-[#E9E9EB] text-[#8e8e93]',
        )}
      >
        发送
      </button>
    </div>
  );
}

/* ============================== 发现页 ============================== */

export function DiscoverPage({ onPublish }: { onPublish: () => void }) {
  const moments = usePhoneStore((s) => s.moments);
  const toggleLike = usePhoneStore((s) => s.toggleLike);
  const addComment = usePhoneStore((s) => s.addComment);
  const removeMoment = usePhoneStore((s) => s.removeMoment);
  const [reply, setReply] = useState<{ momentId: string; author: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const sorted = useMemo(() => [...moments].sort((a, b) => b.createdAt - a.createdAt), [moments]);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 封面头图 */}
      <div className="relative h-40 shrink-0 overflow-hidden bg-gradient-to-br from-[#2b3550] via-[#1d2540] to-[#101528]">
        <div className="absolute inset-0 opacity-70">
          <div className="absolute right-4 top-6 h-16 w-16 rounded-full bg-[#D4AF37]/25 blur-xl" />
          <div className="absolute bottom-3 left-6 h-20 w-20 rounded-full bg-[#007AFF]/25 blur-2xl" />
        </div>
        <PhoneNavBar
          title=""
          tone="dark"
          right={<span className="w-8" />}
        />
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          <span className="text-[17px] font-semibold text-white drop-shadow">朋友圈</span>
        </div>
        <button
          type="button"
          onClick={onPublish}
          aria-label="发表动态"
          className="absolute bottom-3 right-4 flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[13px] font-medium text-[#000000] shadow-lg transition active:scale-95"
        >
          <PenLine className="h-4 w-4" /> 发表
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<PenLine className="h-9 w-9" />}
            title="朋友圈还是空的"
            desc="发表第一条动态，记录此刻"
            action={{ label: '发表动态', onClick: onPublish }}
          />
        ) : (
          sorted.map((m) => (
            <div key={m.id} className="group flex gap-2.5 border-b border-black/[0.05] px-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#E9E9EB] text-xl">
                {m.authorAvatar || '🙂'}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[14px] font-semibold text-[#007AFF]">
                    {m.authorName}
                  </span>
                  {m.mine && (
                    <button
                      type="button"
                      onClick={() => setConfirmDel(m.id)}
                      aria-label="删除动态"
                      className="shrink-0 text-[#C7C7CC] transition active:text-[#FF3B30]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {m.content && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-[#000000]">
                    {m.content}
                  </p>
                )}

                <MomentImages images={m.images} />

                {m.location && (
                  <p className="mt-1.5 text-[12px] text-[#8e8e93]">📍 {m.location}</p>
                )}

                <div className="mt-1.5 flex items-center gap-3">
                  <span className="text-[11px] text-[#8e8e93]">{momentTime(m.createdAt)}</span>
                  <div className="flex-1" />
                  <ActionRow
                    moment={m}
                    onLike={() => toggleLike(m.id)}
                    onComment={() => setReply({ momentId: m.id, author: m.authorName })}
                  />
                </div>

                <InteractionBlock
                  moment={m}
                  onReply={(author) => setReply({ momentId: m.id, author })}
                />
              </div>
            </div>
          ))
        )}
        {/* 底部留白，避免被 home indicator 遮挡 */}
        <div className="h-6" />
      </div>

      {/* 评论输入条 */}
      <AnimatePresence>
        {reply && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="shrink-0"
          >
            <CommentBar
              replyTo={reply.author}
              onCancel={() => setReply(null)}
              onSubmit={(t) => {
                addComment(reply.momentId, t);
                setReply(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {confirmDel && (
        <PhoneDialog
          title="删除动态"
          text="删除后无法恢复，确定吗？"
          danger
          okText="删除"
          onCancel={() => setConfirmDel(null)}
          onOk={() => {
            removeMoment(confirmDel);
            setConfirmDel(null);
          }}
        />
      )}
    </div>
  );
}

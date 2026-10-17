import { cn } from '@/lib/utils';
import { AlertTriangle, UtensilsCrossed } from 'lucide-react';
import { dietBadgeClass, dietBadgeText, type DietHit } from './dietHits';

/**
 * 忌口 / 过敏胶囊徽章（需求 §3）。
 *
 * - **忌口**（`dislike`）= 暖橙胶囊，文案「[食物名称] · 忌口」；
 * - **过敏**（`allergy`）= 红色胶囊，文案「[食物名称] · 严重过敏」，带警示图标。
 *
 * 食物名一律来自动态档案（人设 + 备忘录），**这里不写死任何食物**。
 * `data-testid` 带级别，回归脚本可以断言弹的是哪一级。
 */
export function DietBadge({ hit, className }: { hit: DietHit; className?: string }) {
  const allergy = hit.level === 'allergy';
  return (
    <span
      data-testid={`diet-badge-${hit.level}`}
      data-diet-name={hit.name}
      title={allergy ? '严重过敏源，必须避开' : '忌口，尽量避开'}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] text-[11px] leading-none',
        dietBadgeClass(hit.level),
        className,
      )}
    >
      {allergy ? (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      ) : (
        <UtensilsCrossed className="h-3 w-3" aria-hidden />
      )}
      {dietBadgeText(hit)}
    </span>
  );
}

/**
 * 一整条命中提示：一排胶囊 + 一句说明。
 * 聊天输入框上方、备忘录输入框下方都用这一份，视觉与文案保持一致。
 */
export function DietHitBar({
  hits,
  className,
  hint,
}: {
  hits: DietHit[];
  className?: string;
  /** 覆盖默认说明文案（比如备忘录录入时要说「记下来之后会自动避开」） */
  hint?: string;
}) {
  if (hits.length === 0) return null;
  const allergy = hits.some((h) => h.level === 'allergy');
  return (
    <div
      data-testid="diet-hit-bar"
      data-has-allergy={allergy ? '1' : '0'}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {hits.map((h) => (
        <DietBadge key={`${h.level}:${h.name}`} hit={h} />
      ))}
      <span className="text-[11px] leading-none text-muted-foreground">
        {hint ?? (allergy ? '这个碰不得，替你拦下了' : '这个她不太吃，记得避开')}
      </span>
    </div>
  );
}

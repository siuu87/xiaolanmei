import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Lightbulb, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDish, type Dish, type DishIngredient } from '@/lib/api/dishes';
import { useDishStore } from './dishStore';
import { MangoKick } from './MangoKick';
import { SUBSTITUTE_MAP, checkMango, tagClass, tagEmoji } from './foodData';

/** 食材行：命中 SUBSTITUTE_MAP 时可展开替代建议 */
function IngredientRow({ ing }: { ing: DishIngredient }) {
  const sub = SUBSTITUTE_MAP[ing.name];
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/60 py-2.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">{ing.name}</span>
        {ing.amount && <span className="shrink-0 text-sm text-muted-foreground">{ing.amount}{ing.unit ?? ''}</span>}
        {sub && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 transition hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
          >
            <Lightbulb className="h-3 w-3" /> 可替代
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {sub && open && (
        <div className="mt-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="text-amber-600 dark:text-amber-300">{sub.reason}</span> — {sub.replace}
        </div>
      )}
    </div>
  );
}

/** 菜品详情：拍立得头图 + 食材替代 + 分步做法 */
export function FoodDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fromStore = useDishStore((s) => s.dishes.find((d) => d.id === id));
  const [dish, setDish] = useState<Dish | null>(fromStore ?? null);
  const [kick, setKick] = useState(0);

  useEffect(() => {
    if (!id || fromStore) return;
    void getDish(id).then(setDish).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fromStore]);

  const hasMango = useMemo(() => {
    if (!dish) return false;
    return checkMango([dish.name, dish.description ?? '', ...dish.ingredients.map((i) => i.name)].join(' '));
  }, [dish]);

  const triggerMango = () => setKick((t) => t + 1);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/food')}
          aria-label="返回"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="flex-1 text-sm text-muted-foreground">{dish?.type === 'dessert' ? '治愈甜品' : '日常正餐'}</h1>
        {dish && (
          <button
            type="button"
            onClick={() => navigate('/food')}
            className="flex items-center gap-1 rounded-xl bg-muted px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted/80"
          >
            <Pencil className="h-3.5 w-3.5" /> 回列表编辑
          </button>
        )}
      </div>

      {!dish ? (
        <div className="py-20 text-center text-sm text-muted-foreground">加载中…</div>
      ) : (
        <>
          {/* 拍立得头图 */}
          <div className="mt-4">
            <div className="relative mx-auto w-56 -rotate-2 rounded-xl bg-white p-3 pb-10 shadow-xl dark:bg-zinc-800">
              {dish.coverUrl ? (
                <img src={dish.coverUrl} alt={dish.name} className="aspect-square w-full rounded-md object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-md bg-gradient-to-br from-rose-100 to-amber-100 text-8xl dark:from-zinc-700 dark:to-rose-950">
                  {dish.type === 'dessert' ? '🍰' : '🍚'}
                </div>
              )}
              <div className="mt-3 text-center text-sm font-semibold tracking-wide text-zinc-700 dark:text-zinc-200">{dish.name}</div>
            </div>
          </div>

          {/* 名称 + 标签 + 描述 */}
          <div className="mt-6 text-center">
            {dish.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {dish.tags.map((tag) => (
                  <span key={tag} className={cn('rounded-full border px-2.5 py-0.5 text-[11px]', tagClass(tag))}>
                    {tagEmoji(tag)}
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {dish.description && <p className="mt-3 text-sm italic text-muted-foreground">{dish.description}</p>}
            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span>难度 {'🥄'.repeat(dish.difficulty)}</span>
              {dish.type === 'dessert' && <span>治愈 {'🍬'.repeat(dish.healingIndex)}</span>}
              {hasMango && (
                <button type="button" onClick={triggerMango} className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600 transition hover:bg-pink-200 dark:bg-pink-950/50 dark:text-pink-300">
                  🥭 含芒果
                </button>
              )}
            </div>
          </div>

          {/* 用料 */}
          <section className="mt-6">
            <h2 className="mb-1 text-sm font-semibold">用料</h2>
            <div>
              {dish.ingredients.map((ing, i) => (
                <IngredientRow key={`${ing.name}-${i}`} ing={ing} />
              ))}
            </div>
          </section>

          {/* 做法 */}
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold">做法</h2>
            <ol className="space-y-3">
              {dish.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          {hasMango && (
            <p className="mt-6 rounded-xl bg-pink-50 p-3 text-center text-xs text-pink-600 dark:bg-pink-950/40 dark:text-pink-300">
              ⚠️ 这道菜含芒果，小猫记得避开哦
            </p>
          )}
        </>
      )}

      <MangoKick trigger={kick} onClose={() => setKick(0)} />
    </div>
  );
}

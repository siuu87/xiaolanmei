/**
 * 黄历详情页 —— 点拓展页里的农历打开，长这样小米日历那页：
 * 暖纸/墨色主题下的卡片：宜/忌一列，右边大数字日期 + 农历 + 干支；
 * 下面胎神/彭祖/五行/星宿/冲煞五格，最底一排十二时辰吉凶。
 *
 * 数据全在 almanac.ts，这里只管摆。
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { almanacOf, type Almanac } from './almanac';

const GOLD = 'hsl(var(--gold))';
const GOLD_LINE = 'hsl(var(--gold) / 0.35)';

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
      <p className="text-[13px] font-medium text-gold">{title}</p>
      <div className="text-[11px] leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}

function YiJiColumn({ label, items }: { label: '宜' | '忌'; items: string[] }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold text-[12px] text-gold">
        {label}
      </span>
      <div className="flex flex-col items-center gap-1.5">
        {items.map((t) => (
          <span key={t} className="text-[12px] tracking-wide text-gold">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function AlmanacCard({ data }: { data: Almanac }) {
  return (
    <div className="paper-card overflow-hidden rounded-xl border-gold/40">
      {/* 上半：左宜忌 / 右大数字 + 农历 + 干支 */}
      <div className="flex" style={{ borderBottom: `1px solid ${GOLD_LINE}` }}>
        <div
          className="flex w-[88px] shrink-0 flex-col justify-center gap-5 border-r py-5"
          style={{ borderColor: GOLD_LINE }}
        >
          <YiJiColumn label="宜" items={data.yi} />
          <YiJiColumn label="忌" items={data.ji} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-6">
          <p className="text-[64px] font-extralight leading-none text-foreground">{data.day}</p>
          <p className="mt-3 text-[26px] font-light tracking-wide text-foreground">{data.lunarText}</p>
          <p className="mt-1 text-[11px] tracking-wide text-muted-foreground">{data.gzLine}</p>
        </div>
      </div>

      {/* 中间：胎神 / 彭祖 / 五行 · 星宿 / 冲煞 */}
      <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${GOLD_LINE}` }}>
        <div className="border-r" style={{ borderColor: GOLD_LINE }}>
          <Cell title="胎神">{data.taishen}</Cell>
        </div>
        <div className="border-r" style={{ borderColor: GOLD_LINE }}>
          <Cell title="彭祖">
            {data.pengzu.map((t) => (
              <span key={t} className="block">
                {t}
              </span>
            ))}
          </Cell>
        </div>
        <div>
          <div className="border-b" style={{ borderColor: GOLD_LINE }}>
            <Cell title="五行">{data.wuxing}</Cell>
          </div>
          <div className="grid grid-cols-2">
            <div className="border-r" style={{ borderColor: GOLD_LINE }}>
              <Cell title="星宿">{data.xiu}</Cell>
            </div>
            <Cell title="冲煞">
              <span className="block">{data.chong}</span>
              <span className="block">煞{data.sha}</span>
            </Cell>
          </div>
        </div>
      </div>

      {/* 底部：十二时辰吉凶 */}
      <div className="flex">
        {data.hours.map((h, i) => (
          <div
            key={h.zhi}
            className="flex flex-1 flex-col items-center gap-1.5 py-3"
            style={i < data.hours.length - 1 ? { borderRight: `1px solid ${GOLD_LINE}` } : undefined}
          >
            <span className="text-[13px] text-foreground">{h.zhi}</span>
            <span
              className="text-[11px]"
              style={{ color: h.luck === '吉' ? GOLD : 'hsl(var(--muted-foreground))' }}
              aria-label={`${h.zhi}时${h.luck}`}
            >
              {h.luck}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AlmanacPage({ y, m, d, onBack }: { y: number; m: number; d: number; onBack: () => void }) {
  const data = almanacOf(y, m, d);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  if (!data) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-page-bg text-foreground">
      {/* 顶栏：返回 + 标题 */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回日历"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground transition active:bg-surface-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-[17px] font-medium text-foreground">{data.title}</p>
        <span className="h-9 w-9 shrink-0" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <AlmanacCard data={data} />
        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
          宜忌按建除十二神推算，仅供参考
        </p>
      </div>
    </div>,
    document.body,
  );
}

export default AlmanacPage;

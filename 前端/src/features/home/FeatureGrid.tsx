import { useNavigate } from 'react-router-dom';
import { Heart, BookMarked, ArrowUpRight, type LucideIcon } from 'lucide-react';

interface Feature {
  label: string;
  icon: LucideIcon;
  path?: string;
}

/**
 * 底部辅助功能入口。
 *
 * 2026-10-16：「日记本」按需求收进 together（那边跟相册一起做「回忆与生活记录中心」），
 * 所以从这里移除 —— 要写日记去 together → diary。
 */
const FEATURES: Feature[] = [
  { label: '纪念日', icon: Heart, path: '/memorial' },
  { label: '备忘录', icon: BookMarked, path: '/memo' },
];

/** 图标项外观 */
function FeatureButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="paper-card press group flex items-center gap-3 px-3.5 py-3 text-left"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{label}</span>
        <span className="eyebrow mt-0.5 block leading-none">Open</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-primary" />
    </button>
  );
}

export function FeatureGrid() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 gap-3">
      {FEATURES.map((f) => {
        const path = f.path;
        return (
          <FeatureButton
            key={f.label}
            icon={f.icon}
            label={f.label}
            onClick={path ? () => navigate(path) : undefined}
          />
        );
      })}
    </div>
  );
}

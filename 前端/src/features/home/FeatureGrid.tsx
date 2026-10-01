import { useNavigate } from 'react-router-dom';
import { Heart, BookOpen, BookMarked, type LucideIcon } from 'lucide-react';

interface Feature {
  label: string;
  icon: LucideIcon;
  path?: string;
}

// 底部辅助功能入口（纪念日 / 日记本 / 备忘录 → 详情页）
const FEATURES: Feature[] = [
  { label: '纪念日', icon: Heart, path: '/memorial' },
  { label: '日记本', icon: BookOpen, path: '/diary' },
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
    <button type="button" onClick={onClick} className="flex flex-col items-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/50 bg-white/50 text-primary shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
        <Icon className="h-6 w-6" />
      </span>
      <span className="mt-1.5 text-xs text-foreground/80">{label}</span>
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

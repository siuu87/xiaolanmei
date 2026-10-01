import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface IOSSwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

/** iOS 开关：绿色 = 开启，灰色 = 关闭（h-8 w-14，圆点 h-7 w-7） */
export function IOSSwitch({ checked, defaultChecked, onCheckedChange, disabled }: IOSSwitchProps) {
  const [inner, setInner] = useState(!!defaultChecked);
  const isChecked = checked !== undefined ? checked : inner;

  const toggle = () => {
    if (disabled) return;
    const next = !isChecked;
    if (checked === undefined) setInner(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      onClick={toggle}
      disabled={disabled}
      className={cn(
        'relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200',
        isChecked ? 'bg-green-500' : 'bg-gray-300 dark:bg-zinc-700',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-7 w-7 rounded-full bg-white shadow transition-transform duration-200',
          isChecked && 'translate-x-6',
        )}
      />
    </button>
  );
}

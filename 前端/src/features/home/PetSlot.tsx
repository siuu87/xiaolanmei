/**
 * 桌宠位（2026-11-19 晚起：全息 ASCII 鱼缸）
 *
 * 这一格正方形与礼物盒同款（aspect-square + 圆角），里面放一块
 * 「全息 ASCII 鱼缸」桌宠（`AsciiFishTank`）：深底青辉、ASCII 小鱼巡游，
 * **点击投喂、长按冒泡**，是能互动的桌宠，不再是静态摆件。
 *
 * 将来往里换别的桌宠，把 `<AsciiFishTank />` 整个换掉即可，
 * 外面 grid 一行都不用动。
 * （要是桌宠最后做成浮在整页上的角色，这一格直接删、礼物盒并过去就行。）
 */
import { AsciiFishTank } from './AsciiFishTank';

export function PetSlot({ className = '' }: { className?: string }) {
  return (
    <div
      data-testid="pet-slot"
      className={`aspect-square w-full overflow-hidden rounded-2xl ${className}`}
    >
      <AsciiFishTank />
    </div>
  );
}

export default PetSlot;

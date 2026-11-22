import { TokenCard } from './TokenCard';
import { GiftBoxCard } from './GiftBoxCard';
import { PetSlot } from './PetSlot';
import { WindChime } from './WindChime';
import { LetterInboxCard } from '@/features/notes/LetterInboxCard';

/**
 * 小组件那一排（2026-11-18 立、当晚按用户要求又调了一版）
 *
 * 首页与抽屉「日常生活」本来是两份**一模一样的** JSX（Token 卡 + 信封卡 + 礼物盒），
 * 抽成一份，免得以后两边各改一半。
 *
 * 排布（2026-11-20 再调）：
 *   左 · Token 卡（整列高）
 *   右 · 上：**信封顶左**（左沿与下方礼物盒左沿对齐），信封右侧挂着**小风铃**
 *            （`WindChime`，挂环 + 三根风铃管，碰一下整串摆起来）
 *        下：两格正方形 —— 礼物盒 ｜ 桌宠位（`PetSlot`，全息 ASCII 鱼缸，点击投喂）
 *
 * 为什么信封不在右列里 `w-full`：半屏 ≈ 179px 宽、只有 70px 高，摊成 2.5:1
 * 像一条纸带，不像信封。收窄到 112 之后是 112×70 ≈ 1.6:1，一眼是封信。
 * 高度仍然靠 Token 卡顶出来：右列被 grid 拉满，上排 `flex-1` 吃掉剩下的。
 */
export function WidgetRow() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Token 胶囊：2026-11-21 用户「宽度缩小一点」，从铺满左列收到 150px，
          在左列里居中（w-full + max-w 收敛、justify-self 居中，
          列更窄时自动回退铺满，不会溢出）。右列各卡位置尺寸不动。 */}
      <div data-testid="token-capsule" className="w-full max-w-[150px] justify-self-center">
        <TokenCard />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {/* 上排：信封**顶左**（左沿与下方礼物盒对齐），风铃挂在信封右侧、**垂直居中**。
            2026-11-20 用户定：原先整组居中，信封左沿和礼物盒左沿没对上；
            改成 flex-start 后信封贴左，风铃垂在它右边，像挂在信封侧面。
            2026-11-21：风铃再调成居中（items-center），别顶在最上边。 */}
        <div className="flex min-h-0 flex-1 items-center gap-1.5">
          <LetterInboxCard className="aspect-[8/5] w-[112px] max-w-full shrink-0" />
          <WindChime />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <GiftBoxCard />
          <PetSlot />
        </div>
      </div>
    </div>
  );
}

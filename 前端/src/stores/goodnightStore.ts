import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface GoodnightState {
  /**
   * 用户今天想听的（电台话题）。
   * chat 与 goodnight 共用，是「今晚想听什么」的单一数据源：
   *  - 在 chat 里长按自己的消息「设为今晚电台想听的」会写入这里；
   *  - goodnight 页的输入框也绑定这里；
   *  - 点播放（他开始播出）时，台名与直播内容按这个话题展开。
   */
  request: string;
  setRequest: (v: string) => void;
}

export const useGoodnightStore = create<GoodnightState>()(
  persist(
    (set) => ({
      request: '',
      setRequest: (v) => set({ request: v }),
    }),
    { name: 'blueberry.goodnight' },
  ),
);

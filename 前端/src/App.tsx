import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { useDiaryStore } from './features/diary/diaryStore';
import { useTodoStore } from './features/home/todoStore';
import { useMemorialStore } from './features/home/memorialStore';
import { usePeriodStore } from './features/home/periodStore';
import { startMailRefresh } from './features/notes/notesStore';
import { useStationStore } from './stores/stationStore';
import { useStickerStore } from './stores/stickerStore';
import { useTimetableStore } from './features/schedule/timetableStore';
import { startAutoScanScheduler } from './features/sky/watchAutoScan';
import { startAiMoodScheduler } from './features/home/aiMood';
import { applyTheme, loadTheme } from './features/tavern/phone/datacore/themeCore';

export default function App() {
  // 外观：开屏即套用上次选的配色，不必等进「我 → 外观」才生效
  useEffect(() => applyTheme(loadTheme()), []);

  // 片单自动检索：后台定期扫聊天记录，提到新片就自动加进片单（与当前在哪个页面无关）
  useEffect(() => startAutoScanScheduler(), []);
  // AI 的心情：一天之内挑个不固定的时刻自动抓一次（与当前在哪个页面无关）
  useEffect(() => startAiMoodScheduler(), []);
  // 深夜来信：信由后端不定时抓取，前端定时把新到的取回来（与当前在哪个页面无关）
  useEffect(() => startMailRefresh(), []);

  useEffect(() => {
    void useDiaryStore.getState().load();
    void useTodoStore.getState().load();
    void useMemorialStore.getState().load();
    void usePeriodStore.getState().load();
    void useStationStore.getState().load();
    void useStickerStore.getState().load();
    void useTimetableStore.getState().load();
  }, []);

  return <RouterProvider router={router} />;
}

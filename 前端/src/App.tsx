import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { useDiaryStore } from './features/diary/diaryStore';
import { useTodoStore } from './features/home/todoStore';
import { useMemorialStore } from './features/home/memorialStore';
import { usePeriodStore } from './features/home/periodStore';
import { useNotesStore } from './features/notes/notesStore';
import { useStationStore } from './stores/stationStore';
import { useStickerStore } from './stores/stickerStore';
import { useTimetableStore } from './features/schedule/timetableStore';

export default function App() {
  useEffect(() => {
    void useDiaryStore.getState().load();
    void useTodoStore.getState().load();
    void useMemorialStore.getState().load();
    void usePeriodStore.getState().load();
    void useNotesStore.getState().load();
    void useStationStore.getState().load();
    void useStickerStore.getState().load();
    void useTimetableStore.getState().load();
  }, []);

  return <RouterProvider router={router} />;
}

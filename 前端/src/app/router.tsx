import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { HomePage } from '@/features/home/HomePage';
import { StarrySkyPage } from '@/features/sky/StarrySkyPage';
import { FoodPage } from '@/features/sky/FoodPage';
import { FoodDetailPage } from '@/features/sky/FoodDetailPage';
import { ReadPage } from '@/features/sky/ReadPage';
import { ListenPage } from '@/features/sky/ListenPage';
import { LibraryPage } from '@/features/sky/LibraryPage';
import { TavernPage } from '@/features/tavern/TavernPage';
import { BookReaderPage } from '@/features/sky/BookReaderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DiaryPage } from '@/features/diary/DiaryPage';
import { MemorialPage } from '@/features/memorial/MemorialPage';
import { NotesPage } from '@/features/notes/NotesPage';
import { SchedulePage } from '@/features/schedule/SchedulePage';
import { MemoHomePage } from '@/features/memo/MemoHomePage';

/** 聊天是底座常驻层（AppLayout 里直接挂），路由上留个空位只为给个 URL */
const Noop = () => null;

/**
 * 路由表（双层结构）：
 * - `/chat` 是主聊天流，默认进入；AppLayout 把它作为常驻底座，这里渲染空。
 * - 其余路由都是「覆盖层」，叠在聊天上面，一键返回即回到对话（聊天不重载）。
 * - `/tavern`（酒馆小手机）例外：整页沉浸替换，不挂聊天底座。
 * - `/home` 保留旧首页作为备用路由。
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'chat', element: <Noop /> },
      { path: 'home', element: <HomePage /> },
      { path: 'sky', element: <StarrySkyPage /> },
      // 星空里的功能星（非 Tab）
      { path: 'food', element: <FoodPage /> },
      { path: 'food/:id', element: <FoodDetailPage /> },
      { path: 'read', element: <ReadPage /> },
      { path: 'listen', element: <ListenPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'tavern', element: <TavernPage /> },
      { path: 'read/:id', element: <BookReaderPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // 详情子页（非 Tab）
      { path: 'diary', element: <DiaryPage /> },
      { path: 'memorial', element: <MemorialPage /> },
      { path: 'notes', element: <NotesPage /> },
      // 一封来信的独立阅读页：内容由 AppLayout 叠在侧边栏之上（这里渲染空）
      { path: 'letter/:id', element: <Noop /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'memo', element: <MemoHomePage /> },
      // 兜底：未知路径（含已移除的旧路由）回到首页，避免客户端 404
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

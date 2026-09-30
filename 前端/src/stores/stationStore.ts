import { create } from 'zustand';
import {
  listStations,
  createStation,
  patchStation,
  deleteStation,
  type Station,
  type StationInput,
} from '@/lib/api/stations';

interface StationState {
  stations: Station[];
  loaded: boolean;
  load: () => Promise<void>;
  addStation: (input: StationInput) => Promise<void>;
  updateStation: (id: string, patch: Partial<StationInput>) => Promise<void>;
  removeStation: (id: string) => Promise<void>;
}

/**
 * API 站子 store：供设置页（增删改）与聊天页模型选择器共用。
 * 增删改后从后端重拉（保证 isDefault 唯一等一致性）。
 */
export const useStationStore = create<StationState>((set, get) => ({
  stations: [],
  loaded: false,

  load: async () => {
    try {
      set({ stations: await listStations(), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addStation: async (input) => {
    await createStation(input);
    await get().load();
  },

  updateStation: async (id, patch) => {
    await patchStation(id, patch);
    await get().load();
  },

  removeStation: async (id) => {
    await deleteStation(id);
    set((s) => ({ stations: s.stations.filter((x) => x.id !== id) }));
  },
}));

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

interface PanelSettings {
  timezone: string;
  panel_name: string;
  panel_language: string;
  [key: string]: unknown;
}

interface SettingsState {
  timezone: string;
  panelName: string;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  setTimezone: (tz: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      timezone: 'UTC',
      panelName: 'ITDLUPanel',
      loaded: false,
      fetchSettings: async () => {
        try {
          const { data } = await api.get<ApiResponse<PanelSettings>>('/settings');
          const s = data.data;
          set({
            timezone: s.timezone || 'UTC',
            panelName: s.panel_name || 'ITDLUPanel',
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      },
      setTimezone: (tz: string) => set({ timezone: tz }),
    }),
    {
      name: 'itdlu-settings',
      partialize: (state) => ({ timezone: state.timezone, panelName: state.panelName }),
    }
  )
);

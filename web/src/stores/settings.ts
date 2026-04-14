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
  hiddenMenuKeys: string[];
  fetchSettings: () => Promise<void>;
  setTimezone: (tz: string) => void;
  setPanelName: (name: string) => void;
  setHiddenMenuKeys: (keys: string[]) => void;
  toggleMenuKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      timezone: 'UTC',
      panelName: 'ITDLUPanel',
      loaded: false,
      hiddenMenuKeys: [],
      fetchSettings: async () => {
        try {
          const { data } = await api.get<ApiResponse<PanelSettings>>('/settings');
          const s = data.data;
          const name = s.panel_name || 'ITDLUPanel';
          document.title = name;
          set({
            timezone: s.timezone || 'UTC',
            panelName: name,
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      },
      setTimezone: (tz: string) => set({ timezone: tz }),
      setPanelName: (name: string) => {
        document.title = name;
        set({ panelName: name });
      },
      setHiddenMenuKeys: (keys: string[]) => set({ hiddenMenuKeys: keys }),
      toggleMenuKey: (key: string) => {
        const current = get().hiddenMenuKeys;
        const next = current.includes(key)
          ? current.filter(k => k !== key)
          : [...current, key];
        set({ hiddenMenuKeys: next });
      },
    }),
    {
      name: 'itdlu-settings',
      partialize: (state) => ({
        timezone: state.timezone,
        panelName: state.panelName,
        hiddenMenuKeys: state.hiddenMenuKeys,
      }),
    }
  )
);

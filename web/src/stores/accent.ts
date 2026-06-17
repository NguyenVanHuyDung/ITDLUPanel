import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';
import { ACCENT_PALETTES, DEFAULT_ACCENT_ID, findAccentPalette, type AccentPalettePreset } from '@/lib/palettes';
import { useThemeStore } from '@/stores/theme';

interface AccentState {
  paletteId: string;
  loaded: boolean;
  setPalette: (id: string) => Promise<void>;
  applyFromServer: (id: string | undefined | null) => void;
  fetchFromServer: () => Promise<void>;
}

const STORAGE_KEY = 'itdlu_accent_palette';

function applyCssVariables(palette: AccentPalettePreset, isDark: boolean): void {
  const root = document.documentElement;
  const accent = isDark ? palette.dark : palette.light;

  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-accent-rgb', hexToRgbString(accent));
  root.style.setProperty('--color-accent-soft', `${accent}1A`);
  root.style.setProperty('--color-accent-strong', `${accent}26`);
  root.style.setProperty('--header-gradient',
    `linear-gradient(135deg, ${shift(accent, -0.25)} 0%, ${accent} 50%, ${shift(accent, 0.15)} 100%)`,
  );

  root.setAttribute('data-accent', palette.id);
}

function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '21, 101, 192';
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// Lightens (positive amount) or darkens (negative amount) a hex color.
function shift(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  let r = parseInt(clean.substring(0, 2), 16);
  let g = parseInt(clean.substring(2, 4), 16);
  let b = parseInt(clean.substring(4, 6), 16);
  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * (1 + amount));
    g = Math.round(g * (1 + amount));
    b = Math.round(b * (1 + amount));
  }
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(n => n.toString(16).padStart(2, '0')).join('');
}

function currentPaletteId(paletteId: string): string {
  return findAccentPalette(paletteId).id;
}

export const useAccentStore = create<AccentState>()(
  persist(
    (set, get) => ({
      paletteId: DEFAULT_ACCENT_ID,
      loaded: false,

      applyFromServer: (id) => {
        const resolved = currentPaletteId(id ?? get().paletteId);
        set({ paletteId: resolved, loaded: true });
        const isDark = useThemeStore.getState().mode === 'dark';
        applyCssVariables(findAccentPalette(resolved), isDark);
      },

      fetchFromServer: async () => {
        try {
          const { data } = await api.get<{ data: Record<string, string> }>('/settings');
          const serverId = data?.data?.accent_palette;
          get().applyFromServer(serverId);
        } catch {
          // Local storage fallback is already applied
          const isDark = useThemeStore.getState().mode === 'dark';
          applyCssVariables(findAccentPalette(get().paletteId), isDark);
          set({ loaded: true });
        }
      },

      setPalette: async (id) => {
        const resolved = currentPaletteId(id);
        // 1) Optimistic local apply for instant preview
        const isDark = useThemeStore.getState().mode === 'dark';
        applyCssVariables(findAccentPalette(resolved), isDark);
        set({ paletteId: resolved });

        // 2) Persist to server
        try {
          await api.put('/settings/accent-palette', { palette_id: resolved });
        } catch {
          // Local persistence still works via zustand persist middleware
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ paletteId: state.paletteId }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const isDark = useThemeStore.getState().mode === 'dark';
        applyCssVariables(findAccentPalette(state.paletteId), isDark);
      },
    }
  )
);

// Re-apply CSS variables when the theme mode changes so the variant follows light/dark.
useThemeStore.subscribe((state, prev) => {
  if (state.mode !== prev.mode) {
    const { paletteId } = useAccentStore.getState();
    applyCssVariables(findAccentPalette(paletteId), state.mode === 'dark');
  }
});

export function listAccentPalettes(): AccentPalettePreset[] {
  return ACCENT_PALETTES;
}

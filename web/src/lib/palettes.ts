// Accent palette presets — used to recolor buttons, links, header gradient,
// and the active sidebar item. Each palette ships with a light and dark variant;
// the active variant is picked at runtime from useThemeStore.

export interface AccentPalettePreset {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const ACCENT_PALETTES: AccentPalettePreset[] = [
  { id: 'default', name: 'DLU Blue',         light: '#1565C0', dark: '#1E88E5' },
  { id: 'ocean',   name: 'Ocean Teal',       light: '#0F766E', dark: '#2DD4BF' },
  { id: 'emerald', name: 'Emerald Forest',   light: '#15803D', dark: '#22C55E' },
  { id: 'sunset',  name: 'Sunset Orange',    light: '#EA580C', dark: '#FB923C' },
  { id: 'crimson', name: 'Crimson Red',      light: '#DC2626', dark: '#F87171' },
  { id: 'purple',  name: 'Royal Purple',     light: '#7C3AED', dark: '#A78BFA' },
  { id: 'rose',    name: 'Rose Pink',        light: '#E11D48', dark: '#FB7185' },
  { id: 'slate',   name: 'Slate Gray',       light: '#475569', dark: '#94A3B8' },
];

export const DEFAULT_ACCENT_ID = 'default';

export function findAccentPalette(id: string | undefined | null): AccentPalettePreset {
  if (!id) return ACCENT_PALETTES[0];
  return ACCENT_PALETTES.find(p => p.id === id) ?? ACCENT_PALETTES[0];
}

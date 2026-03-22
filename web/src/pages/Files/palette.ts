import { useThemeStore } from '@/stores/theme';

export interface Palette {
  card: string;
  cardBorder: string;
  headerBg: string;
  colHeaderBg: string;
  rowHover: string;
  rowAlt: string;
  text: string;
  textMuted: string;
  textDim: string;
  barTrack: string;
  expandBg: string;
  codeBg: string;
  inputBg: string;
  accent: string;
  green: string;
  greenDim: string;
  amber: string;
  amberDim: string;
  red: string;
  redDim: string;
  purple: string;
  cyan: string;
}

const darkPalette: Palette = {
  card: '#111827',
  cardBorder: '#1E293B',
  headerBg: '#0F172A',
  colHeaderBg: 'rgba(15,23,42,0.3)',
  rowHover: 'rgba(56,189,248,0.04)',
  rowAlt: 'rgba(15,23,42,0.5)',
  text: '#E2E8F0',
  textMuted: '#64748B',
  textDim: '#475569',
  barTrack: 'rgba(30,41,59,0.8)',
  expandBg: 'rgba(15,23,42,0.6)',
  codeBg: 'rgba(0,0,0,0.3)',
  inputBg: 'rgba(15,23,42,0.6)',
  accent: '#38BDF8',
  green: '#34D399',
  greenDim: '#059669',
  amber: '#FBBF24',
  amberDim: '#D97706',
  red: '#F87171',
  redDim: '#DC2626',
  purple: '#A78BFA',
  cyan: '#22D3EE',
};

const lightPalette: Palette = {
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  headerBg: '#F8FAFC',
  colHeaderBg: '#F1F5F9',
  rowHover: 'rgba(37,99,235,0.04)',
  rowAlt: '#F8FAFC',
  text: '#1E293B',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  barTrack: '#E2E8F0',
  expandBg: '#F1F5F9',
  codeBg: '#F8FAFC',
  inputBg: '#F1F5F9',
  accent: '#2563EB',
  green: '#16A34A',
  greenDim: '#15803D',
  amber: '#D97706',
  amberDim: '#B45309',
  red: '#DC2626',
  redDim: '#B91C1C',
  purple: '#7C3AED',
  cyan: '#0891B2',
};

export function usePalette(): { p: Palette; isDark: boolean } {
  const { mode } = useThemeStore();
  const isDark = mode === 'dark';
  return { p: isDark ? darkPalette : lightPalette, isDark };
}

export const mono = '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';

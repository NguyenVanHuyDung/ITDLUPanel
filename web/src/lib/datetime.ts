import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { useSettingsStore } from '@/stores/settings';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Format a date/time string or Date in the panel's configured timezone. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  format = 'YYYY-MM-DD HH:mm:ss',
): string {
  if (!value) return '-';
  const tz = useSettingsStore.getState().timezone || 'UTC';
  return dayjs(value).tz(tz).format(format);
}

/** Format a date string (no time) in the panel's configured timezone. */
export function formatDate(
  value: string | number | Date | null | undefined,
  format = 'YYYY-MM-DD',
): string {
  if (!value) return '-';
  const tz = useSettingsStore.getState().timezone || 'UTC';
  return dayjs(value).tz(tz).format(format);
}

/** Format a time string (no date) in the panel's configured timezone. */
export function formatTime(
  value: string | number | Date | null | undefined,
  format = 'HH:mm:ss',
): string {
  if (!value) return '-';
  const tz = useSettingsStore.getState().timezone || 'UTC';
  return dayjs(value).tz(tz).format(format);
}

/** Get a dayjs instance in the panel's configured timezone. */
export function panelDayjs(value?: string | number | Date) {
  const tz = useSettingsStore.getState().timezone || 'UTC';
  return value ? dayjs(value).tz(tz) : dayjs().tz(tz);
}

/** Get the current configured timezone. */
export function getPanelTimezone(): string {
  return useSettingsStore.getState().timezone || 'UTC';
}

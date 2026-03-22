/* ──────────────── Constants for Files page ──────────────── */

export const BOOKMARK_KEY = 'itdlu_file_bookmarks';
export const PAGE_SIZE_KEY = 'itdlu_file_page_size';
export const VIEW_MODE_KEY = 'itdlu_file_view_mode';

export const DEFAULT_PATH = '/root';

export const DEFAULT_BOOKMARKS = [
  { path: '/www', label: 'www' },
  { path: '/root', label: 'root' },
  { path: '/var/log', label: 'log' },
];

export const PAGE_SIZE_OPTIONS = [
  { value: 25, label: '25 / page' },
  { value: 50, label: '50 / page' },
  { value: 100, label: '100 / page' },
  { value: 200, label: '200 / page' },
];

export const COMPRESS_FORMATS = [
  { value: 'zip', label: 'ZIP' },
  { value: 'tar.gz', label: 'TAR.GZ' },
  { value: 'tar', label: 'TAR' },
];

export const ARCHIVE_EXTENSIONS = ['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz'];

export const PERM_LABELS = ['Read', 'Write', 'Execute'] as const;
export const PERM_GROUPS = ['Owner', 'Group', 'Other'] as const;

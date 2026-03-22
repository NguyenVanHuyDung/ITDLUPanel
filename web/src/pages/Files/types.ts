/* ──────────────── Types for Files page ──────────────── */

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mode: string;
  mode_octal: string;
  owner: string;
  group: string;
  mod_time: string;
  is_symlink: boolean;
  link_target: string;
  mime_type: string;
}

export interface Bookmark {
  path: string;
  label: string;
}

export type ViewMode = 'list' | 'grid';
export type MoveMode = 'copy' | 'move';

export interface ContextMenuState {
  x: number;
  y: number;
  file: FileItem;
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Table, Button, Space, Input, Modal, Upload, message,
  Dropdown, Tooltip, Checkbox, Select, Pagination,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  FolderFilled, FileOutlined, FileTextOutlined,
  FilePdfOutlined, FileImageOutlined, FileZipOutlined,
  Html5Outlined, DownloadOutlined, DeleteOutlined,
  EditOutlined, UploadOutlined, FolderAddOutlined, FileAddOutlined,
  ReloadOutlined, HomeOutlined, ScissorOutlined, CopyOutlined,
  MoreOutlined, ExclamationCircleOutlined, SearchOutlined,
  CloseOutlined, StarOutlined,
  AppstoreOutlined, UnorderedListOutlined, CodeOutlined,
  CompressOutlined, SwapOutlined,
  InfoCircleOutlined, LeftOutlined, RightOutlined,
  CloudOutlined, EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import CodeEditor from './CodeEditor';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuthStore } from '@/stores/auth';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

/* ──────────────── Types ──────────────── */

interface FileItem {
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

interface Bookmark {
  path: string;
  label: string;
}

/* ──────────────── Constants ──────────────── */

const C = {
  primary: '#1565C0',
  primaryLight: '#1E88E5',
  primaryDark: '#0D47A1',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  bg: '#E3F2FD',
  text: '#1A1A2E',
  textSecondary: '#64748B',
  border: '#E8EDF2',
  white: '#FFFFFF',
};
const BOOKMARK_KEY = 'itdlu_file_bookmarks';
const PAGE_SIZE_KEY = 'itdlu_file_page_size';
const DEFAULT_BOOKMARKS: Bookmark[] = [
  { path: '/www', label: 'www' },
  { path: '/root', label: 'root' },
  { path: '/var/log', label: 'log' },
];

/* ──────────────── File Icons ──────────────── */

// Badge-style icon: colored rounded rect with extension text
const ExtBadge = ({ text, bg, fg = '#fff' }: { text: string; bg: string; fg?: string }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: 4, background: bg,
    color: fg, fontSize: 8, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1, letterSpacing: -0.3, flexShrink: 0,
  }}>{text}</span>
);

// SVG mini-icons for specific types
const SvgHtml = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#e44d26"/><path d="M5 4l1 11 4 1.5 4-1.5 1-11H5zm8.2 3.4H7.5l.2 2h5.3l-.4 4.4L10 15l-2.6-.8-.2-2h1.6l.1 1 1.1.3 1.1-.3.1-1.5H7.8L7.5 7.4h5l-.3 0z" fill="#fff"/></svg>
);
const SvgCss = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#264de4"/><path d="M5 4l1 11 4 1.5 4-1.5 1-11H5zm8.1 3.4l-.1.6H8l.1 1.4h4.7l-.4 4.4L10 15l-2.4-.8-.2-1.6h1.5l.1.8.9.3 1-.3.1-1.3H7.8L7.4 7.4h5.1l-.4 0z" fill="#fff"/></svg>
);
const SvgJs = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#f7df1e"/><text x="10" y="14.5" textAnchor="middle" fill="#323330" fontSize="10" fontWeight="700" fontFamily="monospace">JS</text></svg>
);
const SvgTs = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#3178c6"/><text x="10" y="14.5" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="monospace">TS</text></svg>
);
const SvgPy = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#3572a5"/><text x="10" y="14.5" textAnchor="middle" fill="#ffd43b" fontSize="10" fontWeight="700" fontFamily="monospace">PY</text></svg>
);
const SvgGo = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#00add8"/><text x="10" y="14.5" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="monospace">GO</text></svg>
);
const SvgPhp = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#777bb4"/><text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="monospace">PHP</text></svg>
);
const SvgRust = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#dea584"/><text x="10" y="14.5" textAnchor="middle" fill="#000" fontSize="10" fontWeight="700" fontFamily="monospace">RS</text></svg>
);
const SvgJson = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#5b5b5b"/><text x="10" y="13" textAnchor="middle" fill="#f7df1e" fontSize="12" fontWeight="700" fontFamily="monospace">{'{}'}</text></svg>
);
const SvgMd = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#083fa1"/><text x="10" y="14.5" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="monospace">MD</text></svg>
);
const SvgSql = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#e38c00"/><text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="monospace">SQL</text></svg>
);
const SvgShell = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#2b2b2b"/><text x="10" y="14.5" textAnchor="middle" fill="#89e051" fontSize="10" fontWeight="700" fontFamily="monospace">&gt;_</text></svg>
);
const SvgDocker = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#2496ed"/><text x="10" y="14.5" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="monospace">🐳</text></svg>
);
const SvgYaml = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#cb171e"/><text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="monospace">YML</text></svg>
);
const SvgXml = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#e44d26"/><text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="monospace">XML</text></svg>
);

const EXT_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  // Web
  html: { icon: <SvgHtml />, color: '#e44d26' },
  htm: { icon: <SvgHtml />, color: '#e44d26' },
  css: { icon: <SvgCss />, color: '#264de4' },
  scss: { icon: <ExtBadge text="SC" bg="#c6538c" />, color: '#c6538c' },
  sass: { icon: <ExtBadge text="SA" bg="#c6538c" />, color: '#c6538c' },
  less: { icon: <ExtBadge text="LE" bg="#1d365d" />, color: '#1d365d' },
  vue: { icon: <ExtBadge text="VU" bg="#42b883" />, color: '#42b883' },
  svelte: { icon: <ExtBadge text="SV" bg="#ff3e00" />, color: '#ff3e00' },

  // JavaScript / TypeScript
  js: { icon: <SvgJs />, color: '#f7df1e' },
  mjs: { icon: <SvgJs />, color: '#f7df1e' },
  cjs: { icon: <SvgJs />, color: '#f7df1e' },
  jsx: { icon: <ExtBadge text="JSX" bg="#61dafb" fg="#000" />, color: '#61dafb' },
  ts: { icon: <SvgTs />, color: '#3178c6' },
  tsx: { icon: <ExtBadge text="TSX" bg="#3178c6" />, color: '#3178c6' },

  // Programming languages
  php: { icon: <SvgPhp />, color: '#777bb4' },
  py: { icon: <SvgPy />, color: '#3572a5' },
  pyw: { icon: <SvgPy />, color: '#3572a5' },
  go: { icon: <SvgGo />, color: '#00add8' },
  rs: { icon: <SvgRust />, color: '#dea584' },
  java: { icon: <ExtBadge text="JA" bg="#b07219" />, color: '#b07219' },
  kt: { icon: <ExtBadge text="KT" bg="#A97BFF" />, color: '#A97BFF' },
  kts: { icon: <ExtBadge text="KT" bg="#A97BFF" />, color: '#A97BFF' },
  rb: { icon: <ExtBadge text="RB" bg="#cc342d" />, color: '#cc342d' },
  c: { icon: <ExtBadge text="C" bg="#555555" />, color: '#555555' },
  h: { icon: <ExtBadge text="H" bg="#555555" />, color: '#555555' },
  cpp: { icon: <ExtBadge text="C+" bg="#f34b7d" />, color: '#f34b7d' },
  cc: { icon: <ExtBadge text="C+" bg="#f34b7d" />, color: '#f34b7d' },
  hpp: { icon: <ExtBadge text="H+" bg="#f34b7d" />, color: '#f34b7d' },
  cs: { icon: <ExtBadge text="C#" bg="#178600" />, color: '#178600' },
  swift: { icon: <ExtBadge text="SW" bg="#F05138" />, color: '#F05138' },
  dart: { icon: <ExtBadge text="DA" bg="#00B4AB" />, color: '#00B4AB' },
  r: { icon: <ExtBadge text="R" bg="#276DC3" />, color: '#276DC3' },
  lua: { icon: <ExtBadge text="LU" bg="#000080" />, color: '#000080' },
  perl: { icon: <ExtBadge text="PL" bg="#0298c3" />, color: '#0298c3' },
  pl: { icon: <ExtBadge text="PL" bg="#0298c3" />, color: '#0298c3' },
  scala: { icon: <ExtBadge text="SC" bg="#DC322F" />, color: '#DC322F' },
  ex: { icon: <ExtBadge text="EX" bg="#6e4a7e" />, color: '#6e4a7e' },
  exs: { icon: <ExtBadge text="EX" bg="#6e4a7e" />, color: '#6e4a7e' },
  erl: { icon: <ExtBadge text="ER" bg="#B83998" />, color: '#B83998' },
  zig: { icon: <ExtBadge text="ZG" bg="#f7a41d" fg="#000" />, color: '#f7a41d' },
  nim: { icon: <ExtBadge text="NM" bg="#ffc200" fg="#000" />, color: '#ffc200' },
  v: { icon: <ExtBadge text="V" bg="#5d87bf" />, color: '#5d87bf' },
  asm: { icon: <ExtBadge text="AS" bg="#6E4C13" />, color: '#6E4C13' },
  s: { icon: <ExtBadge text="AS" bg="#6E4C13" />, color: '#6E4C13' },

  // Shell / Scripts
  sh: { icon: <SvgShell />, color: '#89e051' },
  bash: { icon: <SvgShell />, color: '#89e051' },
  zsh: { icon: <SvgShell />, color: '#89e051' },
  fish: { icon: <SvgShell />, color: '#89e051' },
  ps1: { icon: <ExtBadge text="PS" bg="#012456" />, color: '#012456' },
  bat: { icon: <ExtBadge text="BA" bg="#C1F12E" fg="#000" />, color: '#C1F12E' },
  cmd: { icon: <ExtBadge text="CM" bg="#C1F12E" fg="#000" />, color: '#C1F12E' },

  // Data / Config
  json: { icon: <SvgJson />, color: '#5b5b5b' },
  jsonc: { icon: <SvgJson />, color: '#5b5b5b' },
  json5: { icon: <SvgJson />, color: '#5b5b5b' },
  yaml: { icon: <SvgYaml />, color: '#cb171e' },
  yml: { icon: <SvgYaml />, color: '#cb171e' },
  xml: { icon: <SvgXml />, color: '#e44d26' },
  toml: { icon: <ExtBadge text="TM" bg="#9c4221" />, color: '#9c4221' },
  ini: { icon: <ExtBadge text="INI" bg="#8e8e8e" />, color: '#8e8e8e' },
  conf: { icon: <ExtBadge text="CF" bg="#6d8086" />, color: '#6d8086' },
  cfg: { icon: <ExtBadge text="CF" bg="#6d8086" />, color: '#6d8086' },
  env: { icon: <ExtBadge text="ENV" bg="#ecd53f" fg="#000" />, color: '#ecd53f' },
  properties: { icon: <ExtBadge text="PR" bg="#2d6b3e" />, color: '#2d6b3e' },
  csv: { icon: <ExtBadge text="CSV" bg="#237346" />, color: '#237346' },
  tsv: { icon: <ExtBadge text="TSV" bg="#237346" />, color: '#237346' },

  // SQL / Database
  sql: { icon: <SvgSql />, color: '#e38c00' },
  db: { icon: <ExtBadge text="DB" bg="#e38c00" />, color: '#e38c00' },
  sqlite: { icon: <ExtBadge text="SQ" bg="#003B57" />, color: '#003B57' },
  sqlite3: { icon: <ExtBadge text="SQ" bg="#003B57" />, color: '#003B57' },

  // Markdown / Docs
  md: { icon: <SvgMd />, color: '#083fa1' },
  mdx: { icon: <SvgMd />, color: '#083fa1' },
  rst: { icon: <ExtBadge text="RST" bg="#141414" />, color: '#141414' },
  tex: { icon: <ExtBadge text="TEX" bg="#3D6117" />, color: '#3D6117' },
  txt: { icon: <FileTextOutlined />, color: '#666' },
  log: { icon: <FileTextOutlined />, color: '#999' },
  diff: { icon: <ExtBadge text="DIF" bg="#41b883" />, color: '#41b883' },
  patch: { icon: <ExtBadge text="PAT" bg="#41b883" />, color: '#41b883' },

  // Docker / DevOps
  dockerfile: { icon: <SvgDocker />, color: '#2496ed' },
  dockerignore: { icon: <SvgDocker />, color: '#2496ed' },

  // Images
  jpg: { icon: <FileImageOutlined />, color: '#e91e63' },
  jpeg: { icon: <FileImageOutlined />, color: '#e91e63' },
  png: { icon: <FileImageOutlined />, color: '#e91e63' },
  gif: { icon: <FileImageOutlined />, color: '#e91e63' },
  svg: { icon: <FileImageOutlined />, color: '#ff9800' },
  ico: { icon: <FileImageOutlined />, color: '#e91e63' },
  webp: { icon: <FileImageOutlined />, color: '#e91e63' },
  bmp: { icon: <FileImageOutlined />, color: '#e91e63' },
  tiff: { icon: <FileImageOutlined />, color: '#e91e63' },
  tif: { icon: <FileImageOutlined />, color: '#e91e63' },
  avif: { icon: <FileImageOutlined />, color: '#e91e63' },
  psd: { icon: <ExtBadge text="PSD" bg="#31A8FF" />, color: '#31A8FF' },
  ai: { icon: <ExtBadge text="AI" bg="#FF9A00" />, color: '#FF9A00' },
  fig: { icon: <ExtBadge text="FIG" bg="#F24E1E" />, color: '#F24E1E' },
  sketch: { icon: <ExtBadge text="SK" bg="#FDB300" fg="#000" />, color: '#FDB300' },

  // Audio / Video
  mp3: { icon: <ExtBadge text="MP3" bg="#e91e63" />, color: '#e91e63' },
  wav: { icon: <ExtBadge text="WAV" bg="#e91e63" />, color: '#e91e63' },
  ogg: { icon: <ExtBadge text="OGG" bg="#e91e63" />, color: '#e91e63' },
  flac: { icon: <ExtBadge text="FLC" bg="#e91e63" />, color: '#e91e63' },
  mp4: { icon: <ExtBadge text="MP4" bg="#9c27b0" />, color: '#9c27b0' },
  avi: { icon: <ExtBadge text="AVI" bg="#9c27b0" />, color: '#9c27b0' },
  mkv: { icon: <ExtBadge text="MKV" bg="#9c27b0" />, color: '#9c27b0' },
  mov: { icon: <ExtBadge text="MOV" bg="#9c27b0" />, color: '#9c27b0' },
  webm: { icon: <ExtBadge text="WBM" bg="#9c27b0" />, color: '#9c27b0' },

  // Archives
  zip: { icon: <FileZipOutlined />, color: '#795548' },
  tar: { icon: <FileZipOutlined />, color: '#795548' },
  gz: { icon: <FileZipOutlined />, color: '#795548' },
  tgz: { icon: <FileZipOutlined />, color: '#795548' },
  bz2: { icon: <FileZipOutlined />, color: '#795548' },
  xz: { icon: <FileZipOutlined />, color: '#795548' },
  rar: { icon: <FileZipOutlined />, color: '#795548' },
  '7z': { icon: <FileZipOutlined />, color: '#795548' },
  deb: { icon: <ExtBadge text="DEB" bg="#A80030" />, color: '#A80030' },
  rpm: { icon: <ExtBadge text="RPM" bg="#e95420" />, color: '#e95420' },

  // Documents
  pdf: { icon: <FilePdfOutlined />, color: '#f44336' },
  doc: { icon: <ExtBadge text="DOC" bg="#2b579a" />, color: '#2b579a' },
  docx: { icon: <ExtBadge text="DOC" bg="#2b579a" />, color: '#2b579a' },
  xls: { icon: <ExtBadge text="XLS" bg="#217346" />, color: '#217346' },
  xlsx: { icon: <ExtBadge text="XLS" bg="#217346" />, color: '#217346' },
  ppt: { icon: <ExtBadge text="PPT" bg="#d24726" />, color: '#d24726' },
  pptx: { icon: <ExtBadge text="PPT" bg="#d24726" />, color: '#d24726' },

  // Fonts
  ttf: { icon: <ExtBadge text="TTF" bg="#4a86c8" />, color: '#4a86c8' },
  otf: { icon: <ExtBadge text="OTF" bg="#4a86c8" />, color: '#4a86c8' },
  woff: { icon: <ExtBadge text="WF" bg="#4a86c8" />, color: '#4a86c8' },
  woff2: { icon: <ExtBadge text="WF2" bg="#4a86c8" />, color: '#4a86c8' },
  eot: { icon: <ExtBadge text="EOT" bg="#4a86c8" />, color: '#4a86c8' },

  // Certificates / Keys
  pem: { icon: <ExtBadge text="PEM" bg="#50ae54" />, color: '#50ae54' },
  crt: { icon: <ExtBadge text="CRT" bg="#50ae54" />, color: '#50ae54' },
  cer: { icon: <ExtBadge text="CER" bg="#50ae54" />, color: '#50ae54' },
  key: { icon: <ExtBadge text="KEY" bg="#c0392b" />, color: '#c0392b' },
  pub: { icon: <ExtBadge text="PUB" bg="#50ae54" />, color: '#50ae54' },

  // Package / Lock files
  lock: { icon: <ExtBadge text="LCK" bg="#8e8e8e" />, color: '#8e8e8e' },

  // Binary / Executable
  bin: { icon: <ExtBadge text="BIN" bg="#424242" />, color: '#424242' },
  exe: { icon: <ExtBadge text="EXE" bg="#424242" />, color: '#424242' },
  so: { icon: <ExtBadge text="SO" bg="#424242" />, color: '#424242' },
  dll: { icon: <ExtBadge text="DLL" bg="#424242" />, color: '#424242' },
  o: { icon: <ExtBadge text="OBJ" bg="#424242" />, color: '#424242' },
  a: { icon: <ExtBadge text="LIB" bg="#424242" />, color: '#424242' },
  wasm: { icon: <ExtBadge text="WA" bg="#654ff0" />, color: '#654ff0' },
};

/* ──────────────── Helpers ──────────────── */

function getFileIcon(file: FileItem): React.ReactNode {
  if (file.is_dir) {
    return <FolderFilled style={{ color: '#faad14', fontSize: 18 }} />;
  }
  const name = file.name.toLowerCase();
  // Special filenames
  if (name === 'dockerfile' || name.startsWith('dockerfile.'))
    return <SvgDocker />;
  if (name === '.dockerignore')
    return <SvgDocker />;
  if (name === 'makefile' || name === 'gnumakefile')
    return <ExtBadge text="MK" bg="#6d8086" />;
  if (name === '.gitignore' || name === '.gitattributes' || name === '.gitmodules')
    return <ExtBadge text="GIT" bg="#f05032" />;
  if (name === '.editorconfig')
    return <ExtBadge text="EC" bg="#e0efef" fg="#000" />;
  if (name === '.prettierrc' || name === '.prettierignore')
    return <ExtBadge text="PTR" bg="#c596c7" />;
  if (name === '.eslintrc' || name.startsWith('.eslint'))
    return <ExtBadge text="ESL" bg="#4b32c3" />;
  if (name === 'package.json')
    return <ExtBadge text="NPM" bg="#cb3837" />;
  if (name === 'tsconfig.json' || name.startsWith('tsconfig.'))
    return <SvgTs />;
  if (name === 'go.mod' || name === 'go.sum')
    return <SvgGo />;
  if (name === 'cargo.toml' || name === 'cargo.lock')
    return <SvgRust />;
  if (name === 'requirements.txt' || name === 'setup.py' || name === 'pyproject.toml' || name === 'pipfile')
    return <SvgPy />;
  if (name === 'license' || name === 'licence' || name.startsWith('license.') || name.startsWith('licence.'))
    return <ExtBadge text="LIC" bg="#f9a825" fg="#000" />;
  if (name === 'readme' || name.startsWith('readme.'))
    return <SvgMd />;
  if (name === 'nginx.conf' || name.endsWith('.nginx'))
    return <ExtBadge text="NGX" bg="#009639" />;

  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const mapping = EXT_ICON_MAP[ext];
  if (mapping) {
    return mapping.icon;
  }
  return <FileOutlined style={{ color: '#5b9bd5', fontSize: 16 }} />;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parentPath(p: string): string {
  if (p === '/') return '/';
  const parts = p.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.join('/') || '/';
}

function octalToPerms(octal: string): boolean[] {
  const digits = octal.padStart(3, '0').split('').map(Number);
  const perms: boolean[] = [];
  for (const d of digits) {
    perms.push(!!(d & 4), !!(d & 2), !!(d & 1));
  }
  return perms;
}

function permsToOctal(perms: boolean[]): string {
  let result = '';
  for (let i = 0; i < 3; i++) {
    const r = perms[i * 3] ? 4 : 0;
    const w = perms[i * 3 + 1] ? 2 : 0;
    const x = perms[i * 3 + 2] ? 1 : 0;
    result += String(r + w + x);
  }
  return result;
}

function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [...DEFAULT_BOOKMARKS];
}

function saveBookmarks(bm: Bookmark[]) {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bm));
}

function loadPageSize(): number {
  try {
    const v = localStorage.getItem(PAGE_SIZE_KEY);
    if (v) return parseInt(v, 10);
  } catch { /* ignore */ }
  return 50;
}

/* ──────────────── Component ──────────────── */

export default function Files() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // Navigation state
  const [currentPath, setCurrentPath] = useState('/root');
  const [history, setHistory] = useState<string[]>(['/root']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // File data
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const bookmarkBarRef = useRef<HTMLDivElement>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);

  // Search
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Code Editor (floating)
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorFiles, setEditorFiles] = useState<string[]>([]);
  const [editorDir, setEditorDir] = useState('');

  // Rename modal
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameFile, setRenameFile] = useState<FileItem | null>(null);
  const [newName, setNewName] = useState('');

  // New folder modal
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // New file modal
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Permissions modal
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permFile, setPermFile] = useState<FileItem | null>(null);
  const [permOctal, setPermOctal] = useState('755');
  const [permPerms, setPermPerms] = useState<boolean[]>(octalToPerms('755'));
  const [permOwner, setPermOwner] = useState('');
  const [permGroup, setPermGroup] = useState('');
  const [permRecursive, setPermRecursive] = useState(false);

  // Move/Copy modal
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveFile, setMoveFile] = useState<FileItem | null>(null);
  const [moveMode, setMoveMode] = useState<'copy' | 'move'>('copy');
  const [moveDest, setMoveDest] = useState('');

  // Compress modal
  const [compressModalOpen, setCompressModalOpen] = useState(false);
  const [compressPaths, setCompressPaths] = useState<string[]>([]);
  const [compressDest, setCompressDest] = useState('');
  const [compressFormat, setCompressFormat] = useState('zip');

  // Decompress modal
  const [decompressModalOpen, setDecompressModalOpen] = useState(false);
  const [decompressPath, setDecompressPath] = useState('');
  const [decompressDest, setDecompressDest] = useState('');

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null);

  // Floating terminal window
  const { accessToken } = useAuthStore();
  const [termOpen, setTermOpen] = useState(false);
  const [termSize, setTermSize] = useState({ w: 720, h: 420 });
  const [termPos, setTermPos] = useState({ x: -1, y: -1 }); // -1 = center
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termDragging = useRef(false);
  const termDragOffset = useRef({ x: 0, y: 0 });
  const termResizing = useRef(false);
  const termResizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  /* ── Fetch files ── */
  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setSearchResults(null);
    setSearchQuery('');
    try {
      const { data } = await api.get<ApiResponse<{ path: string; items: FileItem[] }>>('/files', {
        params: { path, show_hidden: showHidden },
      });
      const items = data.data?.items ?? [];
      // Sort: directories first, then alphabetical
      items.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setAllFiles(items);
      setCurrentPath(path);
      setSelectedRowKeys([]);
      setCurrentPage(1);
    } catch {
      message.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  useEffect(() => {
    fetchFiles(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden]);

  /* ── Floating Terminal ── */
  const openTerminal = useCallback(() => {
    // Center on screen
    const x = Math.max(0, Math.round((window.innerWidth - termSize.w) / 2));
    const y = Math.max(0, Math.round((window.innerHeight - termSize.h) / 2));
    setTermPos({ x, y });
    setTermOpen(true);
  }, [termSize]);

  const closeTerminal = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (termRef.current) { termRef.current.dispose(); termRef.current = null; }
    fitAddonRef.current = null;
    setTermOpen(false);
  }, []);

  // Mount/unmount xterm when termOpen changes
  useEffect(() => {
    if (!termOpen) return;

    const timer = setTimeout(() => {
      const container = termContainerRef.current;
      if (!container) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
        fontWeight: '400',
        lineHeight: 1.2,
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: 'rgba(56, 139, 253, 0.3)',
          black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
          blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39d353', white: '#b1bac4',
          brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
          brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
          brightCyan: '#56d364', brightWhite: '#f0f6fc',
        },
        scrollback: 5000,
        convertEol: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(container);
      requestAnimationFrame(() => { try { fitAddon.fit(); } catch { /* */ } });

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/v1/terminal?token=${accessToken}&cwd=${encodeURIComponent(currentPath)}`
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };
      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) term.write(new Uint8Array(e.data));
        else term.write(e.data);
      };
      ws.onclose = () => {
        term.write('\r\n\x1b[38;5;241m── Connection closed ──\x1b[0m\r\n');
      };

      term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      });
    }, 80);

    return () => {
      clearTimeout(timer);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (termRef.current) { termRef.current.dispose(); termRef.current = null; }
      fitAddonRef.current = null;
    };
  }, [termOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refit when size changes
  useEffect(() => {
    if (termOpen && fitAddonRef.current) {
      requestAnimationFrame(() => { try { fitAddonRef.current?.fit(); } catch { /* */ } });
    }
  }, [termSize, termOpen]);

  // Drag (title bar)
  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    termDragging.current = true;
    termDragOffset.current = { x: e.clientX - termPos.x, y: e.clientY - termPos.y };

    const onMove = (ev: MouseEvent) => {
      if (!termDragging.current) return;
      setTermPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, ev.clientX - termDragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, ev.clientY - termDragOffset.current.y)),
      });
    };
    const onUp = () => {
      termDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [termPos]);

  // Resize (corner handle)
  const onCornerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    termResizing.current = true;
    termResizeStart.current = { x: e.clientX, y: e.clientY, w: termSize.w, h: termSize.h };

    const onMove = (ev: MouseEvent) => {
      if (!termResizing.current) return;
      const dw = ev.clientX - termResizeStart.current.x;
      const dh = ev.clientY - termResizeStart.current.y;
      setTermSize({
        w: Math.max(400, termResizeStart.current.w + dw),
        h: Math.max(200, termResizeStart.current.h + dh),
      });
    };
    const onUp = () => {
      termResizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [termSize]);

  /* ── Navigation ── */
  const navigateTo = useCallback((path: string) => {
    setHistory(prev => {
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push(path);
      setHistoryIndex(newHist.length - 1);
      return newHist;
    });
    fetchFiles(path);
  }, [fetchFiles, historyIndex]);

  const goBack = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      fetchFiles(history[newIdx]);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      fetchFiles(history[newIdx]);
    }
  };

  /* ── Paginated files ── */
  const displayFiles = searchResults ?? allFiles;
  const totalFiles = displayFiles.length;
  const paginatedFiles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayFiles.slice(start, start + pageSize);
  }, [displayFiles, currentPage, pageSize]);

  const dirCount = displayFiles.filter(f => f.is_dir).length;
  const fileCount = displayFiles.filter(f => !f.is_dir).length;
  const totalSize = displayFiles.filter(f => !f.is_dir).reduce((s, f) => s + f.size, 0);

  /* ── Bookmarks ── */
  const addBookmark = () => {
    const label = currentPath.split('/').filter(Boolean).pop() || 'root';
    if (bookmarks.some(b => b.path === currentPath)) {
      message.info('Already bookmarked');
      return;
    }
    const updated = [...bookmarks, { path: currentPath, label }];
    setBookmarks(updated);
    saveBookmarks(updated);
    message.success('Bookmark added');
  };

  const removeBookmark = (path: string) => {
    const updated = bookmarks.filter(b => b.path !== path);
    setBookmarks(updated);
    saveBookmarks(updated);
  };

  const scrollBookmarks = (dir: 'left' | 'right') => {
    bookmarkBarRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
  };

  /* ── Download ── */
  const handleDownload = (file: FileItem) => {
    const link = document.createElement('a');
    link.href = `/api/v1/files/download?path=${encodeURIComponent(file.path)}`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ── Delete ── */
  const handleDelete = (paths: string[]) => {
    Modal.confirm({
      title: t('common.confirm_delete'),
      icon: <ExclamationCircleOutlined />,
      content: `${paths.length} item(s) will be deleted permanently.`,
      okType: 'danger',
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await api.delete('/files', { data: { paths } });
          message.success(t('common.success'));
          fetchFiles(currentPath);
        } catch {
          message.error(t('common.error'));
        }
      },
    });
  };

  /* ── Edit file (open in floating code editor) ── */
  const handleEdit = (file: FileItem) => {
    const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
    setEditorDir(dir);
    setEditorFiles((prev) => {
      if (prev.includes(file.path)) return prev;
      return [...prev, file.path];
    });
    setEditorVisible(true);
  };

  /* ── Rename ── */
  const handleRename = async () => {
    if (!renameFile || !newName.trim()) return;
    try {
      const dir = renameFile.path.substring(0, renameFile.path.lastIndexOf('/'));
      await api.post('/files/rename', { old_path: renameFile.path, new_path: `${dir}/${newName.trim()}` });
      message.success(t('common.success'));
      setRenameModalOpen(false);
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── New Folder ── */
  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.post('/files/mkdir', { path: `${currentPath === '/' ? '' : currentPath}/${newFolderName.trim()}` });
      message.success(t('common.success'));
      setNewFolderModalOpen(false);
      setNewFolderName('');
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── New File ── */
  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    try {
      await api.post('/files/create', { path: `${currentPath === '/' ? '' : currentPath}/${newFileName.trim()}` });
      message.success(t('common.success'));
      setNewFileModalOpen(false);
      setNewFileName('');
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── Permissions ── */
  const openPermModal = (file: FileItem) => {
    setPermFile(file);
    const octal = file.mode_octal || '755';
    setPermOctal(octal);
    setPermPerms(octalToPerms(octal));
    setPermOwner(file.owner);
    setPermGroup(file.group);
    setPermRecursive(false);
    setPermModalOpen(true);
  };

  const handlePermOctalChange = (val: string) => {
    const clean = val.replace(/[^0-7]/g, '').slice(0, 3);
    setPermOctal(clean);
    if (clean.length === 3) {
      setPermPerms(octalToPerms(clean));
    }
  };

  const handlePermCheckChange = (index: number, checked: boolean) => {
    const updated = [...permPerms];
    updated[index] = checked;
    setPermPerms(updated);
    setPermOctal(permsToOctal(updated));
  };

  const handleSavePermissions = async () => {
    if (!permFile) return;
    try {
      await api.put('/files/permissions', {
        path: permFile.path,
        mode: permOctal,
        recursive: permRecursive,
      });
      if (permOwner || permGroup) {
        await api.put('/files/owner', {
          path: permFile.path,
          owner: permOwner,
          group: permGroup,
          recursive: permRecursive,
        });
      }
      message.success(t('common.success'));
      setPermModalOpen(false);
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── Copy / Move ── */
  const handleCopyMove = async () => {
    if (!moveFile || !moveDest.trim()) return;
    try {
      if (moveMode === 'copy') {
        await api.post('/files/copy', { src: moveFile.path, dst: moveDest.trim() });
      } else {
        await api.post('/files/move', { src: moveFile.path, dst: moveDest.trim() });
      }
      message.success(t('common.success'));
      setMoveModalOpen(false);
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── Compress ── */
  const handleCompress = async () => {
    if (!compressDest.trim() || compressPaths.length === 0) return;
    try {
      await api.post('/files/compress', {
        paths: compressPaths,
        dest: compressDest.trim(),
        format: compressFormat,
      });
      message.success(t('common.success'));
      setCompressModalOpen(false);
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── Decompress ── */
  const handleDecompress = async () => {
    if (!decompressPath || !decompressDest.trim()) return;
    try {
      await api.post('/files/decompress', {
        path: decompressPath,
        dest: decompressDest.trim(),
      });
      message.success(t('common.success'));
      setDecompressModalOpen(false);
      fetchFiles(currentPath);
    } catch {
      message.error(t('common.error'));
    }
  };

  /* ── Search ── */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const { data } = await api.get<ApiResponse<{ items: FileItem[] }>>('/files/search', {
        params: { path: currentPath, pattern: searchQuery.trim() },
      });
      setSearchResults(data.data?.items ?? []);
      setCurrentPage(1);
    } catch {
      message.error('Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
    setSearchQuery('');
  };

  /* ── Copy path to clipboard ── */
  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    message.success(t('common.copied'));
  };

  /* ── Context menu handler ── */
  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, file });
  };

  useEffect(() => {
    const hide = () => setCtxMenu(null);
    document.addEventListener('click', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('click', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  /* ── Context menu items ── */
  const getContextMenuItems = (file: FileItem): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (file.is_dir) {
      items.push({ key: 'open', icon: <FolderFilled />, label: 'Open', onClick: () => navigateTo(file.path) });
    }
    if (!file.is_dir) {
      items.push(
        { key: 'edit', icon: <EditOutlined />, label: t('common.edit'), onClick: () => handleEdit(file) },
        { key: 'download', icon: <DownloadOutlined />, label: t('common.download'), onClick: () => handleDownload(file) },
      );
    }
    items.push(
      { type: 'divider' },
      { key: 'rename', icon: <ScissorOutlined />, label: 'Rename', onClick: () => { setRenameFile(file); setNewName(file.name); setRenameModalOpen(true); } },
      { key: 'copy', icon: <CopyOutlined />, label: 'Copy', onClick: () => { setMoveFile(file); setMoveMode('copy'); setMoveDest(file.path); setMoveModalOpen(true); } },
      { key: 'move', icon: <SwapOutlined />, label: 'Move', onClick: () => { setMoveFile(file); setMoveMode('move'); setMoveDest(file.path); setMoveModalOpen(true); } },
      { type: 'divider' },
      { key: 'compress', icon: <CompressOutlined />, label: 'Compress', onClick: () => {
        setCompressPaths([file.path]);
        setCompressDest(`${currentPath === '/' ? '' : currentPath}/${file.name}.zip`);
        setCompressFormat('zip');
        setCompressModalOpen(true);
      }},
    );
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz'].includes(ext || '')) {
      items.push({ key: 'decompress', icon: <CompressOutlined />, label: 'Decompress', onClick: () => {
        setDecompressPath(file.path);
        setDecompressDest(currentPath);
        setDecompressModalOpen(true);
      }});
    }
    items.push(
      { type: 'divider' },
      { key: 'permissions', icon: <InfoCircleOutlined />, label: 'Permissions', onClick: () => openPermModal(file) },
      { key: 'copy-path', icon: <CopyOutlined />, label: 'Copy Path', onClick: () => copyPath(file.path) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: t('common.delete'), danger: true, onClick: () => handleDelete([file.path]) },
    );
    return items;
  };

  /* ── Row actions ── */
  const getRowActions = (record: FileItem): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (!record.is_dir) {
      items.push(
        { key: 'edit', icon: <EditOutlined />, label: t('common.edit'), onClick: () => handleEdit(record) },
        { key: 'download', icon: <DownloadOutlined />, label: t('common.download'), onClick: () => handleDownload(record) },
      );
    }
    items.push(
      { key: 'rename', icon: <ScissorOutlined />, label: 'Rename', onClick: () => { setRenameFile(record); setNewName(record.name); setRenameModalOpen(true); } },
      { key: 'copy', icon: <CopyOutlined />, label: 'Copy', onClick: () => { setMoveFile(record); setMoveMode('copy'); setMoveDest(record.path); setMoveModalOpen(true); } },
      { key: 'move', icon: <SwapOutlined />, label: 'Move', onClick: () => { setMoveFile(record); setMoveMode('move'); setMoveDest(record.path); setMoveModalOpen(true); } },
      { key: 'compress', icon: <CompressOutlined />, label: 'Compress', onClick: () => {
        setCompressPaths([record.path]);
        setCompressDest(`${currentPath === '/' ? '' : currentPath}/${record.name}.zip`);
        setCompressFormat('zip');
        setCompressModalOpen(true);
      }},
    );
    const ext = record.name.split('.').pop()?.toLowerCase();
    if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz'].includes(ext || '')) {
      items.push({ key: 'decompress', icon: <CompressOutlined />, label: 'Decompress', onClick: () => {
        setDecompressPath(record.path);
        setDecompressDest(currentPath);
        setDecompressModalOpen(true);
      }});
    }
    items.push(
      { key: 'permissions', icon: <InfoCircleOutlined />, label: 'Permissions', onClick: () => openPermModal(record) },
      { key: 'copy-path', icon: <CopyOutlined />, label: 'Copy Path', onClick: () => copyPath(record.path) },
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: t('common.delete'), danger: true, onClick: () => handleDelete([record.path]) },
    );
    return items;
  };

  /* ── Breadcrumb segments ── */
  const pathSegments = currentPath.split('/').filter(Boolean);

  /* ── New dropdown menu ── */
  const newMenuItems: MenuProps['items'] = [
    { key: 'folder', icon: <FolderAddOutlined />, label: 'New Folder', onClick: () => { setNewFolderName(''); setNewFolderModalOpen(true); } },
    { key: 'file', icon: <FileAddOutlined />, label: 'New File', onClick: () => { setNewFileName(''); setNewFileModalOpen(true); } },
  ];

  /* ── Table columns ── */
  const columns: ColumnsType<FileItem> = [
    {
      title: t('common.name'),
      dataIndex: 'name',
      sorter: (a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      },
      render: (name: string, record) => (
        <Space
          style={{ cursor: 'pointer' }}
          onClick={() => { if (record.is_dir) navigateTo(record.path); }}
          onDoubleClick={() => { if (!record.is_dir) handleEdit(record); }}
        >
          {getFileIcon(record)}
          <span style={{ fontWeight: record.is_dir ? 500 : 400, color: record.is_dir ? C.text : C.textSecondary }}>
            {name}
            {record.is_symlink && <span style={{ color: C.textSecondary, fontSize: 12, marginLeft: 4 }}>→ {record.link_target}</span>}
          </span>
        </Space>
      ),
    },
    {
      title: 'PMSN/Owner',
      width: 140,
      render: (_, record) => (
        <span
          style={{ cursor: 'pointer', color: C.primary }}
          onClick={() => openPermModal(record)}
        >
          {record.mode_octal || '---'} / {record.owner}
        </span>
      ),
    },
    {
      title: t('common.size'),
      dataIndex: 'size',
      width: 120,
      sorter: (a, b) => a.size - b.size,
      render: (size: number, record) =>
        record.is_dir ? <span style={{ color: C.primary, cursor: 'pointer' }}>-</span> : formatSize(size),
    },
    {
      title: 'Modified',
      dataIndex: 'mod_time',
      width: 180,
      sorter: (a, b) => new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime(),
      render: (v: string) => <span style={{ color: C.textSecondary, fontSize: 13 }}>{formatDate(v)}</span>,
    },
    {
      title: 'Operations',
      width: 200,
      align: 'center',
      render: (_, record) => (
        <Space size={4}>
          {!record.is_dir && (
            <>
              <Tooltip title={t('common.edit')}>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
              </Tooltip>
              <Tooltip title={t('common.download')}>
                <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)} />
              </Tooltip>
            </>
          )}
          <Tooltip title="Rename">
            <Button type="text" size="small" icon={<ScissorOutlined />}
              onClick={() => { setRenameFile(record); setNewName(record.name); setRenameModalOpen(true); }} />
          </Tooltip>
          <Tooltip title="Copy">
            <Button type="text" size="small" icon={<CopyOutlined />}
              onClick={() => { setMoveFile(record); setMoveMode('copy'); setMoveDest(record.path); setMoveModalOpen(true); }} />
          </Tooltip>
          <Tooltip title={t('common.delete')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />}
              onClick={() => handleDelete([record.path])} />
          </Tooltip>
          <Dropdown menu={{ items: getRowActions(record) }} trigger={['click']}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  /* ── Bulk action bar ── */
  const bulkCompress = () => {
    const paths = selectedRowKeys as string[];
    const firstFile = allFiles.find(f => f.path === paths[0]);
    setCompressPaths(paths);
    setCompressDest(`${currentPath === '/' ? '' : currentPath}/${firstFile?.name || 'archive'}.zip`);
    setCompressFormat('zip');
    setCompressModalOpen(true);
  };

  /* ── Permission labels ── */
  const permLabels = ['Read', 'Write', 'Execute'];
  const permGroups = ['Owner', 'Group', 'Other'];

  /* ────────── RENDER ────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.white, borderRadius: 8, overflow: 'hidden' }}>

      {/* ═══ 1. Quick-Access Tab Bar ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: '6px 12px', gap: 4, minHeight: 42,
      }}>
        <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => scrollBookmarks('left')}
          style={{ flexShrink: 0, color: C.primaryDark }} />
        <div ref={bookmarkBarRef} style={{
          display: 'flex', gap: 4, overflowX: 'auto', flex: 1, scrollBehavior: 'smooth', flexWrap: 'nowrap',
        }}>
          {bookmarks.map(bm => (
            <div key={bm.path} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              background: currentPath === bm.path ? C.primary : C.white,
              color: currentPath === bm.path ? C.white : C.text,
              fontSize: 13, transition: 'all 0.2s',
            }}
              onClick={() => navigateTo(bm.path)}
            >
              <FolderFilled style={{ fontSize: 13, color: currentPath === bm.path ? C.white : C.primary }} />
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{bm.label}</span>
              <CloseOutlined
                style={{ fontSize: 10, opacity: 0.6 }}
                onClick={(e) => { e.stopPropagation(); removeBookmark(bm.path); }}
              />
            </div>
          ))}
        </div>
        <Button type="text" size="small" icon={<RightOutlined />} onClick={() => scrollBookmarks('right')}
          style={{ flexShrink: 0, color: C.primaryDark }} />
        <Tooltip title="Bookmark current folder">
          <Button type="text" size="small" icon={<StarOutlined />} onClick={addBookmark}
            style={{ flexShrink: 0, color: C.primaryDark }} />
        </Tooltip>
      </div>

      {/* ═══ 2. Breadcrumb Navigation Row ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 12px',
        borderBottom: `1px solid ${C.border}`, gap: 8, background: C.white,
      }}>
        <Space size={4}>
          <Tooltip title="Back">
            <Button type="text" size="small" icon={<LeftOutlined />} disabled={historyIndex <= 0} onClick={goBack} />
          </Tooltip>
          <Tooltip title="Forward">
            <Button type="text" size="small" icon={<RightOutlined />} disabled={historyIndex >= history.length - 1} onClick={goForward} />
          </Tooltip>
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap', fontSize: 13 }}>
          <span
            style={{ cursor: 'pointer', color: C.primary, fontWeight: 500 }}
            onClick={() => navigateTo('/')}
          >
            <HomeOutlined /> Root
          </span>
          {pathSegments.map((seg, i) => {
            const fullPath = '/' + pathSegments.slice(0, i + 1).join('/');
            const isLast = i === pathSegments.length - 1;
            return (
              <span key={fullPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: C.textSecondary }}>/</span>
                <span
                  style={{ cursor: 'pointer', color: isLast ? C.text : C.primary, fontWeight: isLast ? 600 : 400 }}
                  onClick={() => navigateTo(fullPath)}
                >
                  {seg}
                </span>
              </span>
            );
          })}
        </div>
        <Tooltip title={t('common.refresh')}>
          <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={() => fetchFiles(currentPath)} />
        </Tooltip>
      </div>

      {/* ═══ 3. Toolbar Row ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: `1px solid ${C.border}`, gap: isMobile ? 4 : 8, flexWrap: 'wrap',
      }}>
        <Space size={6} wrap>
          <Upload
            multiple
            showUploadList={false}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const formData = new FormData();
                formData.append('file', file as File);
                await api.post(`/files/upload?path=${encodeURIComponent(currentPath)}`, formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                onSuccess?.(null);
                message.success(`Uploaded ${(file as File).name}`);
                fetchFiles(currentPath);
              } catch (err) {
                onError?.(err as Error);
                message.error('Upload failed');
              }
            }}
          >
            <Button size="small" icon={<UploadOutlined />} style={{ background: C.primary, color: C.white, border: 'none' }}>
              {t('common.upload')}
            </Button>
          </Upload>

          <Dropdown menu={{ items: newMenuItems }} trigger={['click']}>
            <Button size="small" icon={<FileAddOutlined />}>New ▾</Button>
          </Dropdown>

          <Button size="small" icon={<SearchOutlined />}
            type={searchVisible ? 'primary' : 'default'}
            onClick={() => { setSearchVisible(!searchVisible); if (searchVisible) clearSearch(); }}
            style={searchVisible ? { background: C.primary, borderColor: C.primary } : {}}
          >
            {t('common.search')}
          </Button>

          <Button size="small" icon={<CodeOutlined />}
            type={termOpen ? 'primary' : 'default'}
            onClick={() => termOpen ? closeTerminal() : openTerminal()}
            style={termOpen ? { background: C.primary, borderColor: C.primary } : {}}
          >
            Terminal
          </Button>

          <Button size="small" icon={<HomeOutlined />} onClick={() => navigateTo('/')}>Root</Button>

          <Tooltip title={showHidden ? 'Hide hidden files' : 'Show hidden files'}>
            <Button
              size="small"
              type={showHidden ? 'primary' : 'default'}
              icon={showHidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => setShowHidden(!showHidden)}
              style={showHidden ? { background: C.primary, borderColor: C.primary } : {}}
            />
          </Tooltip>

          {selectedRowKeys.length > 0 && (
            <>
              <Button size="small" danger icon={<DeleteOutlined />}
                onClick={() => handleDelete(selectedRowKeys as string[])}>
                Delete ({selectedRowKeys.length})
              </Button>
              <Button size="small" icon={<CompressOutlined />} onClick={bulkCompress}>
                Compress ({selectedRowKeys.length})
              </Button>
            </>
          )}
        </Space>

        <Space size={4}>
          <Tooltip title="List view">
            <Button type={viewMode === 'list' ? 'primary' : 'default'} size="small"
              icon={<UnorderedListOutlined />} onClick={() => setViewMode('list')}
              style={viewMode === 'list' ? { background: C.primary, borderColor: C.primary } : {}} />
          </Tooltip>
          <Tooltip title="Grid view">
            <Button type={viewMode === 'grid' ? 'primary' : 'default'} size="small"
              icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')}
              style={viewMode === 'grid' ? { background: C.primary, borderColor: C.primary } : {}} />
          </Tooltip>
        </Space>
      </div>

      {/* ═══ 4. Search Bar (conditional) ═══ */}
      {searchVisible && (
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 12px',
          borderBottom: `1px solid ${C.border}`, gap: 8, background: C.white,
        }}>
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={handleSearch}
            style={{ maxWidth: 400 }}
            size="small"
            prefix={<SearchOutlined style={{ color: C.textSecondary }} />}
            allowClear
          />
          <Button size="small" type="primary" loading={searchLoading} onClick={handleSearch}
            style={{ background: C.primary, borderColor: C.primary }}>
            {t('common.search')}
          </Button>
          {searchResults && (
            <Button size="small" onClick={clearSearch}>Clear results</Button>
          )}
          {searchResults && (
            <span style={{ fontSize: 12, color: C.textSecondary }}>Found {searchResults.length} result(s)</span>
          )}
        </div>
      )}

      {/* ═══ 5. File Table / Grid ═══ */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {viewMode === 'list' ? (
          <Table<FileItem>
            columns={columns}
            dataSource={paginatedFiles}
            rowKey="path"
            loading={loading}
            size="small"
            pagination={false}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            onRow={(record) => ({
              onContextMenu: (e) => handleContextMenu(e, record),
              onDoubleClick: () => {
                if (record.is_dir) navigateTo(record.path);
                else handleEdit(record);
              },
              style: { cursor: 'default' },
            })}
            style={{ minHeight: 200 }}
            scroll={{ x: 700, y: 'calc(100vh - 380px)' }}
          />
        ) : (
          /* Grid view */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 8, padding: 12,
          }}>
            {paginatedFiles.map(file => (
              <div
                key={file.path}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '12px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                  border: selectedRowKeys.includes(file.path) ? `2px solid ${C.primary}` : '2px solid transparent',
                  background: selectedRowKeys.includes(file.path) ? C.bg : C.white,
                  transition: 'all 0.15s',
                }}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    setSelectedRowKeys(prev =>
                      prev.includes(file.path) ? prev.filter(k => k !== file.path) : [...prev, file.path]
                    );
                  }
                }}
                onDoubleClick={() => {
                  if (file.is_dir) navigateTo(file.path);
                  else handleEdit(file);
                }}
                onContextMenu={(e) => handleContextMenu(e, file)}
              >
                <div style={{ fontSize: 32, marginBottom: 4 }}>{getFileIcon(file)}</div>
                <span style={{
                  fontSize: 12, width: '100%', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {file.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ 6. Footer Bar ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', borderTop: `1px solid ${C.border}`, background: C.white,
        fontSize: 13, color: C.textSecondary, flexWrap: 'wrap', gap: 8,
      }}>
        <span>
          Total <strong>{dirCount}</strong> director{dirCount !== 1 ? 'ies' : 'y'}, <strong>{fileCount}</strong> file{fileCount !== 1 ? 's' : ''}.
          {' '}File size: <strong style={{ color: C.primary }}>{totalSize > 0 ? formatSize(totalSize) : 'N/A'}</strong>
        </span>
        <Space size={8}>
          <Select
            size="small"
            value={pageSize}
            onChange={(v) => { setPageSize(v); setCurrentPage(1); localStorage.setItem(PAGE_SIZE_KEY, String(v)); }}
            options={[
              { value: 25, label: '25 / page' },
              { value: 50, label: '50 / page' },
              { value: 100, label: '100 / page' },
              { value: 200, label: '200 / page' },
            ]}
            style={{ width: isMobile ? 80 : 110 }}
          />
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={totalFiles}
            onChange={(page) => setCurrentPage(page)}
            showSizeChanger={false}
            showQuickJumper
            showTotal={(total) => `${total} items`}
          />
        </Space>
      </div>

      {/* ═══ 7. Floating Terminal Window ═══ */}
      {termOpen && (
        <div style={{
          position: 'fixed',
          left: termPos.x,
          top: termPos.y,
          width: termSize.w,
          height: termSize.h,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)',
        }}>
          {/* Title bar — draggable */}
          <div
            onMouseDown={onTitleMouseDown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 12px', height: 36, background: '#1B2A4A',
              cursor: 'move', userSelect: 'none', flexShrink: 0,
            }}
          >
            <span style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 500, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CodeOutlined style={{ color: '#58a6ff' }} />
              Terminal — {currentPath}
            </span>
            <Button
              type="text" size="small"
              icon={<CloseOutlined style={{ color: '#8b949e', fontSize: 12 }} />}
              onClick={closeTerminal}
              style={{ minWidth: 0, padding: '0 4px' }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          {/* xterm body */}
          <div
            ref={termContainerRef}
            style={{ flex: 1, background: '#0d1117', padding: '4px 0 0 4px', overflow: 'hidden' }}
          />
          {/* Resize corner handle */}
          <div
            onMouseDown={onCornerMouseDown}
            style={{
              position: 'absolute', right: 0, bottom: 0, width: 18, height: 18,
              cursor: 'nwse-resize', zIndex: 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block' }}>
              <path d="M14 18L18 14M10 18L18 10M6 18L18 6" stroke="#4a5568" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>
      )}

      {/* ═══ Context Menu ═══ */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
            zIndex: 9999, background: C.white, borderRadius: 8,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)', border: `1px solid ${C.border}`,
            padding: 4, minWidth: 180,
          }}
          onClick={() => setCtxMenu(null)}
        >
          {(getContextMenuItems(ctxMenu.file) ?? []).map((item, idx) => {
            if (!item) return null;
            if ('type' in item && item.type === 'divider') {
              return <div key={`d-${idx}`} style={{ height: 1, background: C.border, margin: '4px 0' }} />;
            }
            const menuItem = item as { key: string; icon?: React.ReactNode; label?: React.ReactNode; danger?: boolean; onClick?: () => void };
            return (
              <div
                key={menuItem.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  cursor: 'pointer', borderRadius: 4, fontSize: 13,
                  color: menuItem.danger ? C.error : C.text,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = menuItem.danger ? '#fff2f0' : C.bg; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                onClick={() => menuItem.onClick?.()}
              >
                <span style={{ width: 16, textAlign: 'center' }}>{menuItem.icon}</span>
                <span>{menuItem.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ 7. Permissions Modal ═══ */}
      <Modal
        title={<><InfoCircleOutlined /> Permissions — {permFile?.name}</>}
        open={permModalOpen}
        onCancel={() => setPermModalOpen(false)}
        onOk={handleSavePermissions}
        okText="Apply"
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Permission Code (Octal)</div>
          <Input
            value={permOctal}
            onChange={(e) => handlePermOctalChange(e.target.value)}
            style={{ width: isMobile ? 90 : 120, fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }}
            maxLength={3}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: `1px solid ${C.border}` }}></th>
              {permLabels.map(l => (
                <th key={l} style={{ padding: '6px 8px', textAlign: 'center', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permGroups.map((group, gi) => (
              <tr key={group}>
                <td style={{ padding: '6px 8px', fontWeight: 500, borderBottom: `1px solid ${C.border}` }}>{group}</td>
                {[0, 1, 2].map(pi => (
                  <td key={pi} style={{ textAlign: 'center', padding: '6px 8px', borderBottom: `1px solid ${C.border}` }}>
                    <Checkbox
                      checked={permPerms[gi * 3 + pi]}
                      onChange={(e) => handlePermCheckChange(gi * 3 + pi, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Space style={{ marginBottom: 12 }} size={12}>
          <div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Owner</div>
            <Input value={permOwner} onChange={(e) => setPermOwner(e.target.value)} style={{ width: isMobile ? 100 : 140 }} size="small" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 4 }}>Group</div>
            <Input value={permGroup} onChange={(e) => setPermGroup(e.target.value)} style={{ width: isMobile ? 100 : 140 }} size="small" />
          </div>
        </Space>
        {permFile?.is_dir && (
          <div>
            <Checkbox checked={permRecursive} onChange={(e) => setPermRecursive(e.target.checked)}>
              Apply recursively
            </Checkbox>
          </div>
        )}
      </Modal>

      {/* ═══ Floating Code Editor ═══ */}
      <CodeEditor
        visible={editorVisible}
        initialFiles={editorFiles}
        initialDir={editorDir}
        onClose={() => { setEditorVisible(false); setEditorFiles([]); }}
      />

      {/* ═══ Rename Modal ═══ */}
      <Modal
        title="Rename"
        open={renameModalOpen}
        onCancel={() => setRenameModalOpen(false)}
        onOk={handleRename}
        okText={t('common.save')}
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: C.textSecondary }}>Current: {renameFile?.name}</div>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleRename}
          placeholder="New name"
          autoFocus
        />
      </Modal>

      {/* ═══ New Folder Modal ═══ */}
      <Modal
        title={<><FolderAddOutlined /> New Folder</>}
        open={newFolderModalOpen}
        onCancel={() => setNewFolderModalOpen(false)}
        onOk={handleNewFolder}
        okText={t('common.create')}
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: C.textSecondary }}>In: {currentPath}</div>
        <Input
          placeholder="Folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleNewFolder}
          autoFocus
        />
      </Modal>

      {/* ═══ New File Modal ═══ */}
      <Modal
        title={<><FileAddOutlined /> New File</>}
        open={newFileModalOpen}
        onCancel={() => setNewFileModalOpen(false)}
        onOk={handleNewFile}
        okText={t('common.create')}
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: C.textSecondary }}>In: {currentPath}</div>
        <Input
          placeholder="File name"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onPressEnter={handleNewFile}
          autoFocus
        />
      </Modal>

      {/* ═══ Copy/Move Modal ═══ */}
      <Modal
        title={<>{moveMode === 'copy' ? <CopyOutlined /> : <SwapOutlined />} {moveMode === 'copy' ? 'Copy' : 'Move'} — {moveFile?.name}</>}
        open={moveModalOpen}
        onCancel={() => setMoveModalOpen(false)}
        onOk={handleCopyMove}
        okText={moveMode === 'copy' ? 'Copy' : 'Move'}
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: C.textSecondary }}>Source: {moveFile?.path}</div>
        <div style={{ marginBottom: 8, fontSize: 13 }}>Destination path:</div>
        <Input
          value={moveDest}
          onChange={(e) => setMoveDest(e.target.value)}
          placeholder="/path/to/destination"
          autoFocus
        />
      </Modal>

      {/* ═══ Compress Modal ═══ */}
      <Modal
        title={<><CompressOutlined /> Compress</>}
        open={compressModalOpen}
        onCancel={() => setCompressModalOpen(false)}
        onOk={handleCompress}
        okText="Compress"
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: C.textSecondary }}>
          {compressPaths.length} item(s) selected
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 4, fontSize: 13 }}>Format:</div>
          <Select value={compressFormat} onChange={setCompressFormat} size="small" style={{ width: isMobile ? 90 : 120 }}
            options={[
              { value: 'zip', label: 'ZIP' },
              { value: 'tar.gz', label: 'TAR.GZ' },
              { value: 'tar', label: 'TAR' },
            ]}
          />
        </div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>Destination path:</div>
        <Input
          value={compressDest}
          onChange={(e) => setCompressDest(e.target.value)}
          placeholder="/path/to/archive.zip"
        />
      </Modal>

      {/* ═══ Decompress Modal ═══ */}
      <Modal
        title={<><CompressOutlined /> Decompress — {decompressPath.split('/').pop()}</>}
        open={decompressModalOpen}
        onCancel={() => setDecompressModalOpen(false)}
        onOk={handleDecompress}
        okText="Decompress"
        okButtonProps={{ style: { background: C.primary, borderColor: C.primary } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: C.textSecondary }}>File: {decompressPath}</div>
        <div style={{ marginBottom: 4, fontSize: 13 }}>Extract to:</div>
        <Input
          value={decompressDest}
          onChange={(e) => setDecompressDest(e.target.value)}
          placeholder="/path/to/extract"
        />
      </Modal>
    </div>
  );
}

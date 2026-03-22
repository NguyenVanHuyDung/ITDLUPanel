import React from 'react';
import type { ReactNode } from 'react';
import {
  FolderFilled,
  FileOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  FileZipOutlined,
} from '@ant-design/icons';
import type { FileItem } from '../types';

/* ── ExtBadge ─────────────────────────────────────────────── */

const ExtBadge = ({ text, bg, fg = '#fff' }: { text: string; bg: string; fg?: string }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 20,
      height: 20,
      borderRadius: 4,
      background: bg,
      color: fg,
      fontSize: 8,
      fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
      lineHeight: 1,
      letterSpacing: -0.3,
      flexShrink: 0,
    }}
  >
    {text}
  </span>
);

/* ── SVG mini-icons (20×20) ───────────────────────────────── */

const svgWrap = (bg: string, children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="20" rx="4" fill={bg} />
    {children}
  </svg>
);

const SvgHtml = svgWrap(
  '#e44d26',
  <path
    d="M4 3l1.1 12.5L10 17l4.9-1.5L16 3H4zm9.6 4.5H8l.2 2h5.2l-.5 5.5L10 16l-2.9-.9L6.9 12h1.8l.1 1.5 1.2.3 1.2-.3.2-2H7.5L7 6h6l-.4 1.5z"
    fill="#fff"
  />,
);

const SvgCss = svgWrap(
  '#264de4',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="sans-serif">
    CSS
  </text>,
);

const SvgJs = svgWrap(
  '#f7df1e',
  <text x="10" y="14" textAnchor="middle" fill="#323330" fontSize="10" fontWeight="700" fontFamily="sans-serif">
    JS
  </text>,
);

const SvgTs = svgWrap(
  '#3178c6',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="sans-serif">
    TS
  </text>,
);

const SvgPy = svgWrap(
  '#3572a5',
  <text x="10" y="14" textAnchor="middle" fill="#ffe873" fontSize="10" fontWeight="700" fontFamily="sans-serif">
    PY
  </text>,
);

const SvgGo = svgWrap(
  '#00add8',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="sans-serif">
    GO
  </text>,
);

const SvgPhp = svgWrap(
  '#777bb4',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif">
    PHP
  </text>,
);

const SvgRust = svgWrap(
  '#dea584',
  <text x="10" y="14" textAnchor="middle" fill="#000" fontSize="10" fontWeight="700" fontFamily="sans-serif">
    RS
  </text>,
);

const SvgJson = svgWrap(
  '#5b5b5b',
  <text x="10" y="14.5" textAnchor="middle" fill="#f7df1e" fontSize="11" fontWeight="700" fontFamily="monospace">
    {'{}'}
  </text>,
);

const SvgMd = svgWrap(
  '#083fa1',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily="sans-serif">
    MD
  </text>,
);

const SvgSql = svgWrap(
  '#e38c00',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif">
    SQL
  </text>,
);

const SvgShell = svgWrap(
  '#2b2b2b',
  <text x="10" y="14" textAnchor="middle" fill="#4af626" fontSize="10" fontWeight="700" fontFamily="monospace">
    {'>_'}
  </text>,
);

const SvgDocker = svgWrap(
  '#2496ed',
  <text x="10" y="15" textAnchor="middle" fontSize="12">
    🐳
  </text>,
);

const SvgYaml = svgWrap(
  '#cb171e',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif">
    YML
  </text>,
);

const SvgXml = svgWrap(
  '#e44d26',
  <text x="10" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif">
    XML
  </text>,
);

/* ── Extension → Icon map ─────────────────────────────────── */

type IconEntry = { icon: ReactNode; color: string };

const EXT_ICON_MAP: Record<string, IconEntry> = {
  // Web
  html: { icon: SvgHtml, color: '#e44d26' },
  htm: { icon: SvgHtml, color: '#e44d26' },
  css: { icon: SvgCss, color: '#264de4' },
  scss: { icon: SvgCss, color: '#c6538c' },
  sass: { icon: SvgCss, color: '#c6538c' },
  less: { icon: SvgCss, color: '#1d365d' },
  vue: { icon: <ExtBadge text="VUE" bg="#42b883" />, color: '#42b883' },
  svelte: { icon: <ExtBadge text="SVE" bg="#ff3e00" />, color: '#ff3e00' },

  // JS / TS
  js: { icon: SvgJs, color: '#f7df1e' },
  mjs: { icon: SvgJs, color: '#f7df1e' },
  cjs: { icon: SvgJs, color: '#f7df1e' },
  jsx: { icon: SvgJs, color: '#61dafb' },
  ts: { icon: SvgTs, color: '#3178c6' },
  tsx: { icon: SvgTs, color: '#3178c6' },

  // Languages
  php: { icon: SvgPhp, color: '#777bb4' },
  py: { icon: SvgPy, color: '#3572a5' },
  pyw: { icon: SvgPy, color: '#3572a5' },
  go: { icon: SvgGo, color: '#00add8' },
  rs: { icon: SvgRust, color: '#dea584' },
  java: { icon: <ExtBadge text="JVA" bg="#b07219" />, color: '#b07219' },
  kt: { icon: <ExtBadge text="KT" bg="#a97bff" />, color: '#a97bff' },
  kts: { icon: <ExtBadge text="KTS" bg="#a97bff" />, color: '#a97bff' },
  rb: { icon: <ExtBadge text="RB" bg="#cc342d" />, color: '#cc342d' },
  c: { icon: <ExtBadge text="C" bg="#555555" />, color: '#555555' },
  h: { icon: <ExtBadge text="H" bg="#555555" />, color: '#555555' },
  cpp: { icon: <ExtBadge text="C++" bg="#f34b7d" />, color: '#f34b7d' },
  cc: { icon: <ExtBadge text="C++" bg="#f34b7d" />, color: '#f34b7d' },
  hpp: { icon: <ExtBadge text="H++" bg="#f34b7d" />, color: '#f34b7d' },
  cs: { icon: <ExtBadge text="C#" bg="#178600" />, color: '#178600' },
  swift: { icon: <ExtBadge text="SWF" bg="#f05138" />, color: '#f05138' },
  dart: { icon: <ExtBadge text="DRT" bg="#00b4ab" />, color: '#00b4ab' },
  r: { icon: <ExtBadge text="R" bg="#198ce7" />, color: '#198ce7' },
  lua: { icon: <ExtBadge text="LUA" bg="#000080" />, color: '#000080' },
  perl: { icon: <ExtBadge text="PL" bg="#0298c3" />, color: '#0298c3' },
  pl: { icon: <ExtBadge text="PL" bg="#0298c3" />, color: '#0298c3' },
  scala: { icon: <ExtBadge text="SC" bg="#c22d40" />, color: '#c22d40' },
  ex: { icon: <ExtBadge text="EX" bg="#6e4a7e" />, color: '#6e4a7e' },
  exs: { icon: <ExtBadge text="EXS" bg="#6e4a7e" />, color: '#6e4a7e' },
  erl: { icon: <ExtBadge text="ERL" bg="#b83998" />, color: '#b83998' },
  zig: { icon: <ExtBadge text="ZIG" bg="#f7a41d" />, color: '#f7a41d' },
  nim: { icon: <ExtBadge text="NIM" bg="#ffe953" fg="#000" />, color: '#ffe953' },
  v: { icon: <ExtBadge text="V" bg="#5d87bf" />, color: '#5d87bf' },
  asm: { icon: <ExtBadge text="ASM" bg="#6e4c13" />, color: '#6e4c13' },
  s: { icon: <ExtBadge text="ASM" bg="#6e4c13" />, color: '#6e4c13' },

  // Shell
  sh: { icon: SvgShell, color: '#2b2b2b' },
  bash: { icon: SvgShell, color: '#2b2b2b' },
  zsh: { icon: SvgShell, color: '#2b2b2b' },
  fish: { icon: SvgShell, color: '#2b2b2b' },
  ps1: { icon: <ExtBadge text="PS" bg="#012456" />, color: '#012456' },
  bat: { icon: <ExtBadge text="BAT" bg="#c1f12e" fg="#000" />, color: '#c1f12e' },
  cmd: { icon: <ExtBadge text="CMD" bg="#c1f12e" fg="#000" />, color: '#c1f12e' },

  // Data / Config
  json: { icon: SvgJson, color: '#5b5b5b' },
  jsonc: { icon: SvgJson, color: '#5b5b5b' },
  json5: { icon: SvgJson, color: '#5b5b5b' },
  yaml: { icon: SvgYaml, color: '#cb171e' },
  yml: { icon: SvgYaml, color: '#cb171e' },
  xml: { icon: SvgXml, color: '#e44d26' },
  toml: { icon: <ExtBadge text="TML" bg="#9c4221" />, color: '#9c4221' },
  ini: { icon: <ExtBadge text="INI" bg="#6d8086" />, color: '#6d8086' },
  conf: { icon: <ExtBadge text="CNF" bg="#6d8086" />, color: '#6d8086' },
  cfg: { icon: <ExtBadge text="CFG" bg="#6d8086" />, color: '#6d8086' },
  env: { icon: <ExtBadge text="ENV" bg="#ecd53f" fg="#000" />, color: '#ecd53f' },
  properties: { icon: <ExtBadge text="PRP" bg="#6d8086" />, color: '#6d8086' },
  csv: { icon: <ExtBadge text="CSV" bg="#237346" />, color: '#237346' },
  tsv: { icon: <ExtBadge text="TSV" bg="#237346" />, color: '#237346' },

  // SQL / DB
  sql: { icon: SvgSql, color: '#e38c00' },
  db: { icon: SvgSql, color: '#e38c00' },
  sqlite: { icon: SvgSql, color: '#003b57' },
  sqlite3: { icon: SvgSql, color: '#003b57' },

  // Docs / Text
  md: { icon: SvgMd, color: '#083fa1' },
  mdx: { icon: SvgMd, color: '#083fa1' },
  rst: { icon: <FileTextOutlined style={{ color: '#141414' }} />, color: '#141414' },
  tex: { icon: <ExtBadge text="TEX" bg="#3d6117" />, color: '#3d6117' },
  txt: { icon: <FileTextOutlined style={{ color: '#6d8086' }} />, color: '#6d8086' },
  log: { icon: <FileTextOutlined style={{ color: '#6d8086' }} />, color: '#6d8086' },
  diff: { icon: <ExtBadge text="DIF" bg="#41b883" />, color: '#41b883' },
  patch: { icon: <ExtBadge text="PAT" bg="#41b883" />, color: '#41b883' },

  // Docker
  dockerfile: { icon: SvgDocker, color: '#2496ed' },
  dockerignore: { icon: SvgDocker, color: '#2496ed' },

  // Images
  jpg: { icon: <FileImageOutlined style={{ color: '#a855f7' }} />, color: '#a855f7' },
  jpeg: { icon: <FileImageOutlined style={{ color: '#a855f7' }} />, color: '#a855f7' },
  png: { icon: <FileImageOutlined style={{ color: '#3b82f6' }} />, color: '#3b82f6' },
  gif: { icon: <FileImageOutlined style={{ color: '#f472b6' }} />, color: '#f472b6' },
  svg: { icon: <FileImageOutlined style={{ color: '#f7a41d' }} />, color: '#f7a41d' },
  ico: { icon: <FileImageOutlined style={{ color: '#6d8086' }} />, color: '#6d8086' },
  webp: { icon: <FileImageOutlined style={{ color: '#4ade80' }} />, color: '#4ade80' },
  bmp: { icon: <FileImageOutlined style={{ color: '#6d8086' }} />, color: '#6d8086' },
  tiff: { icon: <FileImageOutlined style={{ color: '#6d8086' }} />, color: '#6d8086' },
  tif: { icon: <FileImageOutlined style={{ color: '#6d8086' }} />, color: '#6d8086' },
  avif: { icon: <FileImageOutlined style={{ color: '#4ade80' }} />, color: '#4ade80' },
  psd: { icon: <ExtBadge text="PSD" bg="#31a8ff" />, color: '#31a8ff' },
  ai: { icon: <ExtBadge text="AI" bg="#ff9a00" />, color: '#ff9a00' },
  fig: { icon: <ExtBadge text="FIG" bg="#a259ff" />, color: '#a259ff' },
  sketch: { icon: <ExtBadge text="SKT" bg="#f7b500" />, color: '#f7b500' },

  // Audio / Video
  mp3: { icon: <ExtBadge text="MP3" bg="#e74c3c" />, color: '#e74c3c' },
  wav: { icon: <ExtBadge text="WAV" bg="#3498db" />, color: '#3498db' },
  ogg: { icon: <ExtBadge text="OGG" bg="#1abc9c" />, color: '#1abc9c' },
  flac: { icon: <ExtBadge text="FLC" bg="#f39c12" />, color: '#f39c12' },
  mp4: { icon: <ExtBadge text="MP4" bg="#9b59b6" />, color: '#9b59b6' },
  avi: { icon: <ExtBadge text="AVI" bg="#2ecc71" />, color: '#2ecc71' },
  mkv: { icon: <ExtBadge text="MKV" bg="#e67e22" />, color: '#e67e22' },
  mov: { icon: <ExtBadge text="MOV" bg="#1abc9c" />, color: '#1abc9c' },
  webm: { icon: <ExtBadge text="WBM" bg="#4ade80" />, color: '#4ade80' },

  // Archives
  zip: { icon: <FileZipOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  tar: { icon: <FileZipOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  gz: { icon: <FileZipOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  tgz: { icon: <FileZipOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  bz2: { icon: <FileZipOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  xz: { icon: <FileZipOutlined style={{ color: '#f59e0b' }} />, color: '#f59e0b' },
  rar: { icon: <FileZipOutlined style={{ color: '#9b59b6' }} />, color: '#9b59b6' },
  '7z': { icon: <FileZipOutlined style={{ color: '#2ecc71' }} />, color: '#2ecc71' },
  deb: { icon: <FileZipOutlined style={{ color: '#a80030' }} />, color: '#a80030' },
  rpm: { icon: <FileZipOutlined style={{ color: '#e74c3c' }} />, color: '#e74c3c' },

  // Office / PDF
  pdf: { icon: <FilePdfOutlined style={{ color: '#e74c3c' }} />, color: '#e74c3c' },
  doc: { icon: <ExtBadge text="DOC" bg="#2b579a" />, color: '#2b579a' },
  docx: { icon: <ExtBadge text="DOC" bg="#2b579a" />, color: '#2b579a' },
  xls: { icon: <ExtBadge text="XLS" bg="#217346" />, color: '#217346' },
  xlsx: { icon: <ExtBadge text="XLS" bg="#217346" />, color: '#217346' },
  ppt: { icon: <ExtBadge text="PPT" bg="#d24726" />, color: '#d24726' },
  pptx: { icon: <ExtBadge text="PPT" bg="#d24726" />, color: '#d24726' },

  // Fonts
  ttf: { icon: <ExtBadge text="TTF" bg="#555" />, color: '#555' },
  otf: { icon: <ExtBadge text="OTF" bg="#555" />, color: '#555' },
  woff: { icon: <ExtBadge text="WF" bg="#555" />, color: '#555' },
  woff2: { icon: <ExtBadge text="WF2" bg="#555" />, color: '#555' },
  eot: { icon: <ExtBadge text="EOT" bg="#555" />, color: '#555' },

  // Certs / Keys
  pem: { icon: <ExtBadge text="PEM" bg="#2e7d32" />, color: '#2e7d32' },
  crt: { icon: <ExtBadge text="CRT" bg="#2e7d32" />, color: '#2e7d32' },
  cer: { icon: <ExtBadge text="CER" bg="#2e7d32" />, color: '#2e7d32' },
  key: { icon: <ExtBadge text="KEY" bg="#c62828" />, color: '#c62828' },
  pub: { icon: <ExtBadge text="PUB" bg="#1565c0" />, color: '#1565c0' },

  // Package
  lock: { icon: <ExtBadge text="LCK" bg="#6d8086" />, color: '#6d8086' },

  // Binary
  bin: { icon: <ExtBadge text="BIN" bg="#333" />, color: '#333' },
  exe: { icon: <ExtBadge text="EXE" bg="#333" />, color: '#333' },
  so: { icon: <ExtBadge text="SO" bg="#333" />, color: '#333' },
  dll: { icon: <ExtBadge text="DLL" bg="#333" />, color: '#333' },
  o: { icon: <ExtBadge text="O" bg="#333" />, color: '#333' },
  a: { icon: <ExtBadge text="A" bg="#333" />, color: '#333' },
  wasm: { icon: <ExtBadge text="WSM" bg="#654ff0" />, color: '#654ff0' },
};

/* ── Special-filename map ─────────────────────────────────── */

const SPECIAL_FILES: Record<string, ReactNode> = {
  dockerfile: SvgDocker,
  'docker-compose.yml': SvgDocker,
  'docker-compose.yaml': SvgDocker,
  '.gitignore': <ExtBadge text="GIT" bg="#f05032" />,
  '.gitmodules': <ExtBadge text="GIT" bg="#f05032" />,
  '.gitattributes': <ExtBadge text="GIT" bg="#f05032" />,
  makefile: <ExtBadge text="MK" bg="#427819" />,
  'package.json': SvgJson,
  'tsconfig.json': SvgTs,
  'go.mod': SvgGo,
  'go.sum': SvgGo,
  'cargo.toml': SvgRust,
  'cargo.lock': SvgRust,
  'requirements.txt': SvgPy,
  license: <ExtBadge text="LIC" bg="#97ca00" fg="#000" />,
  'license.md': <ExtBadge text="LIC" bg="#97ca00" fg="#000" />,
  readme: <ExtBadge text="RM" bg="#083fa1" />,
  'readme.md': SvgMd,
  'nginx.conf': <ExtBadge text="NGX" bg="#009639" />,
};

/* ── getFileIcon ──────────────────────────────────────────── */

function getFileIcon(file: FileItem): ReactNode {
  if (file.is_dir) {
    return <FolderFilled style={{ color: '#f5c542' }} />;
  }

  const lower = file.name.toLowerCase();

  // Check special filenames first
  const special = SPECIAL_FILES[lower];
  if (special) return special;

  // Extract extension
  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx > 0 ? lower.slice(dotIdx + 1) : '';

  if (ext && EXT_ICON_MAP[ext]) {
    return EXT_ICON_MAP[ext].icon;
  }

  // Default
  return <FileOutlined style={{ color: '#4096ff' }} />;
}

/* ── Exports ──────────────────────────────────────────────── */

export { ExtBadge, EXT_ICON_MAP, getFileIcon };
export default getFileIcon;

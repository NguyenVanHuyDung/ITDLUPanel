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

const GREEN = '#52c41a';
const GREEN_DARK = '#389e0d';
const BOOKMARK_KEY = 'itdlu_file_bookmarks';
const PAGE_SIZE_KEY = 'itdlu_file_page_size';
const DEFAULT_BOOKMARKS: Bookmark[] = [
  { path: '/www', label: 'www' },
  { path: '/root', label: 'root' },
  { path: '/var/log', label: 'log' },
];

const EXT_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  html: { icon: <Html5Outlined />, color: '#e44d26' },
  htm: { icon: <Html5Outlined />, color: '#e44d26' },
  js: { icon: <FileTextOutlined />, color: '#f7df1e' },
  jsx: { icon: <FileTextOutlined />, color: '#f7df1e' },
  ts: { icon: <FileTextOutlined />, color: '#3178c6' },
  tsx: { icon: <FileTextOutlined />, color: '#3178c6' },
  css: { icon: <FileTextOutlined />, color: '#264de4' },
  scss: { icon: <FileTextOutlined />, color: '#c6538c' },
  less: { icon: <FileTextOutlined />, color: '#1d365d' },
  php: { icon: <CodeOutlined />, color: '#777bb4' },
  py: { icon: <CodeOutlined />, color: '#3572a5' },
  go: { icon: <CodeOutlined />, color: '#00add8' },
  rs: { icon: <CodeOutlined />, color: '#dea584' },
  java: { icon: <CodeOutlined />, color: '#b07219' },
  rb: { icon: <CodeOutlined />, color: '#cc342d' },
  sh: { icon: <CodeOutlined />, color: '#89e051' },
  bash: { icon: <CodeOutlined />, color: '#89e051' },
  json: { icon: <FileTextOutlined />, color: '#a0a0a0' },
  yaml: { icon: <FileTextOutlined />, color: '#cb171e' },
  yml: { icon: <FileTextOutlined />, color: '#cb171e' },
  xml: { icon: <FileTextOutlined />, color: '#e44d26' },
  toml: { icon: <FileTextOutlined />, color: '#9c4221' },
  ini: { icon: <FileTextOutlined />, color: '#a0a0a0' },
  conf: { icon: <FileTextOutlined />, color: '#a0a0a0' },
  cfg: { icon: <FileTextOutlined />, color: '#a0a0a0' },
  env: { icon: <FileTextOutlined />, color: '#ecd53f' },
  md: { icon: <FileTextOutlined />, color: '#083fa1' },
  txt: { icon: <FileTextOutlined />, color: '#666' },
  log: { icon: <FileTextOutlined />, color: '#999' },
  jpg: { icon: <FileImageOutlined />, color: '#e91e63' },
  jpeg: { icon: <FileImageOutlined />, color: '#e91e63' },
  png: { icon: <FileImageOutlined />, color: '#e91e63' },
  gif: { icon: <FileImageOutlined />, color: '#e91e63' },
  svg: { icon: <FileImageOutlined />, color: '#ff9800' },
  ico: { icon: <FileImageOutlined />, color: '#e91e63' },
  webp: { icon: <FileImageOutlined />, color: '#e91e63' },
  bmp: { icon: <FileImageOutlined />, color: '#e91e63' },
  zip: { icon: <FileZipOutlined />, color: '#795548' },
  tar: { icon: <FileZipOutlined />, color: '#795548' },
  gz: { icon: <FileZipOutlined />, color: '#795548' },
  bz2: { icon: <FileZipOutlined />, color: '#795548' },
  xz: { icon: <FileZipOutlined />, color: '#795548' },
  rar: { icon: <FileZipOutlined />, color: '#795548' },
  '7z': { icon: <FileZipOutlined />, color: '#795548' },
  pdf: { icon: <FilePdfOutlined />, color: '#f44336' },
  sql: { icon: <CodeOutlined />, color: '#e38c00' },
  db: { icon: <CodeOutlined />, color: '#e38c00' },
  sqlite: { icon: <CodeOutlined />, color: '#e38c00' },
};

/* ──────────────── Helpers ──────────────── */

function getFileIcon(file: FileItem): React.ReactNode {
  if (file.is_dir) {
    return <FolderFilled style={{ color: '#faad14', fontSize: 18 }} />;
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const mapping = EXT_ICON_MAP[ext];
  if (mapping) {
    return <span style={{ color: mapping.color, fontSize: 16 }}>{mapping.icon}</span>;
  }
  return <FileOutlined style={{ color: '#1565C0', fontSize: 16 }} />;
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
          <span style={{ fontWeight: record.is_dir ? 500 : 400, color: record.is_dir ? '#333' : '#555' }}>
            {name}
            {record.is_symlink && <span style={{ color: '#999', fontSize: 12, marginLeft: 4 }}>→ {record.link_target}</span>}
          </span>
        </Space>
      ),
    },
    {
      title: 'PMSN/Owner',
      width: 140,
      render: (_, record) => (
        <span
          style={{ cursor: 'pointer', color: GREEN }}
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
        record.is_dir ? <span style={{ color: GREEN, cursor: 'pointer' }}>-</span> : formatSize(size),
    },
    {
      title: 'Modified',
      dataIndex: 'mod_time',
      width: 180,
      sorter: (a, b) => new Date(a.mod_time).getTime() - new Date(b.mod_time).getTime(),
      render: (v: string) => <span style={{ color: '#888', fontSize: 13 }}>{formatDate(v)}</span>,
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>

      {/* ═══ 1. Quick-Access Tab Bar ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', background: '#f0faf0', borderBottom: '1px solid #e0e0e0',
        padding: '6px 12px', gap: 4, minHeight: 42,
      }}>
        <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => scrollBookmarks('left')}
          style={{ flexShrink: 0, color: GREEN_DARK }} />
        <div ref={bookmarkBarRef} style={{
          display: 'flex', gap: 4, overflow: 'hidden', flex: 1, scrollBehavior: 'smooth',
        }}>
          {bookmarks.map(bm => (
            <div key={bm.path} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              background: currentPath === bm.path ? GREEN : '#e8f5e9',
              color: currentPath === bm.path ? '#fff' : '#333',
              fontSize: 13, transition: 'all 0.2s',
            }}
              onClick={() => navigateTo(bm.path)}
            >
              <FolderFilled style={{ fontSize: 13, color: currentPath === bm.path ? '#fff' : GREEN }} />
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{bm.label}</span>
              <CloseOutlined
                style={{ fontSize: 10, opacity: 0.6 }}
                onClick={(e) => { e.stopPropagation(); removeBookmark(bm.path); }}
              />
            </div>
          ))}
        </div>
        <Button type="text" size="small" icon={<RightOutlined />} onClick={() => scrollBookmarks('right')}
          style={{ flexShrink: 0, color: GREEN_DARK }} />
        <Tooltip title="Bookmark current folder">
          <Button type="text" size="small" icon={<StarOutlined />} onClick={addBookmark}
            style={{ flexShrink: 0, color: GREEN_DARK }} />
        </Tooltip>
      </div>

      {/* ═══ 2. Breadcrumb Navigation Row ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 12px',
        borderBottom: '1px solid #f0f0f0', gap: 8, background: '#fafafa',
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
            style={{ cursor: 'pointer', color: GREEN, fontWeight: 500 }}
            onClick={() => navigateTo('/')}
          >
            <HomeOutlined /> Root
          </span>
          {pathSegments.map((seg, i) => {
            const fullPath = '/' + pathSegments.slice(0, i + 1).join('/');
            const isLast = i === pathSegments.length - 1;
            return (
              <span key={fullPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#ccc' }}>/</span>
                <span
                  style={{ cursor: 'pointer', color: isLast ? '#333' : GREEN, fontWeight: isLast ? 600 : 400 }}
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
        padding: '8px 12px', borderBottom: '1px solid #f0f0f0', gap: 8, flexWrap: 'wrap',
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
            <Button size="small" icon={<UploadOutlined />} style={{ background: GREEN, color: '#fff', border: 'none' }}>
              {t('common.upload')}
            </Button>
          </Upload>

          <Dropdown menu={{ items: newMenuItems }} trigger={['click']}>
            <Button size="small" icon={<FileAddOutlined />}>New ▾</Button>
          </Dropdown>

          <Button size="small" icon={<SearchOutlined />}
            type={searchVisible ? 'primary' : 'default'}
            onClick={() => { setSearchVisible(!searchVisible); if (searchVisible) clearSearch(); }}
            style={searchVisible ? { background: GREEN, borderColor: GREEN } : {}}
          >
            {t('common.search')}
          </Button>

          <Button size="small" icon={<CodeOutlined />}
            onClick={() => { window.open('/terminal', '_blank'); }}
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
              style={showHidden ? { background: GREEN, borderColor: GREEN } : {}}
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
              style={viewMode === 'list' ? { background: GREEN, borderColor: GREEN } : {}} />
          </Tooltip>
          <Tooltip title="Grid view">
            <Button type={viewMode === 'grid' ? 'primary' : 'default'} size="small"
              icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')}
              style={viewMode === 'grid' ? { background: GREEN, borderColor: GREEN } : {}} />
          </Tooltip>
        </Space>
      </div>

      {/* ═══ 4. Search Bar (conditional) ═══ */}
      {searchVisible && (
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 12px',
          borderBottom: '1px solid #f0f0f0', gap: 8, background: '#fafafa',
        }}>
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={handleSearch}
            style={{ maxWidth: 400 }}
            size="small"
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            allowClear
          />
          <Button size="small" type="primary" loading={searchLoading} onClick={handleSearch}
            style={{ background: GREEN, borderColor: GREEN }}>
            {t('common.search')}
          </Button>
          {searchResults && (
            <Button size="small" onClick={clearSearch}>Clear results</Button>
          )}
          {searchResults && (
            <span style={{ fontSize: 12, color: '#888' }}>Found {searchResults.length} result(s)</span>
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
            scroll={{ y: 'calc(100vh - 380px)' }}
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
                  border: selectedRowKeys.includes(file.path) ? `2px solid ${GREEN}` : '2px solid transparent',
                  background: selectedRowKeys.includes(file.path) ? '#f0faf0' : '#fafafa',
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
        padding: '6px 12px', borderTop: '1px solid #e0e0e0', background: '#fafafa',
        fontSize: 13, color: '#666', flexWrap: 'wrap', gap: 8,
      }}>
        <span>
          Total <strong>{dirCount}</strong> director{dirCount !== 1 ? 'ies' : 'y'}, <strong>{fileCount}</strong> file{fileCount !== 1 ? 's' : ''}.
          {' '}File size: <strong style={{ color: GREEN }}>{totalSize > 0 ? formatSize(totalSize) : 'N/A'}</strong>
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
            style={{ width: 110 }}
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

      {/* ═══ Context Menu ═══ */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
            zIndex: 9999, background: '#fff', borderRadius: 8,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)', border: '1px solid #e8e8e8',
            padding: 4, minWidth: 180,
          }}
          onClick={() => setCtxMenu(null)}
        >
          {(getContextMenuItems(ctxMenu.file) ?? []).map((item, idx) => {
            if (!item) return null;
            if ('type' in item && item.type === 'divider') {
              return <div key={`d-${idx}`} style={{ height: 1, background: '#f0f0f0', margin: '4px 0' }} />;
            }
            const menuItem = item as { key: string; icon?: React.ReactNode; label?: React.ReactNode; danger?: boolean; onClick?: () => void };
            return (
              <div
                key={menuItem.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  cursor: 'pointer', borderRadius: 4, fontSize: 13,
                  color: menuItem.danger ? '#ff4d4f' : '#333',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = menuItem.danger ? '#fff2f0' : '#f5f5f5'; }}
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
        width={480}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Permission Code (Octal)</div>
          <Input
            value={permOctal}
            onChange={(e) => handlePermOctalChange(e.target.value)}
            style={{ width: 120, fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }}
            maxLength={3}
          />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e8e8e8' }}></th>
              {permLabels.map(l => (
                <th key={l} style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #e8e8e8', fontSize: 13 }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permGroups.map((group, gi) => (
              <tr key={group}>
                <td style={{ padding: '6px 8px', fontWeight: 500, borderBottom: '1px solid #f0f0f0' }}>{group}</td>
                {[0, 1, 2].map(pi => (
                  <td key={pi} style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #f0f0f0' }}>
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
        <Space style={{ marginBottom: 12 }} size={12}>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Owner</div>
            <Input value={permOwner} onChange={(e) => setPermOwner(e.target.value)} style={{ width: 140 }} size="small" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Group</div>
            <Input value={permGroup} onChange={(e) => setPermGroup(e.target.value)} style={{ width: 140 }} size="small" />
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>Current: {renameFile?.name}</div>
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>In: {currentPath}</div>
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>In: {currentPath}</div>
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>Source: {moveFile?.path}</div>
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>
          {compressPaths.length} item(s) selected
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 4, fontSize: 13 }}>Format:</div>
          <Select value={compressFormat} onChange={setCompressFormat} size="small" style={{ width: 120 }}
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
        okButtonProps={{ style: { background: GREEN, borderColor: GREEN } }}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>File: {decompressPath}</div>
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

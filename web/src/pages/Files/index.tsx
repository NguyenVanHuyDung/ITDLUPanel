import { useState, useMemo, useCallback, useEffect } from 'react';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import api from '@/services/api';

import type { FileItem, ViewMode, ContextMenuState, MoveMode } from './types';
import { PAGE_SIZE_KEY } from './utils/constants';
import { joinPath, getExtension } from './utils/fileHelpers';
import { ARCHIVE_EXTENSIONS } from './utils/constants';
import { usePalette } from './palette';

import { useFileManager } from './hooks/useFileManager';
import { useBookmarks } from './hooks/useBookmarks';
import { useFileSelection } from './hooks/useFileSelection';
import { useDragDrop } from './hooks/useDragDrop';

import BookmarkBar from './components/BookmarkBar';
import BreadcrumbNav from './components/BreadcrumbNav';
import Toolbar from './components/Toolbar';
import SearchBar from './components/SearchBar';
import FileTable from './components/FileTable';
import FileGrid from './components/FileGrid';
import ContextMenu from './components/ContextMenu';
import FooterBar from './components/FooterBar';
import TerminalPopup from './components/TerminalPopup';
import DragDropOverlay from './components/DragDropOverlay';

import RenameModal from './components/modals/RenameModal';
import NewFolderModal from './components/modals/NewFolderModal';
import NewFileModal from './components/modals/NewFileModal';
import PermissionsModal from './components/modals/PermissionsModal';
import CopyMoveModal from './components/modals/CopyMoveModal';
import CompressModal from './components/modals/CompressModal';
import DecompressModal from './components/modals/DecompressModal';
import RemoteDownloadModal from './components/modals/RemoteDownloadModal';

import CodeEditor from './CodeEditor';

/* ──────────────── Helpers ──────────────── */

function loadPageSize(): number {
  try {
    const v = localStorage.getItem(PAGE_SIZE_KEY);
    if (v) return parseInt(v, 10);
  } catch { /* ignore */ }
  return 50;
}

/* ──────────────── Main Component ──────────────── */

export default function Files() {
  // Core hooks
  const fm = useFileManager();
  const bm = useBookmarks();
  const sel = useFileSelection();
  const dd = useDragDrop();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(loadPageSize);

  // UI toggles
  const [searchVisible, setSearchVisible] = useState(false);
  const [termOpen, setTermOpen] = useState(false);

  // Code Editor
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorFiles, setEditorFiles] = useState<string[]>([]);
  const [editorDir, setEditorDir] = useState('');

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  // Modal state
  const [renameFile, setRenameFile] = useState<FileItem | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [permFile, setPermFile] = useState<FileItem | null>(null);
  const [copyMoveFile, setCopyMoveFile] = useState<FileItem | null>(null);
  const [copyMoveMode, setCopyMoveMode] = useState<MoveMode>('copy');
  const [compressPaths, setCompressPaths] = useState<string[]>([]);
  const [compressOpen, setCompressOpen] = useState(false);
  const [decompressPath, setDecompressPath] = useState('');
  const [decompressOpen, setDecompressOpen] = useState(false);
  const [remoteDownloadOpen, setRemoteDownloadOpen] = useState(false);

  // Reset selection & page on navigation
  useEffect(() => {
    sel.clearSelection();
    setCurrentPage(1);
  }, [fm.currentPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed: display files (search results or all files)
  const displayFiles = fm.searchResults ?? fm.allFiles;
  const totalFiles = displayFiles.length;

  const paginatedFiles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayFiles.slice(start, start + pageSize);
  }, [displayFiles, currentPage, pageSize]);

  const dirCount = displayFiles.filter(f => f.is_dir).length;
  const fileCount = displayFiles.filter(f => !f.is_dir).length;
  const totalSize = displayFiles.filter(f => !f.is_dir).reduce((s, f) => s + f.size, 0);

  /* ── File actions ── */

  const handleEdit = useCallback((file: FileItem) => {
    const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
    setEditorDir(dir);
    setEditorFiles(prev => prev.includes(file.path) ? prev : [...prev, file.path]);
    setEditorVisible(true);
  }, []);

  const handleDownload = useCallback(async (file: FileItem) => {
    const hide = message.loading(`Downloading ${file.name}…`, 0);
    try {
      const res = await api.get('/files/download', {
        params: { path: file.path },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success(`Downloaded ${file.name}`);
    } catch {
      message.error('Download failed');
    } finally {
      hide();
    }
  }, []);

  const handleDeleteConfirm = useCallback((paths: string[]) => {
    Modal.confirm({
      title: 'Confirm Delete',
      icon: <ExclamationCircleOutlined />,
      content: `${paths.length} item(s) will be deleted permanently.`,
      okType: 'danger',
      okText: 'Delete',
      cancelText: 'Cancel',
      onOk: async () => {
        await fm.handleDelete(paths);
        sel.clearSelection();
      },
    });
  }, [fm, sel]);

  const copyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    message.success('Path copied');
  }, []);

  /* ── Context menu / action dispatcher ── */

  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  const handleAction = useCallback((action: string, file: FileItem) => {
    switch (action) {
      case 'open':
        fm.navigateTo(file.path);
        break;
      case 'edit':
        handleEdit(file);
        break;
      case 'download':
        handleDownload(file);
        break;
      case 'rename':
        setRenameFile(file);
        break;
      case 'copy':
        setCopyMoveFile(file);
        setCopyMoveMode('copy');
        break;
      case 'move':
        setCopyMoveFile(file);
        setCopyMoveMode('move');
        break;
      case 'compress':
        setCompressPaths([file.path]);
        setCompressOpen(true);
        break;
      case 'decompress':
        setDecompressPath(file.path);
        setDecompressOpen(true);
        break;
      case 'permissions':
        setPermFile(file);
        break;
      case 'copy-path':
        copyPath(file.path);
        break;
      case 'delete':
        handleDeleteConfirm([file.path]);
        break;
    }
  }, [fm, handleEdit, handleDownload, handleDeleteConfirm, copyPath]);

  /* ── Bulk actions ── */

  const handleBulkDelete = useCallback(() => {
    handleDeleteConfirm(sel.selectedKeys as string[]);
  }, [handleDeleteConfirm, sel.selectedKeys]);

  const handleBulkCompress = useCallback(() => {
    setCompressPaths(sel.selectedKeys as string[]);
    setCompressOpen(true);
  }, [sel.selectedKeys]);

  /* ── Search toggle ── */

  const toggleSearch = useCallback(() => {
    setSearchVisible(prev => {
      if (prev) fm.clearSearch();
      return !prev;
    });
  }, [fm]);

  /* ── Page size change ── */

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  }, []);

  /* ── Remote download placeholder ── */

  const handleRemoteDownload = useCallback(async (url: string, dest: string, filename: string) => {
    try {
      await import('@/services/api').then(({ default: api }) =>
        api.post('/files/remote-download', { url, dest, filename })
      );
      message.success('Remote download started');
      fm.fetchFiles(fm.currentPath);
    } catch {
      message.error('Remote download failed');
    }
    setRemoteDownloadOpen(false);
  }, [fm]);

  /* ── Drag & drop upload ── */

  const handleDrop = useCallback((e: React.DragEvent) => {
    dd.handleDrop(e, fm.handleUpload);
  }, [dd, fm.handleUpload]);

  /* ── Default compress destination ── */
  const compressDefaultDest = useMemo(() => {
    if (compressPaths.length === 0) return '';
    const firstName = compressPaths[0].split('/').pop() || 'archive';
    return joinPath(fm.currentPath, `${firstName}.zip`);
  }, [compressPaths, fm.currentPath]);

  /* ────────── RENDER ────────── */

  const { p, isDark } = usePalette();

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
        background: p.card, borderRadius: 12,
        border: `1px solid ${p.cardBorder}`,
        boxShadow: isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onDragEnter={dd.handleDragEnter}
      onDragLeave={dd.handleDragLeave}
      onDragOver={dd.handleDragOver}
      onDrop={handleDrop}
    >
      {/* 1. Bookmark Bar */}
      <BookmarkBar
        bookmarks={bm.bookmarks}
        currentPath={fm.currentPath}
        onNavigate={fm.navigateTo}
        onAdd={() => bm.addBookmark(fm.currentPath)}
        onRemove={bm.removeBookmark}
      />

      {/* 2. Breadcrumb Navigation */}
      <BreadcrumbNav
        currentPath={fm.currentPath}
        loading={fm.loading}
        canGoBack={fm.historyIndex > 0}
        canGoForward={fm.historyIndex < fm.history.length - 1}
        onNavigate={fm.navigateTo}
        onGoBack={fm.goBack}
        onGoForward={fm.goForward}
        onRefresh={() => fm.fetchFiles(fm.currentPath)}
      />

      {/* 3. Toolbar */}
      <Toolbar
        viewMode={viewMode}
        showHidden={fm.showHidden}
        searchVisible={searchVisible}
        termOpen={termOpen}
        selectedCount={sel.selectedKeys.length}
        onViewModeChange={setViewMode}
        onToggleHidden={fm.toggleHidden}
        onToggleSearch={toggleSearch}
        onToggleTerminal={() => setTermOpen(prev => !prev)}
        onGoRoot={() => fm.navigateTo('/')}
        onNewFolder={() => setNewFolderOpen(true)}
        onNewFile={() => setNewFileOpen(true)}
        onUpload={fm.handleUpload}
        onBulkDelete={handleBulkDelete}
        onBulkCompress={handleBulkCompress}
        onRemoteDownload={() => setRemoteDownloadOpen(true)}
      />

      {/* 4. Search Bar */}
      <SearchBar
        visible={searchVisible}
        loading={fm.searchLoading}
        resultCount={fm.searchResults ? fm.searchResults.length : null}
        onSearch={fm.handleSearch}
        onClear={fm.clearSearch}
      />

      {/* 5. File Table / Grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {viewMode === 'list' ? (
          <FileTable
            files={paginatedFiles}
            loading={fm.loading}
            selectedKeys={sel.selectedKeys}
            onSelectChange={sel.setSelectedKeys}
            onNavigate={fm.navigateTo}
            onEdit={handleEdit}
            onDownload={handleDownload}
            onContextMenu={handleContextMenu}
            onAction={handleAction}
          />
        ) : (
          <FileGrid
            files={paginatedFiles}
            selectedKeys={sel.selectedKeys}
            onSelectChange={sel.setSelectedKeys}
            onNavigate={fm.navigateTo}
            onEdit={handleEdit}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {/* 6. Footer Bar */}
      <FooterBar
        dirCount={dirCount}
        fileCount={fileCount}
        totalSize={totalSize}
        currentPage={currentPage}
        pageSize={pageSize}
        total={totalFiles}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* ═══ Floating Overlays ═══ */}

      {/* Drag & Drop Overlay */}
      <DragDropOverlay isDragging={dd.isDragging} />

      {/* Context Menu */}
      <ContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onAction={handleAction}
      />

      {/* Terminal Popup — opens at currentPath */}
      <TerminalPopup
        open={termOpen}
        currentPath={fm.currentPath}
        onClose={() => setTermOpen(false)}
      />

      {/* Code Editor */}
      <CodeEditor
        visible={editorVisible}
        initialFiles={editorFiles}
        initialDir={editorDir}
        onClose={() => { setEditorVisible(false); setEditorFiles([]); }}
      />

      {/* ═══ Modals ═══ */}

      <RenameModal
        open={!!renameFile}
        file={renameFile}
        onOk={async (oldPath, newPath) => {
          await fm.handleRename(oldPath, newPath);
          setRenameFile(null);
        }}
        onCancel={() => setRenameFile(null)}
      />

      <NewFolderModal
        open={newFolderOpen}
        currentPath={fm.currentPath}
        onOk={async (name) => {
          await fm.handleNewFolder(name);
          setNewFolderOpen(false);
        }}
        onCancel={() => setNewFolderOpen(false)}
      />

      <NewFileModal
        open={newFileOpen}
        currentPath={fm.currentPath}
        onOk={async (name) => {
          await fm.handleNewFile(name);
          setNewFileOpen(false);
        }}
        onCancel={() => setNewFileOpen(false)}
      />

      <PermissionsModal
        open={!!permFile}
        file={permFile}
        onOk={async ({ path, mode, owner, group, recursive }) => {
          await fm.handleSavePermissions(path, mode, recursive);
          if (owner || group) {
            await fm.handleSaveOwner(path, owner, group, recursive);
          }
          setPermFile(null);
        }}
        onCancel={() => setPermFile(null)}
      />

      <CopyMoveModal
        open={!!copyMoveFile}
        file={copyMoveFile}
        mode={copyMoveMode}
        onOk={async (src, dst) => {
          if (copyMoveMode === 'copy') await fm.handleCopy(src, dst);
          else await fm.handleMove(src, dst);
          setCopyMoveFile(null);
        }}
        onCancel={() => setCopyMoveFile(null)}
      />

      <CompressModal
        open={compressOpen}
        paths={compressPaths}
        defaultDest={compressDefaultDest}
        onOk={async (paths, dest, format) => {
          await fm.handleCompress(paths, dest, format);
          setCompressOpen(false);
          setCompressPaths([]);
        }}
        onCancel={() => { setCompressOpen(false); setCompressPaths([]); }}
      />

      <DecompressModal
        open={decompressOpen}
        archivePath={decompressPath}
        defaultDest={fm.currentPath}
        onOk={async (path, dest) => {
          await fm.handleDecompress(path, dest);
          setDecompressOpen(false);
        }}
        onCancel={() => setDecompressOpen(false)}
      />

      <RemoteDownloadModal
        open={remoteDownloadOpen}
        currentPath={fm.currentPath}
        onOk={handleRemoteDownload}
        onCancel={() => setRemoteDownloadOpen(false)}
      />
    </div>
  );
}

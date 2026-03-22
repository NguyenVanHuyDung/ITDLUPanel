import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import api from '@/services/api';
import type { ApiResponse } from '@/types';
import type { FileItem } from '../types';
import { joinPath } from '../utils/fileHelpers';

export function useFileManager() {
  const [currentPath, setCurrentPath] = useState('/root');
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [history, setHistory] = useState<string[]>(['/root']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setSearchResults(null);
    setSearchQuery('');
    try {
      const res = await api.get<ApiResponse<{ path: string; items: FileItem[] }>>('/files', {
        params: { path, show_hidden: showHidden },
      });
      const files = res.data.data?.items ?? [];
      files.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setAllFiles(files);
      setCurrentPath(path);
    } catch {
      message.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  const navigateTo = useCallback((path: string) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(path);
      return next;
    });
    setHistoryIndex(prev => prev + 1);
    fetchFiles(path);
  }, [fetchFiles, historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    fetchFiles(history[newIndex]);
  }, [fetchFiles, history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    fetchFiles(history[newIndex]);
  }, [fetchFiles, history, historyIndex]);

  const toggleHidden = useCallback(() => {
    setShowHidden(prev => !prev);
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await api.get<ApiResponse<{ items: FileItem[] }>>('/files/search', {
        params: { path: currentPath, pattern: query },
      });
      setSearchResults(res.data.data?.items ?? []);
    } catch {
      message.error('Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [currentPath]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  const handleDelete = useCallback(async (paths: string[]) => {
    try {
      await api.delete('/files', { data: { paths } });
      message.success('Deleted successfully');
      await fetchFiles(currentPath);
    } catch {
      message.error('Delete failed');
    }
  }, [fetchFiles, currentPath]);

  const handleRename = useCallback(async (oldPath: string, newPath: string) => {
    try {
      await api.post('/files/rename', { old_path: oldPath, new_path: newPath });
      message.success('Renamed successfully');
      await fetchFiles(currentPath);
    } catch {
      message.error('Rename failed');
    }
  }, [fetchFiles, currentPath]);

  const handleNewFolder = useCallback(async (name: string) => {
    try {
      await api.post('/files/mkdir', { path: joinPath(currentPath, name) });
      message.success('Folder created');
      await fetchFiles(currentPath);
    } catch {
      message.error('Failed to create folder');
    }
  }, [fetchFiles, currentPath]);

  const handleNewFile = useCallback(async (name: string) => {
    try {
      await api.post('/files/create', { path: joinPath(currentPath, name) });
      message.success('File created');
      await fetchFiles(currentPath);
    } catch {
      message.error('Failed to create file');
    }
  }, [fetchFiles, currentPath]);

  const handleCopy = useCallback(async (src: string, dst: string) => {
    try {
      await api.post('/files/copy', { src, dst });
      message.success('Copied successfully');
      await fetchFiles(currentPath);
    } catch {
      message.error('Copy failed');
    }
  }, [fetchFiles, currentPath]);

  const handleMove = useCallback(async (src: string, dst: string) => {
    try {
      await api.post('/files/move', { src, dst });
      message.success('Moved successfully');
      await fetchFiles(currentPath);
    } catch {
      message.error('Move failed');
    }
  }, [fetchFiles, currentPath]);

  const handleCompress = useCallback(async (paths: string[], dest: string, format: string) => {
    try {
      await api.post('/files/compress', { paths, dest, format });
      message.success('Compressed successfully');
      await fetchFiles(currentPath);
    } catch {
      message.error('Compress failed');
    }
  }, [fetchFiles, currentPath]);

  const handleDecompress = useCallback(async (path: string, dest: string) => {
    try {
      await api.post('/files/decompress', { path, dest });
      message.success('Decompressed successfully');
      await fetchFiles(currentPath);
    } catch {
      message.error('Decompress failed');
    }
  }, [fetchFiles, currentPath]);

  const handleSavePermissions = useCallback(async (path: string, mode: string, recursive: boolean) => {
    try {
      await api.put('/files/permissions', { path, mode, recursive });
      message.success('Permissions updated');
      await fetchFiles(currentPath);
    } catch {
      message.error('Failed to update permissions');
    }
  }, [fetchFiles, currentPath]);

  const handleSaveOwner = useCallback(async (
    path: string, owner: string, group: string, recursive: boolean,
  ) => {
    try {
      await api.put('/files/owner', { path, owner, group, recursive });
      message.success('Owner updated');
      await fetchFiles(currentPath);
    } catch {
      message.error('Failed to update owner');
    }
  }, [fetchFiles, currentPath]);

  const handleUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/files/upload', formData, {
        params: { path: currentPath },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success(`Uploaded ${file.name}`);
      await fetchFiles(currentPath);
    } catch {
      message.error(`Failed to upload ${file.name}`);
    }
  }, [fetchFiles, currentPath]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    currentPath,
    allFiles,
    loading,
    showHidden,
    history,
    historyIndex,
    searchQuery,
    searchResults,
    searchLoading,
    fetchFiles,
    navigateTo,
    goBack,
    goForward,
    toggleHidden,
    handleSearch,
    clearSearch,
    handleDelete,
    handleRename,
    handleNewFolder,
    handleNewFile,
    handleCopy,
    handleMove,
    handleCompress,
    handleDecompress,
    handleSavePermissions,
    handleSaveOwner,
    handleUpload,
  };
}

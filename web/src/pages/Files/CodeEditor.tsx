import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as monacoType from 'monaco-editor';
import '@/lib/monaco-setup';
import { Tree, Dropdown, Tooltip, Input, Modal, message, Spin } from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  SearchOutlined,
  FontSizeOutlined,
  BgColorsOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  FileOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  SwapOutlined,
  ColumnHeightOutlined,
  BlockOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import type { ApiResponse } from '@/types';

// ─── Types ────────────────────────────────────────────────────────

interface CodeEditorProps {
  initialFiles?: string[];
  onClose?: () => void;
  visible: boolean;
  initialDir?: string;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  language: string;
  isModified: boolean;
}

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mod_time: string;
}

interface DirTreeNode {
  title: string;
  key: string;
  isLeaf: boolean;
  icon?: React.ReactNode;
  children?: DirTreeNode[];
}

interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EditorSettings {
  wordWrap: 'on' | 'off';
  minimap: boolean;
  tabSize: number;
}

interface CursorPosition {
  line: number;
  column: number;
}

// ─── Constants ────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  py: 'python', rb: 'ruby', php: 'php', go: 'go',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', md: 'markdown', txt: 'plaintext',
  conf: 'ini', cfg: 'ini', ini: 'ini', env: 'shell',
  dockerfile: 'dockerfile', nginx: 'nginx',
  c: 'c', cpp: 'cpp', h: 'c', java: 'java',
  rs: 'rust', lua: 'lua', swift: 'swift',
};

const FONT_SIZES = [12, 14, 16, 18, 20];
const TAB_SIZES = [2, 4, 8];

const TITLE_BAR_H = 36;
const TOOLBAR_H = 38;
const TAB_BAR_H = 34;
const STATUS_BAR_H = 26;
const DEFAULT_SIDEBAR_W = 250;
const MIN_SIDEBAR_W = 160;
const MAX_SIDEBAR_W = 500;

// ─── Helpers ──────────────────────────────────────────────────────

function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  return EXT_TO_LANG[ext] || 'plaintext';
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

function parentDir(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

function fileIcon(name: string, isDir: boolean): React.ReactNode {
  if (isDir) return <FolderOutlined style={{ color: '#e8a838' }} />;
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'php'];
  if (codeExts.includes(ext)) return <FileTextOutlined style={{ color: '#5b9bd5' }} />;
  return <FileOutlined style={{ color: '#888' }} />;
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p;
  return '...' + p.slice(p.length - maxLen + 3);
}

// ─── Component ────────────────────────────────────────────────────

export default function CodeEditor({ initialFiles, onClose, visible, initialDir }: CodeEditorProps) {
  // Window state
  const defaultRect = useCallback((): WindowRect => ({
    x: Math.round(window.innerWidth * 0.1),
    y: Math.round(window.innerHeight * 0.15),
    w: Math.round(window.innerWidth * 0.8),
    h: Math.round(window.innerHeight * 0.7),
  }), []);

  const [rect, setRect] = useState<WindowRect>(defaultRect);
  const [prevRect, setPrevRect] = useState<WindowRect | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);

  // Editor state
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [settings, setSettings] = useState<EditorSettings>({ wordWrap: 'off', minimap: true, tabSize: 4 });
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });
  const [loading, setLoading] = useState(false);

  // Sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_W);
  const [currentDir, setCurrentDir] = useState(initialDir || '/');
  const [treeData, setTreeData] = useState<DirTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarLoading, setSidebarLoading] = useState(false);

  // Refs
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoType | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const sidebarResizeRef = useRef<{ startX: number; origW: number } | null>(null);
  const initializedRef = useRef(false);

  // Derived
  const activeFile = useMemo(() => openFiles.find(f => f.path === activeFilePath), [openFiles, activeFilePath]);
  const isDark = theme === 'vs-dark';

  // ─── Window Drag ─────────────────────────────────────────────

  const handleTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.x, origY: rect.y };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setRect(prev => ({ ...prev, x: dragRef.current!.origX + dx, y: Math.max(0, dragRef.current!.origY + dy) }));
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [maximized, rect.x, rect.y]);

  // ─── Window Resize ──────────────────────────────────────────

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: rect.w, origH: rect.h };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setRect(prev => ({
        ...prev,
        w: Math.max(600, resizeRef.current!.origW + dw),
        h: Math.max(400, resizeRef.current!.origH + dh),
      }));
    };
    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [maximized, rect.w, rect.h]);

  // ─── Sidebar Resize ─────────────────────────────────────────

  const handleSidebarResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sidebarResizeRef.current = { startX: e.clientX, origW: sidebarWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!sidebarResizeRef.current) return;
      const dx = ev.clientX - sidebarResizeRef.current.startX;
      setSidebarWidth(Math.min(MAX_SIDEBAR_W, Math.max(MIN_SIDEBAR_W, sidebarResizeRef.current.origW + dx)));
    };
    const handleMouseUp = () => {
      sidebarResizeRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  // ─── Window Controls ────────────────────────────────────────

  const handleMinimize = useCallback(() => setMinimized(true), []);
  const handleRestore = useCallback(() => setMinimized(false), []);

  const handleMaximize = useCallback(() => {
    if (maximized) {
      if (prevRect) setRect(prevRect);
      setMaximized(false);
    } else {
      setPrevRect(rect);
      setRect({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
      setMaximized(true);
    }
  }, [maximized, prevRect, rect]);

  const handleClose = useCallback(() => {
    const hasModified = openFiles.some(f => f.isModified);
    if (hasModified) {
      Modal.confirm({
        title: 'Unsaved changes',
        content: 'You have unsaved changes. Close without saving?',
        okText: 'Close',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: () => onClose?.(),
      });
    } else {
      onClose?.();
    }
  }, [openFiles, onClose]);

  // ─── File Operations ────────────────────────────────────────

  const loadFileContent = useCallback(async (filePath: string): Promise<{ content: string; language: string } | null> => {
    try {
      const { data: resp } = await api.get<ApiResponse<{ path: string; content: string }>>('/files/content', {
        params: { path: filePath },
      });
      const content = resp?.data?.content ?? '';
      return { content, language: detectLanguage(filePath) };
    } catch {
      message.error(`Failed to load file: ${fileName(filePath)}`);
      return null;
    }
  }, []);

  const openFile = useCallback(async (filePath: string) => {
    const existing = openFiles.find(f => f.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }
    setLoading(true);
    const result = await loadFileContent(filePath);
    setLoading(false);
    if (!result) return;

    const newFile: OpenFile = {
      path: filePath,
      name: fileName(filePath),
      content: result.content,
      originalContent: result.content,
      language: result.language,
      isModified: false,
    };
    setOpenFiles(prev => [...prev, newFile]);
    setActiveFilePath(filePath);
  }, [openFiles, loadFileContent]);

  const closeFile = useCallback((filePath: string) => {
    const file = openFiles.find(f => f.path === filePath);
    if (file?.isModified) {
      Modal.confirm({
        title: 'Unsaved changes',
        content: `"${file.name}" has unsaved changes. Close without saving?`,
        okText: 'Close',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: () => {
          setOpenFiles(prev => prev.filter(f => f.path !== filePath));
          if (activeFilePath === filePath) {
            const remaining = openFiles.filter(f => f.path !== filePath);
            setActiveFilePath(remaining.length > 0 ? remaining[remaining.length - 1].path : '');
          }
        },
      });
    } else {
      setOpenFiles(prev => prev.filter(f => f.path !== filePath));
      if (activeFilePath === filePath) {
        const remaining = openFiles.filter(f => f.path !== filePath);
        setActiveFilePath(remaining.length > 0 ? remaining[remaining.length - 1].path : '');
      }
    }
  }, [openFiles, activeFilePath]);

  const saveFile = useCallback(async (filePath: string) => {
    const file = openFiles.find(f => f.path === filePath);
    if (!file) return;
    try {
      await api.put<ApiResponse<null>>('/files/content', { path: file.path, content: file.content });
      setOpenFiles(prev => prev.map(f =>
        f.path === filePath ? { ...f, originalContent: f.content, isModified: false } : f
      ));
      message.success(`Saved: ${file.name}`);
    } catch {
      message.error(`Failed to save: ${file.name}`);
    }
  }, [openFiles]);

  const saveAllFiles = useCallback(async () => {
    const modified = openFiles.filter(f => f.isModified);
    if (modified.length === 0) {
      message.info('No files to save');
      return;
    }
    let success = 0;
    for (const file of modified) {
      try {
        await api.put<ApiResponse<null>>('/files/content', { path: file.path, content: file.content });
        setOpenFiles(prev => prev.map(f =>
          f.path === file.path ? { ...f, originalContent: f.content, isModified: false } : f
        ));
        success++;
      } catch {
        message.error(`Failed to save: ${file.name}`);
      }
    }
    if (success > 0) message.success(`Saved ${success} file(s)`);
  }, [openFiles]);

  const refreshFile = useCallback(async () => {
    if (!activeFilePath) return;
    setLoading(true);
    const result = await loadFileContent(activeFilePath);
    setLoading(false);
    if (!result) return;
    setOpenFiles(prev => prev.map(f =>
      f.path === activeFilePath
        ? { ...f, content: result.content, originalContent: result.content, isModified: false }
        : f
    ));
  }, [activeFilePath, loadFileContent]);

  const updateFileContent = useCallback((filePath: string, content: string) => {
    setOpenFiles(prev => prev.map(f => {
      if (f.path !== filePath) return f;
      return { ...f, content, isModified: content !== f.originalContent };
    }));
  }, []);

  // ─── Directory Tree ─────────────────────────────────────────

  const fetchDirectory = useCallback(async (dirPath: string): Promise<DirTreeNode[]> => {
    try {
      const { data: resp } = await api.get<ApiResponse<{ path: string; items: FileItem[] }>>('/files', {
        params: { path: dirPath },
      });
      const items = resp.data.items || [];
      const sorted = [...items].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return sorted.map(item => ({
        title: item.name,
        key: item.path,
        isLeaf: !item.is_dir,
        icon: fileIcon(item.name, item.is_dir),
      }));
    } catch {
      message.error('Failed to load directory');
      return [];
    }
  }, []);

  const loadRootDir = useCallback(async (dirPath: string) => {
    setSidebarLoading(true);
    const nodes = await fetchDirectory(dirPath);
    setTreeData(nodes);
    setExpandedKeys([]);
    setSidebarLoading(false);
  }, [fetchDirectory]);

  const handleTreeLoadData = useCallback(async (node: DirTreeNode) => {
    if (node.children) return;
    const children = await fetchDirectory(node.key);
    setTreeData(prev => {
      const updateChildren = (nodes: DirTreeNode[]): DirTreeNode[] =>
        nodes.map(n => {
          if (n.key === node.key) return { ...n, children };
          if (n.children) return { ...n, children: updateChildren(n.children) };
          return n;
        });
      return updateChildren(prev);
    });
  }, [fetchDirectory]);

  const handleTreeSelect = useCallback((_keys: React.Key[], info: { node: DirTreeNode }) => {
    if (info.node.isLeaf) {
      openFile(info.node.key);
    } else {
      // Toggle expand/collapse when clicking a directory
      setExpandedKeys(prev =>
        prev.includes(info.node.key)
          ? prev.filter(k => k !== info.node.key)
          : [...prev, info.node.key]
      );
    }
  }, [openFile]);

  const handleTreeExpand = useCallback((keys: React.Key[]) => {
    setExpandedKeys(keys as string[]);
  }, []);

  const handleGoBack = useCallback(() => {
    if (currentDir === '/') return;
    const parent = parentDir(currentDir);
    setCurrentDir(parent);
    loadRootDir(parent);
  }, [currentDir, loadRootDir]);

  const handleRefreshSidebar = useCallback(() => {
    loadRootDir(currentDir);
  }, [currentDir, loadRootDir]);

  // ─── Editor Mount ───────────────────────────────────────────

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeFilePath) saveFile(activeFilePath);
    });

    editor.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, column: e.position.column });
    });
  }, [activeFilePath, saveFile]);

  // Update the save command when active file changes
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const disposable = editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeFilePath) saveFile(activeFilePath);
    });

    return () => {
      if (disposable) {
        // Monaco command disposable is void in some versions; safe to ignore
      }
    };
  }, [activeFilePath, saveFile]);

  // ─── Toolbar Actions ────────────────────────────────────────

  const triggerFind = useCallback(() => {
    editorRef.current?.getAction('actions.find')?.run();
  }, []);

  const triggerReplace = useCallback(() => {
    editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run();
  }, []);

  const triggerGoToLine = useCallback(() => {
    editorRef.current?.getAction('editor.action.gotoLine')?.run();
  }, []);

  // ─── Initialize ─────────────────────────────────────────────

  useEffect(() => {
    if (!visible || initializedRef.current) return;
    initializedRef.current = true;
    setRect(defaultRect());

    const dir = initialDir || (initialFiles?.length ? parentDir(initialFiles[0]) : '/');
    setCurrentDir(dir);
    loadRootDir(dir);

    if (initialFiles?.length) {
      initialFiles.forEach(f => openFile(f));
    }
  }, [visible, initialDir, initialFiles, defaultRect, loadRootDir, openFile]);

  // Open new files when initialFiles changes while editor is already visible
  useEffect(() => {
    if (!visible || !initializedRef.current) return;
    if (!initialFiles?.length) return;
    initialFiles.forEach(f => {
      if (!openFiles.find(of => of.path === f)) {
        openFile(f);
      }
    });
  }, [initialFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on hide
  useEffect(() => {
    if (!visible) {
      initializedRef.current = false;
      setOpenFiles([]);
      setActiveFilePath('');
      setMinimized(false);
      setMaximized(false);
      setTreeData([]);
      setExpandedKeys([]);
    }
  }, [visible]);

  // ─── Filtered tree ──────────────────────────────────────────

  const filteredTreeData = useMemo(() => {
    if (!sidebarSearch.trim()) return treeData;
    const q = sidebarSearch.toLowerCase();
    const filterNodes = (nodes: DirTreeNode[]): DirTreeNode[] =>
      nodes.reduce<DirTreeNode[]>((acc, node) => {
        if (node.title.toLowerCase().includes(q)) {
          acc.push(node);
        } else if (node.children) {
          const filtered = filterNodes(node.children);
          if (filtered.length > 0) acc.push({ ...node, children: filtered });
        }
        return acc;
      }, []);
    return filterNodes(treeData);
  }, [treeData, sidebarSearch]);

  // ─── Styles ─────────────────────────────────────────────────

  const darkBg = '#1e1e1e';
  const darkBg2 = '#252526';
  const darkBg3 = '#2d2d2d';
  const darkBorder = '#3e3e3e';
  const lightBg = '#ffffff';
  const lightBg2 = '#f3f3f3';
  const lightBorder = '#d4d4d4';

  const bgColor = isDark ? darkBg : lightBg;
  const bg2Color = isDark ? darkBg2 : lightBg2;
  const bg3Color = isDark ? darkBg3 : '#e8e8e8';
  const borderColor = isDark ? darkBorder : lightBorder;
  const textColor = isDark ? '#cccccc' : '#333333';
  const textMuted = isDark ? '#858585' : '#999999';
  const accentColor = '#4ec9b0';

  if (!visible) return null;

  // ─── Minimized Bar ──────────────────────────────────────────

  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed', left: 8, bottom: 8, zIndex: 1001,
          background: darkBg3, color: '#fff', borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          fontSize: 13,
        }}
        onClick={handleRestore}
      >
        <FileTextOutlined />
        <span>Online text editor</span>
        <span style={{ marginLeft: 8, opacity: 0.6 }}>
          {openFiles.length} file(s)
        </span>
      </div>
    );
  }

  // ─── Toolbar Buttons ────────────────────────────────────────

  const toolbarBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 10px', cursor: 'pointer', border: 'none',
    background: 'transparent', color: textColor, fontSize: 12,
    borderRadius: 3, whiteSpace: 'nowrap',
  };
  const toolbarBtnHover = isDark ? '#3e3e42' : '#ddd';

  const ToolbarBtn = ({ icon, label, onClick, title }: {
    icon: React.ReactNode; label: string; onClick: () => void; title?: string;
  }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <Tooltip title={title || label} mouseEnterDelay={0.4}>
        <button
          style={{ ...toolbarBtnStyle, background: hovered ? toolbarBtnHover : 'transparent' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={onClick}
        >
          {icon} {label}
        </button>
      </Tooltip>
    );
  };

  // ─── Font Size Dropdown ─────────────────────────────────────

  const fontSizeItems = FONT_SIZES.map(size => ({
    key: String(size),
    label: `${size}px`,
    onClick: () => setFontSize(size),
  }));

  // ─── Settings Dropdown ──────────────────────────────────────

  const settingsItems = [
    {
      key: 'wordWrap',
      label: `Word Wrap: ${settings.wordWrap === 'on' ? 'ON' : 'OFF'}`,
      onClick: () => setSettings(prev => ({ ...prev, wordWrap: prev.wordWrap === 'on' ? 'off' : 'on' })),
    },
    {
      key: 'minimap',
      label: `Minimap: ${settings.minimap ? 'ON' : 'OFF'}`,
      onClick: () => setSettings(prev => ({ ...prev, minimap: !prev.minimap })),
    },
    ...TAB_SIZES.map(size => ({
      key: `tab-${size}`,
      label: `Tab Size: ${size}${settings.tabSize === size ? ' ✓' : ''}`,
      onClick: () => setSettings(prev => ({ ...prev, tabSize: size })),
    })),
  ];

  // ─── Help Modal Content ─────────────────────────────────────

  const showHelp = () => {
    Modal.info({
      title: 'Keyboard Shortcuts',
      width: 420,
      content: (
        <div style={{ fontSize: 13 }}>
          <p><b>Ctrl+S</b> — Save current file</p>
          <p><b>Ctrl+F</b> — Find</p>
          <p><b>Ctrl+H</b> — Find and Replace</p>
          <p><b>Ctrl+G</b> — Go to Line</p>
          <p><b>Ctrl+Z</b> — Undo</p>
          <p><b>Ctrl+Shift+Z</b> — Redo</p>
          <p><b>Ctrl+D</b> — Select next occurrence</p>
          <p><b>Ctrl+/</b> — Toggle comment</p>
          <p><b>Alt+↑/↓</b> — Move line up/down</p>
          <p><b>Ctrl+Shift+K</b> — Delete line</p>
        </div>
      ),
    });
  };

  // ─── Main Window ────────────────────────────────────────────

  const windowStyle: React.CSSProperties = {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    background: bgColor,
    borderRadius: maximized ? 0 : 6,
    boxShadow: maximized ? 'none' : '0 8px 32px rgba(0,0,0,0.45)',
    overflow: 'hidden',
    border: maximized ? 'none' : `1px solid ${borderColor}`,
    userSelect: 'none',
  };

  const editorH = rect.h - TITLE_BAR_H - TOOLBAR_H - TAB_BAR_H - STATUS_BAR_H;

  return (
    <div style={windowStyle}>
      {/* Ant Design Tree dark mode overrides */}
      <style>{`
        .code-editor-tree .ant-tree {
          background: transparent !important;
          color: ${textColor} !important;
        }
        .code-editor-tree .ant-tree-treenode,
        .code-editor-tree .ant-tree-node-content-wrapper,
        .code-editor-tree .ant-tree-title {
          color: ${textColor} !important;
        }
        .code-editor-tree .ant-tree-node-content-wrapper:hover {
          background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'} !important;
        }
        .code-editor-tree .ant-tree-node-selected .ant-tree-node-content-wrapper,
        .code-editor-tree .ant-tree-node-content-wrapper-open,
        .code-editor-tree .ant-tree-node-content-wrapper.ant-tree-node-selected {
          background: ${isDark ? 'rgba(78,201,176,0.12)' : 'rgba(0,120,212,0.1)'} !important;
          color: ${textColor} !important;
        }
        .code-editor-tree .ant-tree-switcher {
          color: ${textMuted} !important;
        }
        .code-editor-tree .ant-tree-indent-unit {
          border-color: ${isDark ? '#3e3e3e' : '#e0e0e0'} !important;
        }
      `}</style>
      {/* ── Title Bar ────────────────────────────────────── */}
      <div
        onMouseDown={handleTitleMouseDown}
        style={{
          height: TITLE_BAR_H, minHeight: TITLE_BAR_H,
          background: darkBg3, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 8px', cursor: maximized ? 'default' : 'move',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
          <FileTextOutlined />
          <span>Online text editor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {([
            { icon: <MinusOutlined style={{ fontSize: 12 }} />, onClick: handleMinimize, title: 'Minimize' },
            { icon: maximized ? <BlockOutlined style={{ fontSize: 12 }} /> : <BorderOutlined style={{ fontSize: 12 }} />, onClick: handleMaximize, title: maximized ? 'Restore' : 'Maximize' },
            { icon: <CloseOutlined style={{ fontSize: 12 }} />, onClick: handleClose, title: 'Close', danger: true },
          ] as const).map((btn, i) => (
            <WinBtn key={i} icon={btn.icon} onClick={btn.onClick} title={btn.title} danger={'danger' in btn && btn.danger} />
          ))}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────── */}
      <div
        style={{
          height: TOOLBAR_H, minHeight: TOOLBAR_H,
          background: bg2Color, borderBottom: `1px solid ${borderColor}`,
          display: 'flex', alignItems: 'center', padding: '0 6px',
          gap: 2, overflowX: 'auto', overflowY: 'hidden',
        }}
      >
        <ToolbarBtn icon={<SaveOutlined />} label="Save" onClick={() => activeFilePath && saveFile(activeFilePath)} title="Save (Ctrl+S)" />
        <ToolbarBtn icon={<SaveOutlined />} label="Save All" onClick={saveAllFiles} title="Save all modified files" />
        <ToolbarBtn icon={<ReloadOutlined />} label="Refresh" onClick={refreshFile} title="Reload file from server" />
        <div style={{ width: 1, height: 18, background: borderColor, margin: '0 4px' }} />
        <ToolbarBtn icon={<SearchOutlined />} label="Search" onClick={triggerFind} title="Find (Ctrl+F)" />
        <ToolbarBtn icon={<SwapOutlined />} label="Replace" onClick={triggerReplace} title="Find and Replace (Ctrl+H)" />
        <ToolbarBtn icon={<ColumnHeightOutlined />} label="JumpLine" onClick={triggerGoToLine} title="Go to Line (Ctrl+G)" />
        <div style={{ width: 1, height: 18, background: borderColor, margin: '0 4px' }} />
        <Dropdown menu={{ items: fontSizeItems }} trigger={['click']}>
          <button style={toolbarBtnStyle}>
            <FontSizeOutlined /> Font ({fontSize})
          </button>
        </Dropdown>
        <ToolbarBtn
          icon={<BgColorsOutlined />}
          label={isDark ? 'Light' : 'Dark'}
          onClick={() => setTheme(prev => prev === 'vs-dark' ? 'light' : 'vs-dark')}
          title="Toggle theme"
        />
        <Dropdown menu={{ items: settingsItems }} trigger={['click']}>
          <button style={toolbarBtnStyle}>
            <SettingOutlined /> Set
          </button>
        </Dropdown>
        <ToolbarBtn icon={<QuestionCircleOutlined />} label="Help" onClick={showHelp} title="Keyboard shortcuts" />
      </div>

      {/* ── Body (sidebar + editor area) ─────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── Sidebar ──────────────────────────────────── */}
        <div
          style={{
            width: sidebarWidth, minWidth: sidebarWidth,
            background: bg2Color, borderRight: `1px solid ${borderColor}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Sidebar header */}
          <div style={{
            padding: '6px 8px', fontSize: 11, color: textMuted,
            borderBottom: `1px solid ${borderColor}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            Directory: {truncatePath(currentDir, 30)}
          </div>

          {/* Sidebar mini-toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px',
            borderBottom: `1px solid ${borderColor}`,
          }}>
            <Tooltip title="Back">
              <button
                onClick={handleGoBack}
                style={{
                  border: 'none', background: 'transparent', color: textColor,
                  cursor: currentDir === '/' ? 'not-allowed' : 'pointer',
                  opacity: currentDir === '/' ? 0.3 : 1, padding: '2px 6px', fontSize: 12,
                }}
                disabled={currentDir === '/'}
              >
                <ArrowLeftOutlined />
              </button>
            </Tooltip>
            <Tooltip title="Refresh">
              <button
                onClick={handleRefreshSidebar}
                style={{ border: 'none', background: 'transparent', color: textColor, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}
              >
                <ReloadOutlined />
              </button>
            </Tooltip>
            <Tooltip title="New file">
              <button
                onClick={() => {
                  Modal.confirm({
                    title: 'New File',
                    content: (
                      <Input
                        placeholder="filename.txt"
                        id="new-file-input"
                        autoFocus
                      />
                    ),
                    onOk: async () => {
                      const input = document.getElementById('new-file-input') as HTMLInputElement | null;
                      const name = input?.value?.trim();
                      if (!name) return;
                      const newPath = `${currentDir === '/' ? '' : currentDir}/${name}`;
                      try {
                        await api.put<ApiResponse<null>>('/files/content', { path: newPath, content: '' });
                        message.success(`Created: ${name}`);
                        handleRefreshSidebar();
                        openFile(newPath);
                      } catch {
                        message.error('Failed to create file');
                      }
                    },
                  });
                }}
                style={{ border: 'none', background: 'transparent', color: textColor, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}
              >
                <PlusOutlined />
              </button>
            </Tooltip>
            <Input
              size="small"
              placeholder="Search..."
              prefix={<SearchOutlined style={{ color: textMuted, fontSize: 11 }} />}
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              allowClear
              style={{ flex: 1, fontSize: 11 }}
            />
          </div>

          {/* Tree view */}
          <div className="code-editor-tree" style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
            {sidebarLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin size="small" /></div>
            ) : (
              <Tree
                showIcon
                treeData={filteredTreeData}
                expandedKeys={expandedKeys}
                onExpand={handleTreeExpand}
                loadData={(node) => handleTreeLoadData(node as unknown as DirTreeNode)}
                onSelect={(keys, info) => handleTreeSelect(keys, info as unknown as { node: DirTreeNode })}
                selectedKeys={activeFilePath ? [activeFilePath] : []}
                switcherIcon={(props: Record<string, unknown>) =>
                  props['expanded'] ? <FolderOpenOutlined style={{ color: '#e8a838' }} /> : null
                }
                style={{
                  background: 'transparent', color: textColor, fontSize: 12,
                }}
              />
            )}
          </div>
        </div>

        {/* ── Sidebar Resize Handle ────────────────────── */}
        <div
          onMouseDown={handleSidebarResizeMouseDown}
          style={{
            width: 4, cursor: 'col-resize', background: 'transparent',
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.target as HTMLDivElement).style.background = accentColor; }}
          onMouseLeave={e => { (e.target as HTMLDivElement).style.background = 'transparent'; }}
        />

        {/* ── Editor Panel ─────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tab bar */}
          <div
            style={{
              height: TAB_BAR_H, minHeight: TAB_BAR_H,
              background: bg2Color, borderBottom: `1px solid ${borderColor}`,
              display: 'flex', alignItems: 'flex-end', overflowX: 'auto', overflowY: 'hidden',
            }}
          >
            {openFiles.map(file => {
              const isActive = file.path === activeFilePath;
              return (
                <div
                  key={file.path}
                  onClick={() => setActiveFilePath(file.path)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '0 12px', height: TAB_BAR_H - 2,
                    background: isActive ? bgColor : 'transparent',
                    borderBottom: isActive ? `2px solid ${accentColor}` : '2px solid transparent',
                    color: isActive ? textColor : textMuted,
                    cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                    borderRight: `1px solid ${borderColor}`,
                    flexShrink: 0,
                  }}
                >
                  {fileIcon(file.name, false)}
                  <span>{file.isModified ? '● ' : ''}{file.name}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); closeFile(file.path); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 3, fontSize: 10,
                      color: textMuted, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.target as HTMLSpanElement).style.background = isDark ? '#444' : '#ccc'; }}
                    onMouseLeave={e => { (e.target as HTMLSpanElement).style.background = 'transparent'; }}
                  >
                    <CloseOutlined />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Monaco Editor */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', userSelect: 'text' }}>
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)', zIndex: 10,
              }}>
                <Spin size="large" />
              </div>
            )}
            {activeFile ? (
              <Editor
                key={activeFile.path}
                height={editorH > 0 ? `${editorH}px` : '100%'}
                theme={theme}
                language={activeFile.language}
                value={activeFile.content}
                onChange={(value) => updateFileContent(activeFile.path, value ?? '')}
                onMount={handleEditorMount}
                options={{
                  fontSize,
                  tabSize: settings.tabSize,
                  wordWrap: settings.wordWrap,
                  minimap: { enabled: settings.minimap },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  renderWhitespace: 'selection',
                  bracketPairColorization: { enabled: true },
                  smoothScrolling: true,
                  cursorSmoothCaretAnimation: 'on',
                  padding: { top: 8 },
                }}
              />
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: textMuted, fontSize: 14,
                flexDirection: 'column', gap: 8,
              }}>
                <FileTextOutlined style={{ fontSize: 48, opacity: 0.3 }} />
                <span>Select a file to edit</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Bar ───────────────────────────────────── */}
      <div
        style={{
          height: STATUS_BAR_H, minHeight: STATUS_BAR_H,
          background: isDark ? '#007acc' : '#0078d4',
          color: '#fff', fontSize: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
          {activeFile ? `Directory: ${activeFile.path}` : 'No file open'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {activeFile && (
            <>
              <span>Ln {cursor.line}, Col {cursor.column}</span>
              <span>Spaces: {settings.tabSize}</span>
              <span>UTF-8</span>
              <span>{activeFile.language}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Corner Resize Handle ─────────────────────────── */}
      {!maximized && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: 'absolute', right: 0, bottom: 0,
            width: 16, height: 16, cursor: 'se-resize',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: 'absolute', right: 1, bottom: 1 }}>
            <path d="M14 14L14 8M14 14L8 14M11 14L14 11" stroke={textMuted} strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Small Sub-components ───────────────────────────────────────

function WinBtn({ icon, onClick, title, danger }: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tooltip title={title} mouseEnterDelay={0.5}>
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 30, height: 24,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', cursor: 'pointer', borderRadius: 3,
          color: '#fff',
          background: hovered ? (danger ? '#e81123' : 'rgba(255,255,255,0.15)') : 'transparent',
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

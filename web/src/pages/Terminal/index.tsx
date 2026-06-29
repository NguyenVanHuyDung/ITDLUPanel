import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  ExpandOutlined, CompressOutlined, PlusOutlined, CloseOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import { Tooltip, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuthStore } from '@/stores/auth';
import type { ITheme } from '@xterm/xterm';

// ── Terminal color themes ──────────────────────────────────────────────
const TERMINAL_THEMES: Record<string, { label: string; theme: ITheme }> = {
  'github-dark': {
    label: '🌑 GitHub Dark',
    theme: {
      background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', cursorAccent: '#0d1117',
      selectionBackground: 'rgba(56, 139, 253, 0.3)', selectionForeground: '#c9d1d9',
      black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
      blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39d353', white: '#b1bac4',
      brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
      brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d364', brightWhite: '#f0f6fc',
    },
  },
  'dracula': {
    label: '🧛 Dracula',
    theme: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36',
      selectionBackground: 'rgba(68, 71, 90, 0.7)', selectionForeground: '#f8f8f2',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
      brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
  },
  'monokai': {
    label: '🎨 Monokai',
    theme: {
      background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', cursorAccent: '#272822',
      selectionBackground: 'rgba(73, 72, 62, 0.7)', selectionForeground: '#f8f8f2',
      black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
      blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
      brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
      brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
    },
  },
  'solarized-dark': {
    label: '☀️ Solarized Dark',
    theme: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1', cursorAccent: '#002b36',
      selectionBackground: 'rgba(7, 54, 66, 0.8)', selectionForeground: '#93a1a1',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
      brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  'nord': {
    label: '❄️ Nord',
    theme: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440',
      selectionBackground: 'rgba(67, 76, 94, 0.7)', selectionForeground: '#eceff4',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
  'tokyo-night': {
    label: '🗼 Tokyo Night',
    theme: {
      background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5', cursorAccent: '#1a1b26',
      selectionBackground: 'rgba(51, 59, 91, 0.7)', selectionForeground: '#c0caf5',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
      brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
    },
  },
  'catppuccin-mocha': {
    label: '🐱 Catppuccin Mocha',
    theme: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', cursorAccent: '#1e1e2e',
      selectionBackground: 'rgba(88, 91, 112, 0.5)', selectionForeground: '#cdd6f4',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
  },
  'one-dark': {
    label: '🌙 One Dark',
    theme: {
      background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', cursorAccent: '#282c34',
      selectionBackground: 'rgba(62, 68, 81, 0.7)', selectionForeground: '#abb2bf',
      black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
      brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
    },
  },
  'gruvbox-dark': {
    label: '🌿 Gruvbox Dark',
    theme: {
      background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', cursorAccent: '#282828',
      selectionBackground: 'rgba(68, 68, 68, 0.7)', selectionForeground: '#ebdbb2',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
      blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
      brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
    },
  },
  'ubuntu': {
    label: '🐧 Ubuntu',
    theme: {
      background: '#300a24', foreground: '#eeeeec', cursor: '#bbbbbb', cursorAccent: '#300a24',
      selectionBackground: 'rgba(238, 238, 236, 0.2)', selectionForeground: '#eeeeec',
      black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
      blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
      brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234', brightYellow: '#fce94f',
      brightBlue: '#729fcf', brightMagenta: '#ad7fa8', brightCyan: '#34e2e2', brightWhite: '#eeeeec',
    },
  },
  'powershell': {
    label: '💙 PowerShell',
    theme: {
      background: '#012456', foreground: '#cccccc', cursor: '#fedba9', cursorAccent: '#012456',
      selectionBackground: 'rgba(254, 219, 169, 0.3)', selectionForeground: '#ffffff',
      black: '#0c0c0c', red: '#c50f1f', green: '#13a10e', yellow: '#c19c00',
      blue: '#0037da', magenta: '#881798', cyan: '#3a96dd', white: '#cccccc',
      brightBlack: '#767676', brightRed: '#e74856', brightGreen: '#16c60c', brightYellow: '#f9f1a5',
      brightBlue: '#3b78ff', brightMagenta: '#b4009e', brightCyan: '#61d6d6', brightWhite: '#f2f2f2',
    },
  },
  'retro-green': {
    label: '💚 Retro Green',
    theme: {
      background: '#0a0a0a', foreground: '#00ff00', cursor: '#00ff00', cursorAccent: '#0a0a0a',
      selectionBackground: 'rgba(0, 255, 0, 0.15)', selectionForeground: '#00ff00',
      black: '#0a0a0a', red: '#ff0000', green: '#00ff00', yellow: '#ffff00',
      blue: '#00bfff', magenta: '#ff00ff', cyan: '#00ffff', white: '#bbbbbb',
      brightBlack: '#555555', brightRed: '#ff5555', brightGreen: '#55ff55', brightYellow: '#ffff55',
      brightBlue: '#55bfff', brightMagenta: '#ff55ff', brightCyan: '#55ffff', brightWhite: '#ffffff',
    },
  },
};

const THEME_STORAGE_KEY = 'itdlu_terminal_theme';

function loadThemeId(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && TERMINAL_THEMES[stored]) return stored;
  } catch { /* ignore */ }
  return 'github-dark';
}

type ConnStatus = 'connecting' | 'connected' | 'disconnected';

interface TabSession {
  id: string;
  label: string;
  term: Terminal | null;
  fitAddon: FitAddon | null;
  ws: WebSocket | null;
  status: ConnStatus;
}

let tabCounter = 0;

export default function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { accessToken } = useAuthStore();
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [fullscreen, setFullscreen] = useState(false);
  const [themeId, setThemeId] = useState<string>(loadThemeId);
  const tabsRef = useRef<TabSession[]>([]);
  const termInstancesRef = useRef<Map<string, Terminal>>(new Map());

  // Keep ref in sync
  tabsRef.current = tabs;

  const currentTheme = TERMINAL_THEMES[themeId]?.theme ?? TERMINAL_THEMES['github-dark'].theme;
  // Store theme in ref so initTab doesn't change when theme switches
  const currentThemeRef = useRef(currentTheme);
  currentThemeRef.current = currentTheme;

  const applyTheme = useCallback((id: string) => {
    const t = TERMINAL_THEMES[id]?.theme;
    if (!t) return;
    setThemeId(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    // Apply to every live Terminal instance and force repaint
    termInstancesRef.current.forEach((term) => {
      term.options.theme = { ...t };
      try { term.refresh(0, term.rows - 1); } catch { /* ignore */ }
    });
    setTimeout(() => {
      const active = tabsRef.current.find(tb => tb.id === activeTabId);
      if (active?.fitAddon) {
        try { active.fitAddon.fit(); } catch { /* ignore */ }
      }
      termInstancesRef.current.get(activeTabId)?.focus();
    }, 50);
  }, [activeTabId]);

  const createSession = useCallback((): TabSession => {
    tabCounter++;
    return {
      id: `tab-${tabCounter}`,
      label: `Local server`,
      term: null,
      fitAddon: null,
      ws: null,
      status: 'connecting',
    };
  }, []);

  const updateTab = useCallback((tabId: string, updates: Partial<TabSession>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  const initTab = useCallback((tab: TabSession, container: HTMLDivElement) => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0,
      lineHeight: 1.2,
      theme: currentThemeRef.current,
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    // Small delay to let the DOM settle before fitting
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/v1/terminal?token=${accessToken}`
    );
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      updateTab(tab.id, { status: 'connected' });
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data);
      }
    };

    ws.onerror = () => {
      updateTab(tab.id, { status: 'disconnected' });
    };

    ws.onclose = () => {
      updateTab(tab.id, { status: 'disconnected' });
      term.write('\r\n\x1b[38;5;241m── Connection closed ──\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    tab.term = term;
    tab.fitAddon = fitAddon;
    tab.ws = ws;
    termInstancesRef.current.set(tab.id, term);
    updateTab(tab.id, { term, fitAddon, ws, status: 'connecting' });
  }, [accessToken, updateTab]);

  // Initialize first tab
  useEffect(() => {
    const firstTab = createSession();
    setTabs([firstTab]);
    setActiveTabId(firstTab.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount active terminal to container
  useEffect(() => {
    if (!termRef.current || !activeTabId) return;
    const container = termRef.current;

    // Clear container
    container.innerHTML = '';

    const tab = tabsRef.current.find(t => t.id === activeTabId);
    if (!tab) return;

    if (!tab.term) {
      // First mount - initialize
      initTab(tab, container);
    } else {
      // Re-attach existing terminal
      tab.term.open(container);
      requestAnimationFrame(() => {
        try { tab.fitAddon?.fit(); } catch { /* ignore */ }
        tab.term?.focus();
      });
    }
  }, [activeTabId, initTab]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const tab = tabsRef.current.find(t => t.id === activeTabId);
      if (tab?.fitAddon) {
        try { tab.fitAddon.fit(); } catch { /* ignore */ }
      }
    };
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (termRef.current) {
      observer = new ResizeObserver(() => {
        const tab = tabsRef.current.find(t => t.id === activeTabId);
        if (tab?.fitAddon) {
          try { tab.fitAddon.fit(); } catch { /* ignore */ }
        }
      });
      observer.observe(termRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [activeTabId]);

  const addTab = useCallback(() => {
    const newTab = createSession();
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [createSession]);

  const closeTab = useCallback((tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (tab) {
      tab.ws?.close();
      tab.term?.dispose();
      termInstancesRef.current.delete(tabId);
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) {
        // Add new tab if all closed
        const newTab = createSession();
        setActiveTabId(newTab.id);
        return [newTab];
      }
      if (tabId === activeTabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeTabId, createSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tabsRef.current.forEach(tab => {
        tab.ws?.close();
        tab.term?.dispose();
      });
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    setFullscreen(prev => !prev);
    // Re-fit after layout change
    setTimeout(() => {
      const tab = tabsRef.current.find(t => t.id === activeTabId);
      if (tab?.fitAddon) {
        try { tab.fitAddon.fit(); } catch { /* ignore */ }
      }
    }, 100);
  }, [activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const statusDot = (status: ConnStatus) => {
    if (status === 'connected') return <CheckCircleOutlined style={{ color: '#3fb950', fontSize: 10 }} />;
    if (status === 'connecting') return <LoadingOutlined spin style={{ color: '#58a6ff', fontSize: 10 }} />;
    return <CloseCircleOutlined style={{ color: '#f85149', fontSize: 10 }} />;
  };

  const containerStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', inset: 0, zIndex: 999, display: 'flex', flexDirection: 'column', background: currentTheme.background }
    : { height: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(128,128,128,0.2)' };

  return (
    <div style={containerStyle}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', background: '#161b22',
        borderBottom: '1px solid #30363d', minHeight: 38,
        padding: '0 4px',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 2 }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className="terminal-tab-item"
                style={{
                  padding: isMobile ? '4px 8px' : '6px 12px',
                  background: isActive ? '#0d1117' : 'transparent',
                  borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
                  borderRadius: '4px 4px 0 0',
                  fontSize: isMobile ? 11 : 12, fontWeight: isActive ? 500 : 400,
                  color: isActive ? '#c9d1d9' : '#8b949e',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
              >
                {statusDot(tab.status)}
                <span className="tab-label">{tab.label}</span>
                {tabs.length > 1 && (
                  <span
                    onClick={(e) => closeTab(tab.id, e)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: isMobile ? 20 : 16, height: isMobile ? 20 : 16, borderRadius: 3, fontSize: 9,
                      color: '#8b949e', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.target as HTMLSpanElement).style.background = '#30363d'; (e.target as HTMLSpanElement).style.color = '#f85149'; }}
                    onMouseLeave={e => { (e.target as HTMLSpanElement).style.background = 'transparent'; (e.target as HTMLSpanElement).style.color = '#8b949e'; }}
                  >
                    <CloseOutlined />
                  </span>
                )}
              </div>
            );
          })}

          {/* Add tab button */}
          <Tooltip title="New terminal">
            <div
              onClick={addTab}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, borderRadius: 4, cursor: 'pointer',
                color: '#8b949e', fontSize: 12, flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#30363d'; (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
            >
              <PlusOutlined />
            </div>
          </Tooltip>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}>
          {activeTab && (
            <span style={{
              fontSize: 11,
              color: activeTab.status === 'connected' ? '#3fb950' : activeTab.status === 'connecting' ? '#58a6ff' : '#f85149',
              padding: '2px 8px',
              background: activeTab.status === 'connected' ? 'rgba(63, 185, 80, 0.1)' : activeTab.status === 'connecting' ? 'rgba(88, 166, 255, 0.1)' : 'rgba(248, 81, 73, 0.1)',
              borderRadius: 10,
              border: `1px solid ${activeTab.status === 'connected' ? 'rgba(63, 185, 80, 0.3)' : activeTab.status === 'connecting' ? 'rgba(88, 166, 255, 0.3)' : 'rgba(248, 81, 73, 0.3)'}`,
            }}>
              {activeTab.status === 'connected' ? '● Connected' : activeTab.status === 'connecting' ? '◌ Connecting...' : '○ Disconnected'}
            </span>
          )}
          {/* Theme selector */}
          <Dropdown
            trigger={['click']}
            menu={{
              items: Object.entries(TERMINAL_THEMES).map(([id, t]) => ({
                key: id,
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      background: t.theme.background as string,
                      border: '1px solid rgba(128,128,128,0.3)',
                    }} />
                    {t.label}
                    {id === themeId && <span style={{ color: '#3fb950', marginLeft: 'auto', fontSize: 10 }}>✓</span>}
                  </span>
                ),
              })),
              onClick: ({ key }: { key: string }) => applyTheme(key),
              style: { maxHeight: 340, overflowY: 'auto' },
            }}
          >
            <Tooltip title="Terminal theme">
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, borderRadius: 4, cursor: 'pointer',
                  color: '#8b949e', fontSize: 14,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,128,128,0.2)'; (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
              >
                <BgColorsOutlined />
              </div>
            </Tooltip>
          </Dropdown>
          <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <div
              onClick={toggleFullscreen}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, borderRadius: 4, cursor: 'pointer',
                color: '#8b949e', fontSize: 14,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(128,128,128,0.2)'; (e.currentTarget as HTMLDivElement).style.color = '#c9d1d9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = '#8b949e'; }}
            >
              {fullscreen ? <CompressOutlined /> : <ExpandOutlined />}
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Terminal area */}
      <div
        ref={termRef}
        style={{
          flex: 1,
          width: '100%',
          overflow: 'hidden',
          backgroundColor: currentTheme.background as string,
          padding: '4px 0 0 4px',
        }}
      />
    </div>
  );
}
